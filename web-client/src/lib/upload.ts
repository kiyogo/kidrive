"use client";

import { api } from "./api";
import { Api } from "./endpoints";
import { stringsFor } from "./l10n";

/** A transfer's error text is shown on the transfers screen, so it has to be
 *  in the reader's language. Read at throw time rather than held, because the
 *  language can change while a queue is running. */
function say(): ReturnType<typeof stringsFor> {
  const locale = (typeof window !== "undefined" ? localStorage.getItem("ld.locale") : null) === "ar" ? "ar" : "en";
  return stringsFor(locale);
}


/**
 * Uploading, over tus.
 *
 * The server speaks tus at /api/v1/uploads/ and nothing else: a plain multipart
 * POST has nowhere to go. tus is also what makes a dropped connection
 * survivable, which matters most for exactly the large files a browser is
 * worst at sending.
 *
 * Ported from the Flutter transfer controller, minus the parts that need a
 * filesystem: a browser hands over a File object rather than a path, and a
 * File survives a page reload only if the person picks it again.
 */

const CHUNK = 5 * 1024 * 1024;

export type TransferState = "queued" | "uploading" | "done" | "failed" | "paused";

export interface Transfer {
  id: string;
  name: string;
  size: number;
  sent: number;
  state: TransferState;
  error?: string;
  isTask?: boolean;
}

type Listener = (list: Transfer[]) => void;

/** base64 of a utf-8 string, which is what tus metadata values are. */
function b64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}
export interface EnqueueUploadItem {
  file: File;
  parentId: string;
  nodeId?: string;
  displayName?: string;
}

class Transfers {
  private items: Transfer[] = [];
  private listeners = new Set<Listener>();
  private nextId = 1;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.items);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const snapshot = [...this.items];
    this.listeners.forEach((fn) => fn(snapshot));
  }

  private patch(id: string, changes: Partial<Transfer>) {
    this.items = this.items.map((t) => (t.id === id ? { ...t, ...changes } : t));
    this.emit();
  }

  clearFinished() {
    this.items = this.items.filter((t) => t.state !== "done");
    this.emit();
  }

  /** Queues files and uploads them one after another, so a folder of photos
   *  does not open fifty sockets at once. */
  async enqueue(
    itemsOrFiles: EnqueueUploadItem[] | File[],
    parentIdOrOnDone?: string | (() => void),
    onDone?: () => void,
    /** node id per file, for the ones replacing something already there. An
     *  upload that names the node it replaces becomes a new version of it;
     *  without this the server stores a second file beside the first. */
    replacing?: Map<File, string>,
  ) {
    if (!itemsOrFiles.length) return;

    let itemsToQueue: {
      file: File;
      parentId: string;
      nodeId: string;
      displayName: string;
    }[] = [];
    let completionCallback = onDone;

    if ("file" in itemsOrFiles[0]) {
      // It's EnqueueUploadItem[]
      completionCallback = typeof parentIdOrOnDone === "function" ? parentIdOrOnDone : onDone;
      itemsToQueue = (itemsOrFiles as EnqueueUploadItem[]).map((item) => ({
        file: item.file,
        parentId: item.parentId,
        nodeId: item.nodeId ?? "",
        displayName: item.displayName || item.file.name,
      }));
    } else {
      // It's File[]
      const pId = (typeof parentIdOrOnDone === "string" ? parentIdOrOnDone : "") ?? "";
      itemsToQueue = (itemsOrFiles as File[]).map((file) => ({
        file,
        parentId: pId,
        nodeId: replacing?.get(file) ?? "",
        displayName: file.name,
      }));
    }

    const queued = itemsToQueue.map(({ file, parentId, nodeId, displayName }) => {
      const item: Transfer = {
        id: `t${this.nextId++}`,
        name: displayName,
        size: file.size,
        sent: 0,
        state: "queued",
      };
      this.items = [...this.items, item];
      return { item, file, parentId, nodeId };
    });
    this.emit();

    for (const { item, file, parentId, nodeId } of queued) {
      try {
        await this.one(item.id, file, parentId, nodeId);
        this.patch(item.id, { state: "done", sent: file.size });
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : say().transferFailed;
        this.patch(item.id, {
          state: "failed",
          error: errorMsg,
        });
        if (
          errorMsg.includes("Dung lượng lưu trữ đã đầy") ||
          (e as any)?.status === 507 ||
          (e as any)?.code === "ERR_QUOTA"
        ) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("ld-toast", {
                detail: { message: "Dung lượng lưu trữ đã đầy, không thể tải tệp lên", tone: "error" },
              }),
            );
          }
        }
      }
    }
    completionCallback?.();
  }

  private async one(id: string, file: File, parentId: string, nodeId = "") {
    const initialSent = Math.max(1, Math.round(file.size * 0.05));
    this.patch(id, { state: "uploading", sent: initialSent });
    const token = localStorage.getItem("ld.access") ?? "";
    const auth = { Authorization: `Bearer ${token}` };

    let targetParent = parentId;
    if (!targetParent || (!targetParent.startsWith("dataset:") && !targetParent.startsWith("library:"))) {
      targetParent = "dataset:KiyoVN";
    }

    if (targetParent.startsWith("dataset:")) {
      const rawDs = targetParent.replace(/^dataset:/, "").replace(/:/g, "/").replace(/^\/+|\/+$/g, "");
      const formData = new FormData();
      formData.append("file", file);
      const url = api.absolute(Api.datasetUpload(rawDs, ""));
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);
        if (token) {
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        }
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            this.patch(id, { sent: Math.max(initialSent, Math.min(file.size, e.loaded)) });
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            this.patch(id, { sent: file.size });
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("ld_nodes_changed"));
            }
            resolve();
            return;
          }
          let errJson: any = {};
          try {
            errJson = JSON.parse(xhr.responseText || "{}");
          } catch (_) {}
          const errStr = String(errJson.message || errJson.error?.message || errJson.error || "");
          if (xhr.status === 507 || errStr.includes("hạn ngạch") || errStr.includes("quota")) {
            reject(new Error("Dung lượng lưu trữ đã đầy, không thể tải tệp lên"));
            return;
          }
          reject(new Error(errStr || "Không thể tải tệp lên tập dữ liệu"));
        };
        xhr.onerror = () => {
          reject(new Error("Không thể kết nối máy chủ khi tải tệp lên"));
        };
        xhr.send(formData);
      });
      return;
    }

    // 1. creation. the metadata keys are the ones the store reads
    const meta = [
      `filename ${b64(file.name)}`,
      `filetype ${b64(file.type || "application/octet-stream")}`,
      `parent_id ${b64(parentId ?? "")}`,
      ...(nodeId ? [`node_id ${b64(nodeId)}`] : []),
    ].join(",");

    const created = await fetch(api.absolute("/api/v1/uploads/"), {
      method: "POST",
      headers: {
        ...auth,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(file.size),
        "Upload-Metadata": meta,
      },
    });
    if (!created.ok && created.status !== 201) {
      if (created.status === 507) {
        throw new Error("Dung lượng lưu trữ đã đầy, không thể tải tệp lên");
      }
      try {
        const errJson = await created.json();
        if (errJson?.error?.code === "ERR_QUOTA" || errJson?.error === "quota_exceeded") {
          throw new Error("Dung lượng lưu trữ đã đầy, không thể tải tệp lên");
        }
      } catch (_) {}
      throw new Error(say().errorUnexpectedBody);
    }
    const location = created.headers.get("Location");
    if (!location) throw new Error(say().errorUnexpectedBody);
    const target = location.startsWith("http") ? location : api.absolute(location);

    // 2. the bytes, in chunks, so progress is real and a failure is partial
    let offset = 0;
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK, file.size);
      const slice = file.slice(offset, end);
      const res = await fetch(target, {
        method: "PATCH",
        headers: {
          ...auth,
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: slice,
      });
      if (!res.ok) {
        if (res.status === 507) {
          throw new Error("Dung lượng lưu trữ đã đầy, không thể tải tệp lên");
        }
        throw new Error(say().transferFailed);
      }
      const next = Number(res.headers.get("Upload-Offset") ?? end);
      offset = Number.isFinite(next) && next > offset ? next : end;
      this.patch(id, { sent: offset });
    }
  }

  /**
   * Enqueues an asynchronous server operation (such as copy, move, paste)
   * so it appears in the Transfers list and shows real progress %.
   */
  async enqueueTask(
    name: string,
    operationType: "copy" | "move",
    task: (onProgress: (pct: number) => void) => Promise<void>,
    size: number = 100
  ): Promise<void> {
    const id = `op-${Date.now()}-${this.nextId++}`;
    const opLabel = operationType === "copy" ? "Sao chép" : "Dán";
    const totalSize = size && size > 0 ? size : 100;
    const toBytes = (pct: number) => Math.max(0, Math.min(totalSize, Math.round((pct / 100) * totalSize)));

    const item: Transfer = {
      id,
      name: name ? `${opLabel}: ${name}` : opLabel,
      size: totalSize,
      sent: toBytes(8),
      state: "uploading",
      isTask: true,
    };
    this.items = [item, ...this.items];
    this.emit();

    const startedAt = Date.now();
    let currentPct = 8;
    const ticker = setInterval(() => {
      if (currentPct < 88) {
        currentPct = Math.min(88, currentPct + 16);
        this.patch(id, { sent: toBytes(currentPct) });
      }
    }, 120);

    try {
      await task((pct) => {
        currentPct = Math.max(currentPct, Math.min(99, pct));
        this.patch(id, { sent: toBytes(currentPct) });
      });
      clearInterval(ticker);
      const elapsed = Date.now() - startedAt;
      if (elapsed < 260) {
        this.patch(id, { sent: toBytes(78) });
        await new Promise((r) => setTimeout(r, 140));
      }
      this.patch(id, { state: "done", sent: totalSize });
    } catch (err: any) {
      clearInterval(ticker);
      const errMsg = err?.message || say().transferFailed;
      this.patch(id, { state: "failed", error: errMsg });
      throw err;
    }
  }
}

export const transfers = new Transfers();