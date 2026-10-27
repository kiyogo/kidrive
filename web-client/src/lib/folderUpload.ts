"use client";

import { api } from "./api";
import { Api } from "./endpoints";
import { isFolder, type NodeModel } from "./models";
import { transfers, type EnqueueUploadItem } from "./upload";

export interface DroppedFileItem {
  file: File;
  /** Relative directory path components from destination, e.g. ["my_folder", "sub1"] */
  relativeDir: string[];
}

export interface FolderUploadPlan {
  files: DroppedFileItem[];
  /** Unique folder paths to create, shallowest first: e.g. [["my_folder"], ["my_folder", "sub1"]] */
  folders: string[][];
}

/** Promisified readEntries with complete batch loop */
async function readAllEntriesFromReader(reader: any): Promise<any[]> {
  const all: any[] = [];
  while (true) {
    const batch: any[] = await new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (!batch || batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

/** Promisified entry.file() */
async function getFileFromEntry(fileEntry: any): Promise<File> {
  return new Promise((resolve, reject) => {
    fileEntry.file(resolve, reject);
  });
}

/**
 * Inspects a drag-and-drop DataTransfer and walks any dropped directories
 * recursively using the standard webkitGetAsEntry API.
 */
export async function planDataTransfer(
  input: DataTransfer | File[] | FileList,
  capturedFiles?: File[],
  capturedEntries?: any[],
): Promise<FolderUploadPlan> {
  const files: DroppedFileItem[] = [];
  const folders: string[][] = [];
  const seenFolders = new Set<string>();

  // Synchronously capture items and files from DataTransfer immediately
  let rawFiles: File[] = capturedFiles || [];
  let entries: any[] = capturedEntries || [];

  if (Array.isArray(input)) {
    rawFiles = input;
  } else if (typeof FileList !== "undefined" && input instanceof FileList) {
    rawFiles = Array.from(input);
  } else if (input && typeof (input as DataTransfer).files !== "undefined") {
    const dt = input as DataTransfer;
    if (rawFiles.length === 0 && dt.files && dt.files.length > 0) {
      rawFiles = Array.from(dt.files);
    }
    if (entries.length === 0 && dt.items && dt.items.length > 0) {
      for (let i = 0; i < dt.items.length; i++) {
        const it = dt.items[i];
        if (it.kind === "file" && typeof it.webkitGetAsEntry === "function") {
          try {
            const entry = it.webkitGetAsEntry();
            if (entry) entries.push(entry);
          } catch {}
        }
      }
    }
  }

  let usedWebkitEntries = false;
  if (entries.length > 0) {
    async function walk(entry: any, prefix: string[]) {
      if (!entry) return;
      if (entry.isFile) {
        try {
          const file = await getFileFromEntry(entry);
          files.push({ file, relativeDir: prefix });
        } catch (e) {
          console.warn("Could not read dropped file entry:", entry.name, e);
        }
      } else if (entry.isDirectory) {
        const here = [...prefix, entry.name];
        const key = here.join("/");
        if (!seenFolders.has(key)) {
          seenFolders.add(key);
          folders.push(here);
        }
        try {
          const reader = entry.createReader();
          const children = await readAllEntriesFromReader(reader);
          for (const child of children) {
            await walk(child, here);
          }
        } catch (e) {
          console.warn("Could not read dropped directory entry:", entry.name, e);
        }
      }
    }

    try {
      usedWebkitEntries = true;
      await Promise.all(entries.map((entry) => walk(entry, [])));
    } catch {
      usedWebkitEntries = false;
    }
  }

  // Fallback to plain files if webkitGetAsEntry wasn't applicable or found nothing
  if (!usedWebkitEntries || (files.length === 0 && folders.length === 0 && rawFiles.length > 0)) {
    return planFromFiles(rawFiles);
  }

  folders.sort((a, b) => a.length - b.length);
  return { files, folders };
}

/**
 * Plans uploads from a FileList (e.g. from <input type="file" webkitdirectory directory />
 * or plain multi-file selection).
 */
export function planFromFiles(fileList: FileList | File[]): FolderUploadPlan {
  const files: DroppedFileItem[] = [];
  const folders: string[][] = [];
  const seenFolders = new Set<string>();

  const list = Array.from(fileList);
  for (const file of list) {
    const rawPath = ((file as any).webkitRelativePath as string | undefined) || "";
    const normalized = rawPath.replace(/\\/g, "/");
    if (normalized.includes("/")) {
      const parts = normalized.split("/").filter((p) => p && p !== "." && p !== "..");
      const relativeDir = parts.slice(0, parts.length - 1);

      // Register all parent folder segments
      for (let i = 1; i <= relativeDir.length; i++) {
        const sub = relativeDir.slice(0, i);
        const key = sub.join("/");
        if (!seenFolders.has(key)) {
          seenFolders.add(key);
          folders.push(sub);
        }
      }
      files.push({ file, relativeDir });
    } else {
      files.push({ file, relativeDir: [] });
    }
  }

  folders.sort((a, b) => a.length - b.length);
  return { files, folders };
}

/**
 * Executes a folder upload plan by:
 * 1. Creating all necessary directories in order (shallowest to deepest),
 *    reusing existing directories if they already exist with the same name.
 * 2. Uploading all files to their corresponding target parent directory.
 */
export async function executeFolderUpload({
  plan,
  destinationParentId,
  onDone,
  toast,
}: {
  plan: FolderUploadPlan;
  destinationParentId: string;
  onDone?: () => void;
  toast?: (msg: string, type: "info" | "success" | "error") => void;
}): Promise<void> {
  if (plan.files.length === 0 && plan.folders.length === 0) return;

  const isDataset = destinationParentId.startsWith("dataset:");

  if (isDataset) {
    const baseCanonical = destinationParentId.replace(/^dataset:/, "").replace(/:/g, "/").replace(/^\/+|\/+$/g, "");

    // 1. Create dataset directories
    for (const folderPath of plan.folders) {
      const parentParts = folderPath.slice(0, -1);
      const parentCanonical = parentParts.length > 0
        ? (baseCanonical ? `${baseCanonical}/${parentParts.join("/")}` : parentParts.join("/"))
        : baseCanonical;
      const folderName = folderPath[folderPath.length - 1];

      try {
        await api.post(Api.folder, {
          parent_id: `dataset:${parentCanonical}`,
          name: folderName,
        });
      } catch (e) {
        console.warn("Dataset folder creation skipped/failed:", folderName, e);
      }
    }

    // 2. Enqueue all files through the shared transfers queue
    if (plan.files.length === 0) {
      toast?.(`Đã tạo cấu trúc thư mục thành công!`, "success");
      onDone?.();
      return;
    }

    const enqueueItems: EnqueueUploadItem[] = plan.files.map((item) => {
      const rel = item.relativeDir.join("/");
      const targetCanonical = rel
        ? (baseCanonical ? `${baseCanonical}/${rel}` : rel)
        : baseCanonical;
      const displayName = item.relativeDir.length > 0
        ? `${item.relativeDir.join("/")}/${item.file.name}`
        : item.file.name;
      return {
        file: item.file,
        parentId: `dataset:${targetCanonical}`,
        displayName,
      };
    });

    toast?.(`Đang tải lên ${enqueueItems.length} tệp...`, "info");
    await transfers.enqueue(enqueueItems, onDone);
    return;
  }

  // Standard LocalDrive tree upload
  toast?.(`Đang chuẩn bị cấu trúc thư mục...`, "info");

  // Map of relative path string (e.g. "photos/2026") -> node ID on server
  const made = new Map<string, string>();
  made.set("", destinationParentId);

  // Cache of existing nodes per parent ID to avoid duplicate creation
  const siblingsCache = new Map<string, NodeModel[]>();

  async function getSiblings(parentId: string): Promise<NodeModel[]> {
    if (siblingsCache.has(parentId)) return siblingsCache.get(parentId)!;
    try {
      const data = await api.get<{ nodes: NodeModel[] }>(Api.nodes, { parent_id: parentId });
      const list = data?.nodes ?? [];
      siblingsCache.set(parentId, list);
      return list;
    } catch {
      return [];
    }
  }

  // Create or resolve directories shallowest first
  for (const folderPath of plan.folders) {
    const key = folderPath.join("/");
    if (made.has(key)) continue;

    const parentKey = folderPath.slice(0, -1).join("/");
    const parentNodeId = made.get(parentKey) ?? destinationParentId;
    const folderName = folderPath[folderPath.length - 1];

    const siblings = await getSiblings(parentNodeId);
    const existing = siblings.find(
      (n) => isFolder(n) && n.name.toLowerCase() === folderName.toLowerCase(),
    );

    if (existing) {
      made.set(key, existing.id);
    } else {
      try {
        const created = await api.post<NodeModel>(Api.folder, {
          name: folderName,
          parent_id: parentNodeId,
        });
        made.set(key, created.id);
        siblings.push(created);
      } catch (err) {
        console.warn("Folder creation error for", folderName, err);
        made.set(key, parentNodeId);
      }
    }
  }

  // If there are no files to upload (empty folder dropped), we're done!
  if (plan.files.length === 0) {
    toast?.("Đã tạo thư mục thành công!", "success");
    onDone?.();
    return;
  }

  // Enqueue all files with their exact destination parent ID and clear display name
  const uploadItems: EnqueueUploadItem[] = plan.files.map((item) => {
    const folderKey = item.relativeDir.join("/");
    const targetParent = made.get(folderKey) ?? destinationParentId;
    const displayName = item.relativeDir.length > 0
      ? `${item.relativeDir.join("/")}/${item.file.name}`
      : item.file.name;
    return {
      file: item.file,
      parentId: targetParent,
      displayName,
    };
  });

  toast?.(`Đang tải lên ${uploadItems.length} tệp...`, "info");
  await transfers.enqueue(uploadItems, onDone);
}
