"use client";

import { useCallback, useMemo, useState } from "react";
import { Button, Dialog, showToast } from "@/components/ui";
import { api } from "./api";
import { Api } from "./endpoints";
import { useL10n } from "./l10n";
import { useSession } from "./session";
import { executeFolderUpload, planDataTransfer, planFromFiles } from "./folderUpload";
import { isFolder, type NodeModel } from "./models";
import { transfers } from "./upload";

/**
 * Check whether system has configured storage pools, datasets, and user permissions
 */
export async function checkStorageReadiness(): Promise<{ ready: boolean; message: string; code?: string }> {
  try {
    const res = await api.get<{ ready: boolean; message?: string; code?: string }>(Api.storageReadiness);
    if (!res.ready) {
      return { ready: false, message: res.message || "Hệ thống chưa sẵn sàng để lưu tệp.", code: res.code };
    }
    return { ready: true, message: "" };
  } catch (err: any) {
    return { ready: false, message: err?.message || "Không thể kiểm tra trạng thái lưu trữ." };
  }
}

/**
 * Picking files and uncompressed folders, including the question that has to
 * be asked when a name is already taken. Ported from upload/widgets/duplicate_sheet.
 *
 * It lives here rather than in the files browser because two places start an
 * upload: the button in the shell and the browser's own drop target. Two
 * copies of this rule would eventually disagree, and the one that forgot to
 * ask would silently make a second file instead of a new version.
 */
function makeUniqueFile(file: File, existingNames: Set<string>): File {
  const dot = file.name.lastIndexOf(".");
  const base = dot > 0 ? file.name.slice(0, dot) : file.name;
  const ext = dot > 0 ? file.name.slice(dot) : "";
  let counter = 1;
  let newName = `${base} (${counter})${ext}`;
  while (existingNames.has(newName.toLowerCase())) {
    counter++;
    newName = `${base} (${counter})${ext}`;
  }
  existingNames.add(newName.toLowerCase());
  return new File([file], newName, { type: file.type, lastModified: file.lastModified });
}

export function useUploader(parentId: string, onDone?: () => void) {
  const t = useL10n();
  const { user } = useSession();
  const [clash, setClash] = useState<{
    files: File[];
    clashes: File[];
    existing: Map<string, NodeModel>;
    into: string;
  } | null>(null);

  const hasAssignedCategory = useMemo<boolean>(() => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (!user.dataset_permissions) return false;
    try {
      const perms = JSON.parse(user.dataset_permissions);
      return Object.values(perms).some((p: any) => p && (p.read || p.write || p.level));
    } catch {
      return false;
    }
  }, [user]);

  const hasWritePermission = useMemo<boolean>(() => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (!user.dataset_permissions) return false;
    try {
      const perms = JSON.parse(user.dataset_permissions);
      return Object.values(perms).some((p: any) => p && (p.write || p.level === "editor" || p.level === "writer" || p.level === "owner"));
    } catch {
      return false;
    }
  }, [user]);

  const checkQuota = useCallback(
    (incomingBytes = 0): boolean => {
      if (user && user.quota_bytes > 0) {
        if (
          user.quota_bytes_used >= user.quota_bytes ||
          user.quota_bytes_used + incomingBytes > user.quota_bytes
        ) {
          showToast("Dung lượng lưu trữ đã đầy, không thể tải tệp lên", "error");
          return false;
        }
      }
      return true;
    },
    [user],
  );

  const resolveTargetInto = useCallback(
    (into: string) => {
      if (into) return into;
      if (user && user.role !== "admin") {
        let userPerms: Record<string, any> = {};
        try {
          if (user.dataset_permissions) userPerms = JSON.parse(user.dataset_permissions);
        } catch {}
        for (const [dsKey, val] of Object.entries(userPerms)) {
          const cleanDs = dsKey.trim().replace(/^\/+/, "");
          if (!cleanDs || cleanDs === "*" || cleanDs === "/") continue;
          if (val && typeof val === "object" && (val.write || val.level === "editor")) {
            return `dataset:${cleanDs}`;
          }
          if (typeof val === "string" && (val === "editor" || val === "writer" || val === "owner")) {
            return `dataset:${cleanDs}`;
          }
        }
      }
      return "dataset:KiyoVN";
    },
    [user],
  );

  const send = useCallback(
    async (list: File[], into: string, replacing?: Map<File, string>) => {
      if (!list.length) return;
      if (!hasAssignedCategory) {
        showToast("Tài khoản chưa được chỉ định danh mục lưu trữ. Vui lòng liên hệ quản trị viên để được cấp quyền trước khi tải lên!", "error");
        return;
      }
      if (!hasWritePermission) {
        showToast("Bạn chỉ có quyền xem (Chỉ đọc), không thể tải tệp lên!", "error");
        return;
      }
      const readiness = await checkStorageReadiness();
      if (!readiness.ready) {
        showToast(readiness.message, "error");
        return;
      }
      const totalSize = list.reduce((acc, f) => acc + (f.size || 0), 0);
      if (!checkQuota(totalSize)) return;
      const finalInto = resolveTargetInto(into);
      await transfers.enqueue(list, finalInto, onDone, replacing);
    },
    [onDone, checkQuota, resolveTargetInto, hasAssignedCategory, hasWritePermission],
  );

  const pickFolder = useCallback(
    async (files: FileList | File[] | null, into = parentId) => {
      if (!files) return;
      const list = Array.from(files);
      if (!list.length) return;
      if (!hasAssignedCategory) {
        showToast("Tài khoản chưa được chỉ định danh mục lưu trữ. Vui lòng liên hệ quản trị viên để được cấp quyền trước khi tải lên!", "error");
        return;
      }
      if (!hasWritePermission) {
        showToast("Bạn chỉ có quyền xem (Chỉ đọc), không thể tải tệp lên!", "error");
        return;
      }
      const readiness = await checkStorageReadiness();
      if (!readiness.ready) {
        showToast(readiness.message, "error");
        return;
      }
      const totalSize = list.reduce((acc, f) => acc + (f.size || 0), 0);
      if (!checkQuota(totalSize)) return;

      const finalInto = resolveTargetInto(into);
      const plan = planFromFiles(files);
      await executeFolderUpload({
        plan,
        destinationParentId: finalInto,
        onDone,
      });
    },
    [parentId, onDone, checkQuota, resolveTargetInto, hasAssignedCategory, hasWritePermission],
  );

  const pick = useCallback(
    /** `into` overrides the destination, for files dropped straight onto a
     *  folder tile rather than into the folder on screen. */
    async (files: FileList | File[] | null, into = parentId) => {
      const list = files ? Array.from(files) : [];
      if (!list.length) return;
      if (!hasAssignedCategory) {
        showToast("Tài khoản chưa được chỉ định danh mục lưu trữ. Vui lòng liên hệ quản trị viên để được cấp quyền trước khi tải lên!", "error");
        return;
      }
      if (!hasWritePermission) {
        showToast("Bạn chỉ có quyền xem (Chỉ đọc), không thể tải tệp lên!", "error");
        return;
      }
      const readiness = await checkStorageReadiness();
      if (!readiness.ready) {
        showToast(readiness.message, "error");
        return;
      }

      const totalSize = list.reduce((acc, f) => acc + (f.size || 0), 0);
      if (!checkQuota(totalSize)) return;

      const finalInto = resolveTargetInto(into);

      // If any file has relative path, it's a folder upload
      const hasRelativePath = list.some(
        (f) => (f as any).webkitRelativePath && String((f as any).webkitRelativePath).includes("/"),
      );
      if (hasRelativePath) {
        await pickFolder(list, finalInto);
        return;
      }

      // failing to read the destination is not a reason to block an upload:
      // the server renames rather than overwrites, so the worst case is a
      // second file rather than a lost one
      let siblings: NodeModel[] = [];
      try {
        const data = await api.get<{ nodes: NodeModel[] }>(Api.nodes, { parent_id: finalInto });
        siblings = data?.nodes ?? [];
      } catch {
        await send(list, finalInto);
        return;
      }

      // names compare without case, the same way the server decides a clash,
      // so Photo.PNG and photo.png are recognised as the same name
      const existing = new Map(
        siblings.filter((n) => !isFolder(n)).map((n) => [n.name.toLowerCase(), n] as const),
      );
      const clashes = list.filter((f) => existing.has(f.name.toLowerCase()));
      if (!clashes.length) {
        await send(list, finalInto);
        return;
      }
      setClash({ files: list, clashes, existing, into: finalInto });
    },
    [parentId, send, pickFolder, checkQuota, resolveTargetInto],
  );

  const dropDataTransfer = useCallback(
    async (dt: DataTransfer | File[] | FileList, into = parentId) => {
      // Synchronously capture raw files and directory entries before any async await
      let rawFiles: File[] = [];
      let entries: any[] = [];
      if (Array.isArray(dt)) {
        rawFiles = dt;
      } else if (typeof FileList !== "undefined" && dt instanceof FileList) {
        rawFiles = Array.from(dt);
      } else if (dt && typeof (dt as DataTransfer).files !== "undefined") {
        const dataTransfer = dt as DataTransfer;
        if (dataTransfer.files) {
          rawFiles = Array.from(dataTransfer.files);
        }
        if (dataTransfer.items && dataTransfer.items.length > 0) {
          for (let i = 0; i < dataTransfer.items.length; i++) {
            const it = dataTransfer.items[i];
            if (it.kind === "file" && typeof it.webkitGetAsEntry === "function") {
              try {
                const entry = it.webkitGetAsEntry();
                if (entry) entries.push(entry);
              } catch {}
            }
          }
        }
      }

      if (!hasAssignedCategory) {
        showToast("Tài khoản chưa được chỉ định danh mục lưu trữ. Vui lòng liên hệ quản trị viên để được cấp quyền trước khi tải lên!", "error");
        return;
      }
      if (!hasWritePermission) {
        showToast("Bạn chỉ có quyền xem (Chỉ đọc), không thể tải tệp lên!", "error");
        return;
      }
      if (!checkQuota()) return;

      const readiness = await checkStorageReadiness();
      if (!readiness.ready) {
        showToast(readiness.message, "error");
        return;
      }

      const finalInto = resolveTargetInto(into);
      const plan = await planDataTransfer(dt, rawFiles, entries);
      const totalSize = plan.files.reduce((acc, f) => acc + (f.file.size || 0), 0);
      if (!checkQuota(totalSize)) return;

      if (plan.folders.length > 0) {
        await executeFolderUpload({
          plan,
          destinationParentId: finalInto,
          onDone: () => {
            onDone?.();
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("ld_nodes_changed"));
            }
          },
        });
      } else {
        const plainFiles = plan.files.length > 0 ? plan.files.map((p) => p.file) : rawFiles;
        await pick(plainFiles, finalInto);
      }
    },
    [parentId, onDone, pick, checkQuota, resolveTargetInto, hasAssignedCategory, hasWritePermission],
  );

  const sheet = clash ? (
    <Dialog
      open
      onClose={() => setClash(null)}
      title="Tệp đã tồn tại"
      maxWidth={440}
    >
      <div style={{ padding: "6px 0 0" }}>
        <p style={{ margin: "0 0 18px", fontSize: 14, color: "var(--fg-secondary, #909090)", lineHeight: 1.5 }}>
          {clash.clashes.length === 1
            ? `Tệp "${clash.clashes[0].name}" đã tồn tại trong thư mục đích.`
            : `${clash.clashes.length} tệp tải lên bị trùng tên trong thư mục đích.`}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Button
            label="Ghi đè"
            glyph="upload"
            onClick={() => {
              const replacing = new Map<File, string>();
              for (const file of clash.clashes) {
                const node = clash.existing.get(file.name.toLowerCase());
                if (node) replacing.set(file, node.id);
              }
              const all = clash.files;
              setClash(null);
              void send(all, clash.into, replacing);
            }}
          />
          <Button
            label="Giữ cả hai"
            glyph="copy"
            variant="secondary"
            onClick={() => {
              const existingSet = new Set(Array.from(clash.existing.keys()));
              const renamedFiles = clash.files.map((f) => {
                if (clash.clashes.includes(f)) {
                  return makeUniqueFile(f, existingSet);
                }
                return f;
              });
              setClash(null);
              void send(renamedFiles, clash.into);
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <div style={{ flex: 1 }}>
              <Button
                label="Bỏ qua"
                variant="quiet"
                onClick={() => {
                  const rest = clash.files.filter((f) => !clash.clashes.includes(f));
                  setClash(null);
                  if (rest.length > 0) {
                    void send(rest, clash.into);
                  }
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Button
                label="Hủy"
                variant="quiet"
                onClick={() => setClash(null)}
              />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  ) : null;

  return { pick, pickFolder, dropDataTransfer, sheet, busy: clash !== null };
}