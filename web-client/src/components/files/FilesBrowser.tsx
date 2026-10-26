"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type Glyph } from "@/components/Icon";
import {
  Avatar,
  Banner,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  GridSkeleton,
  ListSkeleton,
  Menu,
  Sheet,
  Tappable,
  TextField,
  UtilityButton,
  useDeviceClass,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { bytes, extensionOf, relative } from "@/lib/format";
import { categoryOf, isFolder, type NodeModel } from "@/lib/models";
import { colorForCategory, folderSwatches, wash } from "@/lib/tokens";
import { useKeptIds } from "@/lib/offline";
import { useUploader, checkStorageReadiness } from "@/lib/uploads";
import { transfers } from "@/lib/upload";
import { ShareSheet } from "@/components/share/ShareSheet";
import { DetailsPane, DetailsErrorBoundary } from "./DetailsPane";
import { bandStyle, hasPointer, rangeBetween, useFileKeys, useMarquee, useNodeDrag } from "./desktop";
import { useL10n, type Strings } from "@/lib/l10n";
import { FileTileIcon, categoryOfNode } from "./FileTileIcon";
import { useSession } from "@/lib/session";
import { wsClient } from "@/lib/websocket";
import { useInfiniteList } from "@/lib/useInfiniteList";

type ViewMode = "grid" | "list";

const glyphForCategory: Record<string, Glyph> = {
  folder: "folder",
  image: "image",
  video: "video",
  audio: "audio",
  pdf: "pdf",
  spreadsheet: "sheet",
  presentation: "slides",
  code: "code",
  archive: "archive",
  document: "file",
  other: "file",
};



const browserFolderCache = new Map<string, { nodes: NodeModel[]; timestamp: number }>();

type ClipboardState = { action: "cut" | "copy"; nodes: NodeModel[] } | null;
let globalClipboard: ClipboardState = null;
const clipboardListeners = new Set<() => void>();
function setGlobalClipboard(cb: ClipboardState) {
  globalClipboard = cb;
  clipboardListeners.forEach((l) => l());
}
function useBrowserClipboard() {
  const [cb, setCb] = useState<ClipboardState>(globalClipboard);
  useEffect(() => {
    const listener = () => setCb(globalClipboard);
    clipboardListeners.add(listener);
    return () => {
      clipboardListeners.delete(listener);
    };
  }, []);
  return [cb, setGlobalClipboard] as const;
}

export function FilesBrowser({
  folderId,
  filter,
  title,
  trail,
  onNavigateTrail,
  onRoot,
  createFolderTrigger,
  onOpenFolder,
  onPreview,
  onSearch,
}: {
  folderId: string;
  filter: "none" | "starred" | "recent" | "trash" | "shared";
  title: string;
  trail?: { id: string; name: string }[];
  onNavigateTrail?: (index: number) => void;
  onRoot?: () => void;
  createFolderTrigger?: number;
  onOpenFolder: (node: NodeModel) => void;
  onPreview: (node: NodeModel, nodes?: NodeModel[]) => void;
  onSearch?: () => void;
}) {
  const t = useL10n();
  const [view, setView] = useState<ViewMode>("grid");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsNode, setDetailsNode] = useState<NodeModel | null>(null);
  const detailsOpenRef = useRef(false);
  detailsOpenRef.current = detailsOpen;
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{
    x?: number;
    y?: number;
    anchorRect?: { left: number; right: number; top: number; bottom: number };
    node: NodeModel;
    isBulk?: boolean;
  } | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<{
    x?: number;
    y?: number;
  } | null>(null);
  const [clipboard, setClipboard] = useBrowserClipboard();
  const [overflow, setOverflow] = useState<{
    x?: number;
    y?: number;
    anchorRect?: { left: number; right: number; top: number; bottom: number };
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [sharing, setSharing] = useState<NodeModel | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "updated" | "size">("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [sortMenu, setSortMenu] = useState<{
    x?: number;
    y?: number;
    anchorRect?: { left: number; right: number; top: number; bottom: number };
  } | null>(null);
  const [desktopSearchFocused, setDesktopSearchFocused] = useState(false);
  const toast = useToast();
  const { isDesktop, isMobile } = useDeviceClass();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [uploadMenuAnchor, setUploadMenuAnchor] = useState<{
    left: number;
    right: number;
    top: number;
    bottom: number;
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);

  const { user } = useSession();

  // Parse permissions of current user
  const userPerms = useMemo<Record<string, { level: "editor" | "viewer" | "none"; read: boolean; write: boolean; execute: boolean }>>(() => {
    if (!user) return {};
    if (user.role === "admin") return {};
    let raw: Record<string, any> = {};
    try {
      if (typeof window !== "undefined") {
        const cached = localStorage.getItem(`ld_user_dataset_perms_${user.id}`);
        if (cached) raw = JSON.parse(cached);
      }
    } catch {}
    if (Object.keys(raw).length === 0 && user.dataset_permissions) {
      try {
        raw = JSON.parse(user.dataset_permissions);
      } catch {}
    }
    const perms: Record<string, { level: "editor" | "viewer" | "none"; read: boolean; write: boolean; execute: boolean }> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (!val || val === "none") continue;
      if (typeof val === "object" && val !== null) {
        const r = typeof val.read === "boolean" ? val.read : true;
        const w = typeof val.write === "boolean" ? val.write : (val.level === "editor");
        const x = typeof val.execute === "boolean" ? val.execute : (val.level === "editor" || r);
        const lvl = w ? "editor" : (r ? "viewer" : "none");
        perms[key] = { level: lvl, read: r, write: w, execute: x };
      } else if (typeof val === "string") {
        const isEditor = val === "editor" || val === "writer" || val === "owner";
        const isViewer = val === "viewer" || val === "reader";
        perms[key] = {
          level: isEditor ? "editor" : (isViewer ? "viewer" : "none"),
          read: isEditor || isViewer,
          write: isEditor,
          execute: isEditor || isViewer,
        };
      }
    }
    return perms;
  }, [user]);

  const getDatasetPerm = useCallback((dsName: string) => {
    if (!user) return { level: "none" as const, read: false, write: false, execute: false };
    if (user.role === "admin") return { level: "editor" as const, read: true, write: true, execute: true };
    if (userPerms[dsName]) return userPerms[dsName];

    const cleanName = dsName.toLowerCase().trim().replace(/^\/+|\/+$/g, "");
    if (!cleanName) return { level: "none" as const, read: false, write: false, execute: false };

    // 1. Khớp chính xác
    for (const [k, v] of Object.entries(userPerms)) {
      const kClean = k.toLowerCase().trim().replace(/^\/+|\/+$/g, "");
      if (kClean === cleanName) return v;
    }

    // 2. Thừa hưởng quyền từ dataset cha (ví dụ cấp quyền DATA/KiyoVN thì tự động có toàn quyền trên DATA/KiyoVN/1DATA)
    for (const [k, v] of Object.entries(userPerms)) {
      const kClean = k.toLowerCase().trim().replace(/^\/+|\/+$/g, "");
      if (kClean && cleanName.startsWith(kClean + "/")) {
        return v;
      }
    }

    // 3. Khớp nếu kClean không có tên pool (ví dụ kClean là "kiyovn" còn cleanName là "data/kiyovn" hoặc "data/kiyovn/sub")
    for (const [k, v] of Object.entries(userPerms)) {
      const kClean = k.toLowerCase().trim().replace(/^\/+|\/+$/g, "");
      if (kClean && !kClean.includes("/") && (cleanName === kClean || cleanName.endsWith("/" + kClean) || cleanName.includes("/" + kClean + "/"))) {
        return v;
      }
    }

    if (userPerms["/"]) return userPerms["/"];
    if (userPerms["*"]) return userPerms["*"];
    return { level: "none" as const, read: false, write: false, execute: false };
  }, [user, userPerms]);

  // Danh mục gốc được phân quyền cho người dùng này
  const userRootDatasets = useMemo<string[]>(() => {
    if (!user || !user.dataset_permissions) return [];
    if (userPerms["/"] || userPerms["*"]) {
      const rootPerm = userPerms["/"] || userPerms["*"];
      const canReadRoot = typeof rootPerm === "object" ? rootPerm.read : rootPerm !== "none";
      if (canReadRoot && user.role === "admin") {
        return [];
      }
    }
    const keys = Object.keys(userPerms)
      .map((k) => k.trim().replace(/^\/+|\/+$/g, ""))
      .filter((k) => k && k !== "*" && k !== "/");
    const unique = Array.from(new Set(keys));
    return unique.filter((item) => {
      const itemLower = item.toLowerCase();
      return !unique.some((other) => {
        const otherLower = other.toLowerCase();
        return otherLower !== itemLower && itemLower.startsWith(otherLower + "/");
      });
    });
  }, [user, userPerms]);

  // Nếu người dùng chỉ được phân quyền duy nhất 1 danh mục (ví dụ DATA/KiyoVN):
  const defaultSingleDataset = useMemo<string | null>(() => {
    return userRootDatasets.length === 1 ? userRootDatasets[0] : null;
  }, [userRootDatasets]);

  // Check if current user has assigned categories:
  const hasAssignedCategory = useMemo<boolean>(() => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return Object.values(userPerms).some((p) => p.read);
  }, [user, userPerms]);

  // Determine root dataset name if within a dataset hierarchy
  const currentDatasetName = useMemo<string | null>(() => {
    if (folderId.startsWith("dataset:")) {
      const stripped = folderId.replace(/^dataset:/, "").replace(/\\/g, "/").replace(/:/g, "/");
      return stripped;
    }
    if (trail && trail.length > 0) {
      const last = trail[trail.length - 1];
      if (last?.id && last.id.startsWith("dataset:")) {
        return last.id.replace(/^dataset:/, "").replace(/\\/g, "/").replace(/:/g, "/");
      }
      if (trail[0]?.id && trail[0].id.startsWith("dataset:")) {
        return trail[0].id.replace(/^dataset:/, "").replace(/\\/g, "/").replace(/:/g, "/");
      }
    }
    if (user && user.role !== "admin" && defaultSingleDataset) {
      return defaultSingleDataset;
    }
    return null;
  }, [trail, folderId, user, defaultSingleDataset]);

  // Is current view read-only?
  const isReadOnly = useMemo<boolean>(() => {
    if (!user) return false;
    if (user.role === "admin") return false;
    if (!hasAssignedCategory) return true;
    if (currentDatasetName) {
      const perm = getDatasetPerm(currentDatasetName);
      return !perm.write;
    }
    if (defaultSingleDataset) {
      const perm = getDatasetPerm(defaultSingleDataset);
      return !perm.write;
    }
    return false;
  }, [user, currentDatasetName, defaultSingleDataset, getDatasetPerm, hasAssignedCategory]);

  // Is current view forbidden?
  const isForbidden = useMemo<boolean>(() => {
    if (!user) return false;
    if (user.role === "admin") return false;
    if (currentDatasetName) {
      const perm = getDatasetPerm(currentDatasetName);
      return !perm.read;
    }
    return false;
  }, [user, currentDatasetName, getDatasetPerm]);

  // First dataset with write permissions for this user
  const defaultTargetDataset = useMemo<string | null>(() => {
    if (!user || user.role === "admin") return null;
    for (const [k, v] of Object.entries(userPerms)) {
      if (v.write) return k;
    }
    return null;
  }, [user, userPerms]);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renamingNode, setRenamingNode] = useState<NodeModel | null>(null);
  const [renameName, setRenameName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDeleteNode, setConfirmDeleteNode] = useState<NodeModel | null>(null);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [storageReadiness, setStorageReadiness] = useState<{ ready: boolean; message?: string; code?: string } | null>(null);

  const refreshReadiness = useCallback(async () => {
    try {
      const res = await api.get<{ ready: boolean; message?: string; code?: string }>(Api.storageReadiness);
      setStorageReadiness(res);
    } catch {
      setStorageReadiness(null);
    }
  }, []);

  useEffect(() => {
    refreshReadiness();
  }, [refreshReadiness, folderId]);

  useEffect(() => {
    if (createFolderTrigger && createFolderTrigger > 0) {
      if (isReadOnly) {
        toast("Bạn chỉ có quyền xem (Chỉ đọc) trên bộ dữ liệu này!", "error");
        return;
      }
      void (async () => {
        const readiness = await checkStorageReadiness();
        if (!readiness.ready) {
          toast(readiness.message, "error");
          return;
        }
        setFolderName("");
        setCreateFolderOpen(true);
      })();
    }
  }, [createFolderTrigger, isReadOnly, toast]);

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    if (!hasAssignedCategory) {
      toast("Tài khoản chưa được chỉ định danh mục lưu trữ. Vui lòng liên hệ quản trị viên!", "error");
      return;
    }
    if (isReadOnly) {
      toast("Bạn chỉ có quyền xem (Chỉ đọc) trên bộ dữ liệu này!", "error");
      return;
    }
    const readiness = await checkStorageReadiness();
    if (!readiness.ready) {
      toast(readiness.message, "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const targetParent = currentFolderTarget || (defaultTargetDataset ? `dataset:${defaultTargetDataset}` : folderId);
      await api.post(Api.folder, { name: folderName.trim(), parent_id: targetParent });
      setCreateFolderOpen(false);
      setFolderName("");
      toast("Đã tạo thư mục mới thành công!", "success");
      void load();
    } catch (e: any) {
      toast(e?.message || "Không thể tạo thư mục mới. Vui lòng thử lại sau!", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRename = async () => {
    if (!renamingNode || !renameName.trim()) return;
    if (isReadOnly || renamingNode.role === "viewer") {
      toast("Bạn chỉ có quyền xem (Chỉ đọc) trên mục này!", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.patch(Api.node(renamingNode.id), { name: renameName.trim() });
      setRenamingNode(null);
      setRenameName("");
      toast("Đã đổi tên thành công!", "success");
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t.errorUnexpectedTitle, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [recoloringNode, setRecoloringNode] = useState<NodeModel | null>(null);
  const [movingNode, setMovingNode] = useState<NodeModel | null>(null);
  const [targetFolders, setTargetFolders] = useState<{ id: string; name: string }[]>([]);

  const openMoveDialog = async (node: NodeModel) => {
    if (isReadOnly || node.role === "viewer") {
      toast("Bạn chỉ có quyền xem (Chỉ đọc) trên mục này!", "error");
      return;
    }
    setMovingNode(node);
    try {
      const data = await api.get<{ nodes: NodeModel[] }>(Api.nodes, { parent_id: "" });
      const folders = (data?.nodes ?? [])
        .filter((n) => isFolder(n) && n.id !== node.id)
        .map((n) => ({ id: n.id, name: n.name }));
      setTargetFolders(folders);
    } catch {
      setTargetFolders([]);
    }
  };

  const handleMove = async (targetParentId: string) => {
    if (!movingNode) return;
    if (isReadOnly || movingNode.role === "viewer") {
      toast("Bạn chỉ có quyền xem (Chỉ đọc) trên mục này!", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.patch(Api.node(movingNode.id), { parent_id: targetParentId });
      toast(t.actionMove, "success");
      setMovingNode(null);
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t.errorUnexpectedTitle, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentFolderTarget = useMemo(() => {
    let p = filter === "none" ? folderId : "";
    if (filter === "none" && !folderId && (defaultSingleDataset || defaultTargetDataset)) {
      p = `dataset:${defaultSingleDataset || defaultTargetDataset}`;
    }
    return p;
  }, [filter, folderId, defaultSingleDataset, defaultTargetDataset]);

// handlePaste is defined below after useInfiniteList

  const handleRecolor = async (colorKey: string) => {
    if (!recoloringNode) return;
    if (isReadOnly || recoloringNode.role === "viewer") {
      toast("Bạn chỉ có quyền xem (Chỉ đọc) trên mục này!", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.patch(Api.node(recoloringNode.id), { color: colorKey });
      setRecoloringNode(null);
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t.errorUnexpectedTitle, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDatasetUpload = async (files: FileList) => {
    if (!hasAssignedCategory) {
      toast("Tài khoản chưa được chỉ định danh mục lưu trữ. Vui lòng liên hệ quản trị viên để được cấp quyền trước khi tải lên!", "error");
      return;
    }
    if (isReadOnly) {
      toast("Bạn chỉ có quyền xem (Chỉ đọc) trên bộ dữ liệu này, không thể tải lên!", "error");
      return;
    }
    const readiness = await checkStorageReadiness();
    if (!readiness.ready) {
      toast(readiness.message, "error");
      return;
    }
    if (user && user.quota_bytes > 0) {
      const incomingBytes = Array.from(files).reduce((acc, f) => acc + (f.size || 0), 0);
      if (user.quota_bytes_used >= user.quota_bytes || user.quota_bytes_used + incomingBytes > user.quota_bytes) {
        toast("Dung lượng lưu trữ đã đầy, không thể tải tệp lên", "error");
        return;
      }
    }
    let targetFolderId = folderId;
    if (!targetFolderId && (defaultTargetDataset || defaultSingleDataset)) {
      targetFolderId = `dataset:${defaultTargetDataset || defaultSingleDataset}`;
    }

    await transfers.enqueue(Array.from(files), targetFolderId, () => {
      toast(`Đã tải lên ${files.length} tệp thành công!`, "success");
      void load();
    });
  };

  const folderCacheKey = `${folderId || "root"}:${filter}:${query}:${sortBy}:${sortDir}`;
  const cachedFolder = browserFolderCache.get(folderCacheKey);

  const {
    items: rawNodes,
    setItems: setNodes,
    loading,
    loadingMore,
    hasMore,
    error: infiniteError,
    reload: load,
    Sentinel,
  } = useInfiniteList<NodeModel>({
    pageSize: 50,
    getItemKey: (node) => node.id,
    initialItems: cachedFolder?.nodes,
    onItemsUpdated: (updated) => {
      if (updated && updated.length > 0) {
        browserFolderCache.set(folderCacheKey, { nodes: updated, timestamp: Date.now() });
      }
    },
    deps: [folderId, filter, query, sortBy, sortDir, isForbidden, hasAssignedCategory],
    fetchPage: async ({ offset, limit, signal }) => {
      if (isForbidden || !hasAssignedCategory) {
        return { items: [], hasMore: false };
      }

      // If inside a dataset folder:
      if (folderId.startsWith("dataset:")) {
        const data = await api.get<{ nodes: NodeModel[]; has_more?: boolean; next_offset?: number }>(
          Api.nodes,
          {
            parent_id: folderId,
            query: query || undefined,
            sort: sortBy,
            order: sortDir,
            limit,
            offset,
          },
          { signal }
        );
        let dsNodes = data?.nodes ?? [];
        if (query.trim()) {
          const q = query.trim().toLowerCase();
          dsNodes = dsNodes.filter((n) => n.name.toLowerCase().includes(q));
        }
        return {
          items: dsNodes,
          hasMore: Boolean(data?.has_more ?? (dsNodes.length >= limit)),
          nextOffset: data?.next_offset ?? offset + dsNodes.length,
          total: dsNodes.length,
        };
      }

      // Regular backend files:
      if (filter === "trash") {
        const data = await api.get<{ nodes: NodeModel[]; has_more?: boolean; next_offset?: number }>(
          Api.trash,
          { limit, offset },
          { signal }
        );
        const fetched = data?.nodes ?? [];
        return {
          items: fetched,
          hasMore: Boolean(data?.has_more ?? (fetched.length >= limit)),
          nextOffset: data?.next_offset ?? offset + fetched.length,
        };
      }

      let effectiveParentId = filter === "none" ? folderId : "";
      if (filter === "none" && !folderId && defaultSingleDataset) {
        effectiveParentId = `dataset:${defaultSingleDataset}`;
      }

      const data = await api.get<{ nodes: NodeModel[]; has_more?: boolean; next_offset?: number }>(
        Api.nodes,
        {
          parent_id: effectiveParentId,
          filter: filter === "none" ? undefined : filter,
          query: query || undefined,
          sort: sortBy,
          order: sortDir,
          limit,
          offset,
        },
        { signal }
      );
      let fetched = data?.nodes ?? [];

      return {
        items: fetched,
        hasMore: Boolean(data?.has_more ?? (fetched.length >= limit)),
        nextOffset: data?.next_offset ?? offset + fetched.length,
      };
    },
  });

  const nodes = loading ? null : rawNodes;
  const error = infiniteError || (isForbidden ? "Bạn không có quyền truy cập vào bộ dữ liệu này." : "");

  const handlePaste = async (targetParentId: string) => {
    if (!clipboard || clipboard.nodes.length === 0) return;
    const isCut = clipboard.nodes.length > 0 && clipboard.action === "cut";
    let effectiveTarget = targetParentId || currentFolderTarget;
    // If user right-clicked one of the folders currently in clipboard and clicked Paste,
    // paste into the current parent directory so a copy/move happens alongside it.
    if (clipboard.nodes.some((n) => n.id === effectiveTarget)) {
      effectiveTarget = currentFolderTarget;
    }

    // Determine if pasting into the currently displayed directory
    const isCurrentFolder = effectiveTarget === currentFolderTarget;

    // Create optimistic pending placeholder items if pasting into current directory
    const pendingItems: NodeModel[] = isCurrentFolder
      ? clipboard.nodes.map((node, idx) => ({
          ...node,
          id: `pending-${Date.now()}-${idx}-${node.id}`,
          parent_id: effectiveTarget,
          name: node.name,
          status: "pending" as const,
          created_at: Date.now(),
          updated_at: Date.now(),
        }))
      : [];

    if (pendingItems.length > 0) {
      setNodes((prev) => [...pendingItems, ...prev]);
    }

    let hasErrors = false;
    let successCount = 0;

    for (let i = 0; i < clipboard.nodes.length; i++) {
      const node = clipboard.nodes[i];
      const pendingNode = pendingItems[i];

      try {
        await transfers.enqueueTask(
          node.name,
          isCut ? "move" : "copy",
          async () => {
            if (isCut) {
              await api.post(Api.moveNode, {
                node_id: node.id,
                parent_id: effectiveTarget,
              });
            } else {
              await api.post(Api.copyNode, {
                node_id: node.id,
                parent_id: effectiveTarget,
              });
            }
          },
          node.size_bytes || 100,
        );

        successCount++;
        if (pendingNode) {
          setNodes((prev) =>
            prev.map((n) => (n.id === pendingNode.id ? { ...n, status: "done" as const } : n))
          );
        }
      } catch (itemErr: any) {
        hasErrors = true;
        const errMsg = itemErr?.message || "Lỗi thao tác trên mục này";
        if (pendingNode) {
          pendingNode.status = "failed";
          pendingNode.error = errMsg;
          setNodes((prev) =>
            prev.map((n) =>
              n.id === pendingNode.id
                ? { ...n, status: "failed" as const, error: errMsg }
                : n
            )
          );
        }
      }
    }

    if (hasErrors) {
      toast(
        successCount > 0
          ? `Đã xử lý ${successCount} mục, nhưng có lỗi ở các mục còn lại!`
          : "Không thể hoàn thành thao tác dán. Vui lòng kiểm tra quyền hoặc dung lượng!",
        "error"
      );
    } else {
      toast(isCut ? "Đã di chuyển thành công!" : "Đã dán thành công!", "success");
      if (isCut) {
        setClipboard(null);
      }
    }

    // Invalidate local cache and notify all listeners
    browserFolderCache.clear();
    window.dispatchEvent(new CustomEvent("ld_nodes_changed"));

    // Reload directory data from server immediately without manual page refresh
    try {
      await load();
    } catch {}

    // If there were failed items, keep them visible in the view so user sees the exact failure
    if (hasErrors && pendingItems.length > 0) {
      const failedNodes = pendingItems.filter((p) => p.status === "failed");
      if (failedNodes.length > 0) {
        setNodes((prev) => [
          ...failedNodes,
          ...prev.filter((x) => !failedNodes.some((f) => f.id === x.id)),
        ]);
      }
    }
  };

  useEffect(() => {
    let reloadTimer: NodeJS.Timeout | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        void load();
      }, 150);
    };

    const unbindWs = wsClient.onEvent((ev) => {
      const type = ev.type;
      if (
        type.startsWith("node.") ||
        type.startsWith("share.") ||
        type === "quota.updated"
      ) {
        scheduleReload();
      }
    });

    const onPermsUpdated = () => {
      browserFolderCache.clear();
      scheduleReload();
    };
    const onDatasetsUpdated = () => {
      browserFolderCache.clear();
      scheduleReload();
    };
    const onNodesChanged = () => {
      browserFolderCache.clear();
      scheduleReload();
    };
    window.addEventListener("ld_permissions_updated", onPermsUpdated);
    window.addEventListener("ld_datasets_updated", onDatasetsUpdated);
    window.addEventListener("ld_nodes_changed", onNodesChanged);
    window.addEventListener("ld_server_changed", onNodesChanged);

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      unbindWs();
      window.removeEventListener("ld_permissions_updated", onPermsUpdated);
      window.removeEventListener("ld_datasets_updated", onDatasetsUpdated);
      window.removeEventListener("ld_nodes_changed", onNodesChanged);
      window.removeEventListener("ld_server_changed", onNodesChanged);
    };
  }, [load]);

  useEffect(() => {
    setSelection(new Set());
  }, [folderId, filter]);

  const visible = useMemo(() => {
    if (!nodes) return [];
    let list = nodes;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((n) => n.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (isFolder(a) !== isFolder(b)) return isFolder(a) ? -1 : 1;
      let cmp = 0;
      if (sortBy === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortBy === "size") {
        cmp = (a.size_bytes || 0) - (b.size_bytes || 0);
      } else {
        const ta = a.updated_at || a.created_at || 0;
        const tb = b.updated_at || b.created_at || 0;
        cmp = ta - tb;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [nodes, query, sortBy, sortDir]);

  const toggle = useCallback((id: string, additive: boolean, range = false) => {
    if (range) {
      // shift extends from the last thing clicked, the way a file list has
      // behaved since long before any of this
      const ids = rangeBetween(visible.map((n) => n.id), anchor.current, id);
      setSelection(new Set(ids));
      return;
    }
    anchor.current = id;
    setSelection((prev) => {
      const next = new Set(additive ? prev : []);
      if (prev.has(id) && additive) next.delete(id);
      else next.add(id);
      return next;
    });
    // If the details pane is currently open, selecting another file updates the details pane
    if (detailsOpenRef.current) {
      const found = visible.find((n) => n.id === id);
      if (found) {
        setDetailsNode(found);
      }
    }
  }, [visible]);

  // Keep detailsNode in sync when visible nodes are refreshed or modified
  useEffect(() => {
    if (detailsOpen && detailsNode) {
      const updated = visible.find((n) => n.id === detailsNode.id);
      if (updated) {
        setDetailsNode(updated);
      }
    }
  }, [visible, detailsOpen, detailsNode?.id]);

  const activate = useCallback((node: NodeModel) => {
    if (isFolder(node)) onOpenFolder(node);
    else onPreview(node, nodes ? nodes.filter((n) => !isFolder(n)) : undefined);
  }, [onOpenFolder, onPreview, nodes]);

  const effectiveUploaderFolderId =
    !folderId && user && user.role !== "admin" && defaultSingleDataset
      ? `dataset:${defaultSingleDataset}`
      : folderId;

  const { pick: upload, pickFolder: uploadFolder, dropDataTransfer, sheet: clashSheet, busy: resolvingClash } = useUploader(effectiveUploaderFolderId, () => {
    toast(t.transferCompleted, "success");
    void load();
  });

  const chosen = visible.filter((n) => selection.has(n.id));

  const trashChosen = useCallback(async () => {
    const list = visible.filter((n) => selection.has(n.id));
    if (!list.length) return;
    if (isReadOnly || list.some((n) => n.role === "viewer")) {
      toast("Bạn chỉ có quyền xem (Chỉ đọc), không thể xóa tập tin!", "error");
      return;
    }
    for (const node of list) {
      try {
        await api.del(Api.node(node.id));
      } catch {
        /* reported once, below */
      }
    }
    toast(t.confirmTrashTitle, "success");
    setSelection(new Set());
    void load();
  }, [visible, selection, toast, load, isReadOnly, t]);

  const handleRestore = useCallback(async (node: NodeModel) => {
    try {
      await api.post(Api.restore(node.id), {});
      toast(t.restore, "success");
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t.errorUnexpectedTitle, "error");
    }
  }, [load, t, toast]);

  // the rubber band, and the keys a file manager is expected to answer to
  const band = useMarquee({
    containerRef: listRef,
    itemSelector: "[data-node-id]",
    onChange: useCallback((ids: string[], additive: boolean) => {
      setSelection((prev) => (additive ? new Set([...prev, ...ids]) : new Set(ids)));
    }, []),
    onEmptyClick: useCallback(() => setSelection(new Set()), []),
  });

  // anything layered over the grid owns the keyboard while it is up: Escape has
  // to dismiss the sheet, not silently empty the selection underneath it
  const layered =
    sharing !== null || renamingNode !== null || createFolderOpen || menu !== null || overflow !== null || resolvingClash;

  useFileKeys({
    onSelectAll: useCallback(() => setSelection(new Set(visible.map((n) => n.id))), [visible]),
    onDelete: () => void trashChosen(),
    onEscape: useCallback(() => setSelection(new Set()), []),
    onCopy: useCallback(() => {
      const list = visible.filter((n) => selection.has(n.id));
      if (!list.length) return;
      setClipboard({ action: "copy", nodes: list });
      toast(`Đã sao chép ${list.length} mục vào bộ nhớ tạm`, "success");
    }, [visible, selection, toast]),
    onCut: useCallback(() => {
      const list = visible.filter((n) => selection.has(n.id));
      if (!list.length) return;
      if (isReadOnly || list.some((n) => n.role === "viewer")) {
        toast("Bạn chỉ có quyền xem (Chỉ đọc), không thể cắt mục này!", "error");
        return;
      }
      setClipboard({ action: "cut", nodes: list });
      toast(`Đã cắt ${list.length} mục vào bộ nhớ tạm`, "success");
    }, [visible, selection, isReadOnly, toast]),
    onPaste: useCallback(() => {
      if (!clipboard || clipboard.nodes.length === 0) return;
      if (isReadOnly) {
        toast("Bạn chỉ có quyền xem (Chỉ đọc), không thể dán vào thư mục này!", "error");
        return;
      }
      void handlePaste(currentFolderTarget);
    }, [clipboard, isReadOnly, currentFolderTarget, toast]),
    onRename: useCallback(() => {
      const list = visible.filter((n) => selection.has(n.id));
      if (list.length !== 1) return;
      const target = list[0];
      if (isReadOnly || target.role === "viewer") {
        toast("Bạn chỉ có quyền xem (Chỉ đọc) trên mục này!", "error");
        return;
      }
      setRenamingNode(target);
      setRenameName(target.name);
    }, [visible, selection, isReadOnly, toast]),
    enabled: !layered,
  });

  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const { over, dragProps, folderProps } = useNodeDrag(
    useCallback(
      async (ids: string[], intoFolderId: string) => {
        for (const id of ids) {
          const item = visible.find((n) => n.id === id);
          try {
            await transfers.enqueueTask(
              item?.name || id,
              "move",
              async () => {
                await api.post(Api.moveNode, { node_id: id, parent_id: intoFolderId });
              },
              item?.size_bytes || 100,
            );
          } catch {
            /* a move the server refuses stays where it was */
          }
        }
        toast(t.actionMove, "success");
        setSelection(new Set());
        void load();
      },
      [toast, load],
    ),
    // dropped straight onto a folder tile, so it lands there rather than in
    // whatever folder happens to be open
    useCallback(
      (dt: DataTransfer, intoFolderId: string) => {
        void dropDataTransfer(dt, intoFolderId);
      },
      [dropDataTransfer],
    ),
    useCallback(() => selectionRef.current, []),
  );

  const subtitle =
    filter === "trash"
      ? t.trashRetentionNote({ days: 30 })
      : filter === "shared"
        ? t.sharePeopleHint
        : undefined;

  return (
    <div
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", position: "relative" }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!hasAssignedCategory) {
          toast("Tài khoản chưa được chỉ định danh mục lưu trữ. Vui lòng liên hệ quản trị viên!", "error");
          return;
        }
        if (isReadOnly) {
          toast("Bạn chỉ có quyền xem (Chỉ đọc) trên bộ dữ liệu này, không thể tải lên!", "error");
          return;
        }
        if (user && user.quota_bytes > 0 && user.quota_bytes_used >= user.quota_bytes) {
          toast("Dung lượng lưu trữ đã đầy, không thể tải tệp lên", "error");
          return;
        }
        void dropDataTransfer(e.dataTransfer, folderId);
      }}
      // clearing on a click into nothing belongs to the marquee, which knows
      // whether the press became a drag. A second handler here fired after
      // every rubber band and wiped what it had just selected.
    >
      {/*
        FilesToolbar. The title is titleLarge and takes the free width; the
        controls sit at the trailing end after a 16 gap, so a long folder name
        never touches the first button.

        A phone keeps the one control people reach for constantly and folds the
        rest into a menu: four buttons at the minimum tap size plus their gaps
        eat 216 of about 375 points and leave the name a stub.
      */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          height: isDesktop ? 64 : undefined,
          padding: isDesktop
            ? "0 24px"
            : "max(8px, env(safe-area-inset-top)) 16px 8px",
          borderBottom: isDesktop ? "1px solid var(--stroke)" : undefined,
          position: "sticky",
          top: 0,
          background: "var(--bg-primary)",
          zIndex: 60,
        }}
      >
        {/* the name keeps its width and the free space goes between it and the
            controls, so a folder name is never squeezed to an ellipsis while
            the toolbar has room to spare */}
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
          {isMobile && trail && trail.length > 0 && (
            <Tappable
              onClick={() => {
                if (trail.length === 1) onRoot?.();
                else onNavigateTrail?.(trail.length - 2);
              }}
              radius={22}
              style={{ padding: 6, marginRight: 2, flex: "none" }}
            >
              <Icon glyph="chevron-left" size={20} />
            </Tappable>
          )}

          {chosen.length >= 2 ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minWidth: 0,
                whiteSpace: "nowrap",
              }}
            >
              <Tappable onClick={() => setSelection(new Set())} radius={999} style={{ padding: 6, marginRight: 2 }} title={t.actionCancel}>
                <Icon glyph="close" size={18} />
              </Tappable>
              <span className="t-title-lg" style={{ marginRight: 4 }}>
                {t.selectedCount({ count: chosen.length })}
              </span>
              <Tappable onClick={() => setSelection(new Set(visible.map((n) => n.id)))} radius={999} style={{ padding: 6 }} title={t.actionSelect}>
                <Icon glyph="check" size={18} />
              </Tappable>
              <Tappable
                radius={999}
                style={{ padding: 6, color: "var(--warning)" }}
                title={t.confirmTrashTitle}
                onClick={() => void trashChosen()}
              >
                <Icon glyph="trash" size={18} />
              </Tappable>
            </div>
          ) : isDesktop && filter === "none" ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                overflowX: "auto",
                whiteSpace: "nowrap",
                padding: "4px 0",
              }}
            >
              <Tappable
                onClick={onRoot}
                radius={10}
                style={{
                  padding: "4px 6px",
                  color: trail && trail.length > 0 ? "var(--fg-secondary)" : "var(--fg-primary)",
                  cursor: trail && trail.length > 0 ? "pointer" : "default",
                }}
              >
                <span className={trail && trail.length > 0 ? "t-body-md" : "t-title-lg"}>
                  {t.myFiles}
                </span>
              </Tappable>
              {(() => {
                if (!trail || trail.length === 0) return null;
                const visibleTrail: ({ id: string; name: string } | null)[] =
                  trail.length > 3
                    ? [trail[0], null, trail[trail.length - 2], trail[trail.length - 1]]
                    : trail;

                return visibleTrail.map((item, idx) => {
                  if (item === null) {
                    return (
                      <span key="ellipsis" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Icon glyph="chevron-right" size={14} color="var(--fg-muted)" />
                        <span className="t-body-md" style={{ color: "var(--fg-secondary)", padding: "4px 2px" }}>
                          ...
                        </span>
                      </span>
                    );
                  }
                  const isLast = idx === visibleTrail.length - 1;
                  const realIndex = trail.findIndex((tr) => tr.id === item.id);
                  return (
                    <span key={item.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Icon glyph="chevron-right" size={14} color="var(--fg-muted)" />
                      <Tappable
                        onClick={() => (!isLast ? onNavigateTrail?.(realIndex) : undefined)}
                        radius={10}
                        style={{
                          padding: "4px 6px",
                          color: isLast ? "var(--fg-primary)" : "var(--fg-secondary)",
                          cursor: isLast ? "default" : "pointer",
                        }}
                      >
                        <span className={isLast ? "t-title-sm" : "t-body-md"} style={{ fontWeight: isLast ? 600 : 400 }}>
                          {item.name}
                        </span>
                      </Tappable>
                    </span>
                  );
                });
              })()}
            </div>
          ) : (
            <div>
              <h1
                className="t-title-lg"
                style={{
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {title}
              </h1>
              {subtitle && isDesktop && (
                <div className="t-body-sm" style={{ color: "var(--fg-secondary)", marginTop: 2 }}>
                  {subtitle}
                </div>
              )}
            </div>
          )}
        </div>
        <span style={{ flex: 1, minWidth: 16 }} />

        {isMobile ? (
          filter === "trash" ? (
            nodes && nodes.length > 0 ? (
              <Button
                label={t.emptyTrashAction}
                glyph="trash"
                variant="danger"
                compact
                expand={false}
                onClick={() => setConfirmEmptyTrash(true)}
              />
            ) : null
          ) : (
            <span style={{ display: "inline-flex", gap: 4 }}>
              <UtilityButton glyph="search" title={t.search} onClick={onSearch ?? (() => setSearching((s) => !s))} />
              <UtilityButton
                glyph="more"
                title={t.moreActions}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setOverflow({
                    anchorRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
                    x: rect.right,
                    y: rect.bottom,
                  });
                }}
              />
            </span>
          )
        ) : !isDesktop ? (
          filter === "trash" ? (
            nodes && nodes.length > 0 ? (
              <Button
                label={t.emptyTrashAction}
                glyph="trash"
                variant="danger"
                compact
                expand={false}
                onClick={() => setConfirmEmptyTrash(true)}
              />
            ) : null
          ) : filter === "shared" ? (
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <UtilityButton
                glyph="sort"
                title={t.sortBy}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setSortMenu({
                    anchorRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
                    x: rect.right,
                    y: rect.bottom,
                  });
                }}
              />
              <UtilityButton
                glyph={view === "grid" ? "list" : "grid"}
                title={view === "grid" ? t.viewList : t.viewGrid}
                onClick={() => setView((v) => (v === "grid" ? "list" : "grid"))}
              />
            </span>
          ) : (
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <UtilityButton glyph="search" title={t.search} onClick={onSearch ?? (() => setSearching((s) => !s))} />
              <UtilityButton
                glyph="sort"
                title={t.sortBy}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setSortMenu({
                    anchorRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
                    x: rect.right,
                    y: rect.bottom,
                  });
                }}
              />
              <UtilityButton
                glyph={view === "grid" ? "list" : "grid"}
                title={view === "grid" ? t.viewList : t.viewGrid}
                onClick={() => setView((v) => (v === "grid" ? "list" : "grid"))}
              />
              {filter === "none" && !isReadOnly && hasAssignedCategory && (
                <UtilityButton glyph="folder" title={t.newFolder} onClick={() => { setFolderName(""); setCreateFolderOpen(true); }} />
              )}
              {!isReadOnly && hasAssignedCategory && (
                <Button
                  label={t.upload}
                  glyph="upload"
                  compact
                  expand={false}
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setUploadMenuAnchor({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
                  }}
                />
              )}
            </span>
          )
        ) : (
          filter === "trash" ? (
            nodes && nodes.length > 0 ? (
              <Button
                label={t.emptyTrashAction}
                glyph="trash"
                variant="danger"
                compact
                expand={false}
                onClick={() => setConfirmEmptyTrash(true)}
              />
            ) : null
          ) : (
            <>
              {/* Centered Search Field */}
              <div
                style={{
                  flex: "1 1 360px",
                  maxWidth: 480,
                  margin: "0 24px",
                  display: "flex",
                  alignItems: "center",
                  height: 44,
                  padding: "0 16px",
                  background: "var(--bg-elevated)",
                  border: `1px solid ${desktopSearchFocused ? "var(--accent)" : "var(--stroke)"}`,
                  borderRadius: "var(--r-pill)",
                }}
              >
                <Icon glyph="search" size={18} color="var(--fg-secondary)" />
                <input
                  value={query}
                  onFocus={() => setDesktopSearchFocused(true)}
                  onBlur={() => setDesktopSearchFocused(false)}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.search}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    marginInlineStart: 10,
                    background: "transparent",
                    border: 0,
                    outline: "none",
                    color: "var(--fg-primary)",
                    font: "inherit",
                    fontSize: 15,
                  }}
                />
                {query && (
                  <Tappable radius={16} onClick={() => setQuery("")} style={{ padding: 4, color: "var(--fg-secondary)" }}>
                    <Icon glyph="close" size={16} />
                  </Tappable>
                )}
              </div>

              {/* Action Buttons on Right */}
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <UtilityButton
                  glyph="sort"
                  title={t.sortBy}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setSortMenu({
                      anchorRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
                      x: rect.right,
                      y: rect.bottom,
                    });
                  }}
                />
                <UtilityButton
                  glyph={view === "grid" ? "list" : "grid"}
                  title={view === "grid" ? t.viewList : t.viewGrid}
                  onClick={() => setView((v) => (v === "grid" ? "list" : "grid"))}
                />
                {filter === "none" && !isReadOnly && hasAssignedCategory && (
                  <UtilityButton
                    glyph="folder"
                    title={t.newFolder}
                    onClick={() => {
                      setFolderName("");
                      setCreateFolderOpen(true);
                    }}
                  />
                )}
                {!isReadOnly && hasAssignedCategory && (
                  <Button
                    label={t.upload}
                    glyph="upload"
                    compact
                    expand={false}
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setUploadMenuAnchor({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
                    }}
                  />
                )}
              </span>
            </>
          )
        )}
      </header>

      {!hasAssignedCategory ? (
        <div
          style={{
            padding: "10px 24px",
            background: "rgba(239, 68, 68, 0.1)",
            borderBottom: "1px solid rgba(239, 68, 68, 0.25)",
            color: "var(--danger)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Icon glyph="lock" size={16} color="var(--danger)" />
          <span>
            <b>Chưa phân quyền danh mục:</b> Tài khoản của bạn chưa được chỉ định danh mục lưu trữ nào. Vui lòng liên hệ quản trị viên để được cấp quyền trước khi xem hoặc tải lên tệp tin.
          </span>
        </div>
      ) : isReadOnly ? (
        <div
          style={{
            padding: "10px 24px",
            background: "rgba(234, 179, 8, 0.12)",
            borderBottom: "1px solid rgba(234, 179, 8, 0.25)",
            color: "#ca8a04",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Icon glyph="lock" size={16} color="#ca8a04" />
          <span>
            <b>Bộ dữ liệu chỉ đọc:</b> Bạn chỉ có quyền xem nội dung và không thể tải lên, tạo thư mục hoặc xóa tập tin trong bộ dữ liệu này.
          </span>
        </div>
      ) : null}

      {filter === "trash" && isMobile && (
        <Banner glyph="recent" message={t.trashRetentionNote({ days: 30 })} tint="var(--fg-secondary)" />
      )}

      {storageReadiness && !storageReadiness.ready && (
        <div style={{ margin: "0 16px 12px" }}>
          <div
            style={{
              padding: "10px 16px",
              background: "rgba(234, 134, 0, 0.08)",
              border: "1px solid rgba(234, 134, 0, 0.28)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              color: "var(--fg-primary)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon glyph="storage" size={20} color="#ea8600" />
              <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 600, color: "#ea8600", marginRight: 6 }}>Chưa sẵn sàng lưu tệp:</span>
                <span>{storageReadiness.message}</span>
              </div>
            </div>
            {user?.role === "admin" && (storageReadiness.code === "no_pool" || storageReadiness.code === "no_dataset") && (
              <Button
                label={storageReadiness.code === "no_pool" ? "Tạo Nhóm lưu trữ" : "Tạo Tập dữ liệu"}
                variant="primary"
                compact
                onClick={() => {
                  if (typeof window !== "undefined") {
                    const target = storageReadiness.code === "no_pool" ? "/settings/storage_pools" : "/settings/datasets";
                    window.history.pushState(null, "", target);
                    window.dispatchEvent(new PopStateEvent("popstate"));
                  }
                }}
              />
            )}
          </div>
        </div>
      )}

      {searching && (
        <div style={{ padding: "0 16px 8px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 44,
              padding: "0 14px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--stroke)",
              borderRadius: "var(--r-pill)",
            }}
          >
            <Icon glyph="search" size={17} color="var(--fg-secondary)" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search}
              style={{
                flex: 1,
                background: "transparent",
                border: 0,
                outline: "none",
                color: "var(--fg-primary)",
                font: "inherit",
                fontSize: 14,
              }}
            />
          </div>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={async (e) => {
          if (!e.target.files) return;
          if (!hasAssignedCategory) {
            toast("Tài khoản chưa được chỉ định danh mục lưu trữ. Vui lòng liên hệ quản trị viên để được cấp quyền trước khi tải lên!", "error");
            e.target.value = "";
            return;
          }
          const readiness = await checkStorageReadiness();
          if (!readiness.ready) {
            toast(readiness.message, "error");
            e.target.value = "";
            return;
          }
          if (isReadOnly) {
            toast("Bạn chỉ có quyền xem (Chỉ đọc) trên bộ dữ liệu này, không thể tải lên!", "error");
            e.target.value = "";
            return;
          }
          if (user && user.quota_bytes > 0 && user.quota_bytes_used >= user.quota_bytes) {
            toast("Dung lượng lưu trữ đã đầy, không thể tải tệp lên", "error");
            e.target.value = "";
            return;
          }
          if (folderId.startsWith("dataset:") || (!folderId && defaultTargetDataset)) {
            handleDatasetUpload(e.target.files);
          } else {
            void upload(e.target.files);
          }
          e.target.value = "";
        }}
      />

      <input
        ref={(el) => {
          (folderInput as any).current = el;
          if (el) {
            el.setAttribute("webkitdirectory", "");
            el.setAttribute("directory", "");
            (el as any).webkitdirectory = true;
            (el as any).directory = true;
          }
        }}
        type="file"
        multiple
        hidden
        {...({ webkitdirectory: "", directory: "" } as any)}
        onChange={async (e) => {
          if (!e.target.files) return;
          if (!hasAssignedCategory) {
            toast("Tài khoản chưa được chỉ định danh mục lưu trữ. Vui lòng liên hệ quản trị viên để được cấp quyền trước khi tải lên!", "error");
            e.target.value = "";
            return;
          }
          const readiness = await checkStorageReadiness();
          if (!readiness.ready) {
            toast(readiness.message, "error");
            e.target.value = "";
            return;
          }
          if (isReadOnly) {
            toast("Bạn chỉ có quyền xem (Chỉ đọc) trên bộ dữ liệu này, không thể tải lên!", "error");
            e.target.value = "";
            return;
          }
          if (user && user.quota_bytes > 0 && user.quota_bytes_used >= user.quota_bytes) {
            toast("Dung lượng lưu trữ đã đầy, không thể tải tệp lên", "error");
            e.target.value = "";
            return;
          }
          void uploadFolder(e.target.files);
          e.target.value = "";
        }}
      />

      {/* listing */}
      <div
        ref={listRef}
        style={{ flex: 1, minHeight: 0 }}
        onContextMenu={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("[data-node-id]")) return;
          if (target.closest("button, a, input, select, textarea")) return;
          e.preventDefault();
          setCanvasMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : nodes === null ? (
          view === "grid" && filter !== "trash" ? <GridSkeleton /> : <ListSkeleton />
        ) : !hasAssignedCategory ? (
          <EmptyState
            glyph="folder"
            title="Chưa được chỉ định danh mục lưu trữ"
            message="Tài khoản của bạn chưa được phân quyền truy cập danh mục lưu trữ nào. Vui lòng liên hệ quản trị viên để được cấp quyền trước khi xem hoặc tải lên tệp tin."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            glyph={
              query
                ? "search"
                : filter === "trash"
                  ? "trash"
                  : filter === "starred"
                    ? "star"
                    : filter === "recent"
                      ? "recent"
                      : filter === "shared"
                        ? "shared"
                        : "folder"
            }
            title={query ? t.emptySearchTitle : emptyTitle(filter, t)}
            message={query ? t.emptySearchBody : emptyBody(filter, t)}
            actionLabel={filter === "none" && !query && !isReadOnly && hasAssignedCategory ? t.upload : undefined}
            onAction={
              filter === "none" && !query
                ? (e?: any) => {
                    if (e && e.currentTarget) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setUploadMenuAnchor({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
                    } else {
                      setUploadMenuAnchor({
                        left: typeof window !== "undefined" ? Math.max(16, window.innerWidth / 2 - 120) : 200,
                        right: typeof window !== "undefined" ? window.innerWidth / 2 + 120 : 440,
                        top: typeof window !== "undefined" ? window.innerHeight / 2 : 200,
                        bottom: typeof window !== "undefined" ? window.innerHeight / 2 + 40 : 240,
                      });
                    }
                  }
                : undefined
            }
          />
        ) : view === "grid" && filter !== "trash" ? (
          <Grid nodes={visible} selection={selection} onToggle={toggle} onActivate={activate} onMenu={setMenu} dragProps={dragProps} folderProps={folderProps} over={over} isMobile={isMobile} Sentinel={Sentinel} />
        ) : (
          <List
            nodes={visible}
            selection={selection}
            onToggle={toggle}
            onActivate={activate}
            onMenu={setMenu}
            dragProps={dragProps}
            folderProps={folderProps}
            over={over}
            isTrash={filter === "trash"}
            onRestore={handleRestore}
            onDeleteForever={(n) => setConfirmDeleteNode(n)}
            isMobile={isMobile}
            Sentinel={Sentinel}
          />
        )}
      </div>

      {/* Details/Preview pane: opens ONLY when user right-clicks and chooses 'Xem trước',
          stays open when switching to another file, and closes ONLY when user clicks 'x' */}
      {isDesktop && detailsOpen && detailsNode && (
        <DetailsErrorBoundary onClose={() => { setDetailsOpen(false); setDetailsNode(null); }}>
          <DetailsPane
            node={detailsNode}
            onClose={() => {
              setDetailsOpen(false);
              setDetailsNode(null);
            }}
            onOpen={activate}
            onChanged={() => void load()}
            onShare={(n) => setSharing(n)}
          />
        </DetailsErrorBoundary>
      )}

      {sharing && <ShareSheet node={sharing} onClose={() => setSharing(null)} />}

      {clashSheet}

      {band && <div style={bandStyle(band)} />}

      {/* drop overlay: the whole surface, so "let go anywhere" needs no reading */}
      {dragging && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 400,
            background: wash("#4C8DFF", 0.1),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              padding: "32px 40px",
              background: "var(--bg-elevated)",
              border: "2px solid var(--accent)",
              borderRadius: "var(--r-card)",
              textAlign: "center",
            }}
          >
            <Icon glyph="upload" size={44} color="var(--accent)" />
            <div className="t-title-md" style={{ marginTop: 16 }}>
              Drop to upload
            </div>
          </div>
        </div>
      )}

      {/* what the phone folds away, rather than cramming into the row */}
      <Menu
        open={Boolean(overflow)}
        anchorRect={overflow?.anchorRect}
        x={overflow?.x}
        y={overflow?.y}
        title={t.moreActions}
        onClose={() => setOverflow(null)}
        items={[
          {
            label: view === "grid" ? t.viewList : t.viewGrid,
            glyph: view === "grid" ? "list" : "grid",
            onClick: () => setView((v) => (v === "grid" ? "list" : "grid")),
          },
          {
            label: t.sortBy,
            glyph: "sort",
            onClick: () => setSortMenu({ anchorRect: overflow?.anchorRect, x: overflow?.x, y: overflow?.y }),
          },
          ...(!isReadOnly && hasAssignedCategory
            ? [
                { label: t.newFolder, glyph: "folder-plus" as Glyph, onClick: () => { setFolderName(""); setCreateFolderOpen(true); } },
                { label: t.uploadFile, glyph: "upload" as Glyph, onClick: () => fileInput.current?.click() },
                { label: t.uploadFolder, glyph: "folder" as Glyph, onClick: () => folderInput.current?.click() },
              ]
            : []),
          { label: t.actionRefresh, glyph: "refresh", onClick: () => void load() },
        ]}
      />

      {/* Sort Menu */}
      <Menu
        open={Boolean(sortMenu)}
        anchorRect={sortMenu?.anchorRect}
        x={sortMenu?.x}
        y={sortMenu?.y}
        title={t.sortBy}
        onClose={() => setSortMenu(null)}
        items={[
          {
            label: t.sortName,
            glyph: sortBy === "name" ? (sortDir === "desc" ? "arrow-down" : "arrow-up") : "sort",
            onClick: () => {
              if (sortBy === "name") setSortDir((d) => (d === "asc" ? "desc" : "asc"));
              else {
                setSortBy("name");
                setSortDir("asc");
              }
            },
          },
          {
            label: t.sortUpdated,
            glyph: sortBy === "updated" ? (sortDir === "desc" ? "arrow-down" : "arrow-up") : "recent",
            onClick: () => {
              if (sortBy === "updated") setSortDir((d) => (d === "asc" ? "desc" : "asc"));
              else {
                setSortBy("updated");
                setSortDir("desc");
              }
            },
          },
          {
            label: t.sortSize,
            glyph: sortBy === "size" ? (sortDir === "desc" ? "arrow-down" : "arrow-up") : "filter",
            onClick: () => {
              if (sortBy === "size") setSortDir((d) => (d === "asc" ? "desc" : "asc"));
              else {
                setSortBy("size");
                setSortDir("desc");
              }
            },
          },
        ]}
      />

      <Menu
        open={Boolean(menu)}
        anchorRect={menu?.anchorRect}
        x={menu?.x}
        y={menu?.y}
        title={menu?.isBulk ? t.selectedCount({ count: chosen.length }) : menu?.node.name}
        subtitle={menu && !menu.isBulk ? subtitleFor(menu.node) : undefined}
        onClose={() => setMenu(null)}
        items={
          menu
            ? menu.isBulk
              ? [
                  {
                    label: chosen.every((n) => n.starred) ? t.starred : t.starred,
                    glyph: (chosen.every((n) => n.starred) ? "star-filled" : "star") as Glyph,
                    onClick: async () => {
                      const allStarred = chosen.every((n) => n.starred);
                      for (const n of chosen) {
                        if (allStarred) await api.del(Api.star(n.id));
                        else await api.post(Api.star(n.id), {});
                      }
                      void load();
                    },
                  },
                  ...(chosen.some((n) => !isFolder(n))
                    ? [
                        {
                          label: t.download,
                          glyph: "download" as Glyph,
                          onClick: () => {
                            for (const n of chosen) {
                              if (!isFolder(n)) {
                                window.open(api.media(Api.download(n.id)), "_blank");
                              }
                            }
                          },
                        },
                      ]
                    : []),
                  {
                    label: "Cắt",
                    glyph: "cut" as Glyph,
                    disabled: isReadOnly || chosen.some((n) => n.role === "viewer"),
                    onClick: () => {
                      setClipboard({ action: "cut", nodes: chosen });
                      toast(`Đã cắt ${chosen.length} mục vào bộ nhớ tạm`, "success");
                    },
                  },
                  {
                    label: t.actionCopy || "Sao chép",
                    glyph: "copy" as Glyph,
                    onClick: () => {
                      setClipboard({ action: "copy", nodes: chosen });
                      toast(`Đã sao chép ${chosen.length} mục vào bộ nhớ tạm`, "success");
                    },
                  },
                  {
                    label: t.actionDeselect,
                    glyph: "close" as Glyph,
                    onClick: () => setSelection(new Set()),
                  },
                  {
                    label: t.trash,
                    glyph: "trash" as Glyph,
                    danger: true,
                    onClick: () => void trashChosen(),
                  },
                ]
              : filter === "trash"
              ? [
                  {
                    label: t.restore,
                    glyph: "restore",
                    onClick: async () => {
                      try {
                        await api.post(Api.restore(menu.node.id), {});
                        toast(t.restore, "success");
                        void load();
                      } catch (e) {
                        toast(e instanceof Error ? e.message : t.errorUnexpectedTitle, "error");
                      }
                    },
                  },
                  {
                    label: t.permanentlyDelete,
                    glyph: "trash",
                    danger: true,
                    onClick: async () => {
                      try {
                        await api.del(Api.permanent(menu.node.id));
                        toast(t.permanentlyDelete, "success");
                        void load();
                      } catch (e) {
                        toast(e instanceof Error ? e.message : t.errorUnexpectedTitle, "error");
                      }
                    },
                  },
                ]
              : [
                  {
                    label: t.actionOpen,
                    glyph: (isFolder(menu.node) ? "folder" : "folder-open") as Glyph,
                    onClick: () => activate(menu.node),
                  },
                  {
                    label: "Xem trước",
                    glyph: "eye" as Glyph,
                    onClick: () => {
                      setDetailsNode(menu.node);
                      setDetailsOpen(true);
                      setSelection(new Set([menu.node.id]));
                    },
                  },
                  ...(!isFolder(menu.node)
                    ? [
                        {
                          label: t.download,
                          glyph: "download" as Glyph,
                          onClick: () => window.open(api.media(Api.download(menu.node.id)), "_blank"),
                        },
                      ]
                    : []),
                  {
                    label: t.actionRename,
                    glyph: "edit" as Glyph,
                    disabled: isReadOnly || menu.node.role === "viewer",
                    onClick: () => {
                      setRenamingNode(menu.node);
                      setRenameName(menu.node.name);
                    },
                  },
                  ...(isFolder(menu.node) && !isReadOnly && menu.node.role !== "viewer"
                    ? [
                        {
                          label: t.folderColor,
                          glyph: "grid" as Glyph,
                          onClick: () => setRecoloringNode(menu.node),
                        },
                      ]
                    : []),
                  {
                    label: "Cắt",
                    glyph: "cut" as Glyph,
                    disabled: isReadOnly || menu.node.role === "viewer",
                    onClick: () => {
                      const targets = selection.has(menu.node.id)
                        ? visible.filter((n) => selection.has(n.id))
                        : [menu.node];
                      setClipboard({ action: "cut", nodes: targets });
                      toast(`Đã cắt ${targets.length} mục vào bộ nhớ tạm`, "success");
                    },
                  },
                  {
                    label: t.actionCopy || "Sao chép",
                    glyph: "copy" as Glyph,
                    onClick: () => {
                      const targets = selection.has(menu.node.id)
                        ? visible.filter((n) => selection.has(n.id))
                        : [menu.node];
                      setClipboard({ action: "copy", nodes: targets });
                      toast(`Đã sao chép ${targets.length} mục vào bộ nhớ tạm`, "success");
                    },
                  },
                  {
                    label: "Dán",
                    glyph: "paste" as Glyph,
                    disabled:
                      !clipboard ||
                      clipboard.nodes.length === 0 ||
                      isReadOnly ||
                      (isFolder(menu.node) && menu.node.role === "viewer"),
                    onClick: () =>
                      void handlePaste(isFolder(menu.node) ? menu.node.id : currentFolderTarget),
                  },
                  {
                    label: t.actionShare,
                    glyph: "share" as Glyph,
                    disabled: isReadOnly || menu.node.role === "viewer",
                    onClick: () => setSharing(menu.node),
                  },
                  {
                    label: t.starred,
                    glyph: (menu.node.starred ? "star-filled" : "star") as Glyph,
                    onClick: async () => {
                      if (menu.node.starred) await api.del(Api.star(menu.node.id));
                      else await api.post(Api.star(menu.node.id), {});
                      void load();
                    },
                  },
                  {
                    label: t.trash,
                    glyph: "trash" as Glyph,
                    danger: true,
                    disabled: isReadOnly || menu.node.role === "viewer",
                    onClick: async () => {
                      await api.del(Api.node(menu.node.id));
                      toast(t.trash, "success");
                      void load();
                    },
                  },
                ]
            : []
        }
      />

      <Menu
        open={Boolean(canvasMenu)}
        x={canvasMenu?.x}
        y={canvasMenu?.y}
        onClose={() => setCanvasMenu(null)}
        items={[
          ...(filter === "none" && !isReadOnly && hasAssignedCategory
            ? [
                {
                  label: t.newFolder,
                  glyph: "folder-plus" as Glyph,
                  onClick: () => {
                    setFolderName("");
                    setCreateFolderOpen(true);
                  },
                },
                {
                  label: t.uploadFile,
                  glyph: "upload" as Glyph,
                  onClick: () => fileInput.current?.click(),
                },
                {
                  label: t.uploadFolder,
                  glyph: "folder" as Glyph,
                  onClick: () => folderInput.current?.click(),
                },
              ]
            : []),
          {
            label: "Dán",
            glyph: "paste" as Glyph,
            disabled:
              !clipboard ||
              clipboard.nodes.length === 0 ||
              isReadOnly ||
              !hasAssignedCategory,
            onClick: () => void handlePaste(currentFolderTarget),
          },
          {
            label: t.actionRefresh,
            glyph: "refresh" as Glyph,
            onClick: () => void load(),
          },
          ...(visible.length > 0
            ? [
                {
                  label: t.actionSelect,
                  glyph: "check" as Glyph,
                  onClick: () => setSelection(new Set(visible.map((n) => n.id))),
                },
              ]
            : []),
          ...(filter === "trash" && nodes && nodes.length > 0
            ? [
                {
                  label: t.emptyTrashAction,
                  glyph: "trash" as Glyph,
                  danger: true,
                  onClick: () => setConfirmEmptyTrash(true),
                },
              ]
            : []),
        ]}
      />

      <Menu
        open={Boolean(uploadMenuAnchor)}
        anchorRect={uploadMenuAnchor}
        onClose={() => setUploadMenuAnchor(null)}
        items={[
          {
            label: t.uploadFile,
            glyph: "upload" as Glyph,
            onClick: () => {
              setUploadMenuAnchor(null);
              fileInput.current?.click();
            },
          },
          {
            label: t.uploadFolder,
            glyph: "folder" as Glyph,
            onClick: () => {
              setUploadMenuAnchor(null);
              folderInput.current?.click();
            },
          },
        ]}
      />

      <Dialog open={createFolderOpen} onClose={() => setCreateFolderOpen(false)} title={t.newFolder}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreateFolder();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          <TextField
            autoFocus
            value={folderName}
            onChange={setFolderName}
            label={t.folderNameLabel}
            hint={t.folderNameHint}
          />
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <Button label={t.actionCancel} variant="quiet" expand={false} compact onClick={() => setCreateFolderOpen(false)} />
            <Button label={t.actionSave} variant="primary" expand={false} compact busy={isSubmitting} type="submit" />
          </div>
        </form>
      </Dialog>

      <Dialog open={Boolean(renamingNode)} onClose={() => setRenamingNode(null)} title={t.actionRename}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleRename();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          <TextField
            autoFocus
            value={renameName}
            onChange={setRenameName}
            label={t.renameTo}
          />
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <Button label={t.actionCancel} variant="quiet" expand={false} compact onClick={() => setRenamingNode(null)} />
            <Button label={t.actionSave} variant="primary" expand={false} compact busy={isSubmitting} type="submit" />
          </div>
        </form>
      </Dialog>

      {/* Folder recolor dialog */}
      <Dialog
        open={Boolean(recoloringNode)}
        onClose={() => setRecoloringNode(null)}
        title={t.folderColor}
      >
        {recoloringNode && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div className="t-body-sm" style={{ color: "var(--fg-secondary)" }}>
                {recoloringNode.name}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                justifyContent: "center",
                padding: "8px 0",
              }}
            >
              {Object.entries(folderSwatches).map(([key, hex]) => {
                const isSelected = (recoloringNode.color || "neutral") === key;
                return (
                  <Tappable
                    key={key}
                    onClick={() => void handleRecolor(key)}
                    radius={22}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: hex,
                      border: `2px solid ${isSelected ? "var(--fg-primary)" : "transparent"}`,
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    {isSelected && (
                      <Icon glyph="check" size={20} color="var(--bg-primary)" strokeWidth={2.4} />
                    )}
                  </Tappable>
                );
              })}
            </div>
          </div>
        )}
      </Dialog>

      {/* Move dialog */}
      <Dialog
        open={Boolean(movingNode)}
        onClose={() => setMovingNode(null)}
        title={t.actionMove}
      >
        {movingNode && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="t-body-sm" style={{ color: "var(--fg-secondary)" }}>
              {movingNode.name}
            </div>
            <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              <Tappable
                onClick={() => void handleMove("")}
                radius={8}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  border: "1px solid var(--stroke)",
                  borderRadius: "var(--r-chip)",
                }}
              >
                <Icon glyph="home" size={18} color="var(--accent)" />
                <span className="t-body-md" style={{ flex: 1 }}>{t.navHome} (Root)</span>
              </Tappable>
              {targetFolders.map((f) => (
                <Tappable
                  key={f.id}
                  onClick={() => void handleMove(f.id)}
                  radius={8}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    border: "1px solid var(--stroke)",
                    borderRadius: "var(--r-chip)",
                  }}
                >
                  <Icon glyph="folder" size={18} color="var(--accent)" />
                  <span className="t-body-md" style={{ flex: 1 }}>{f.name}</span>
                </Tappable>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                label={t.actionCancel}
                variant="quiet"
                expand={false}
                compact
                onClick={() => setMovingNode(null)}
              />
            </div>
          </div>
        )}
      </Dialog>

      {/* Permanent delete single node confirmation */}
      <ConfirmDialog
        open={Boolean(confirmDeleteNode)}
        onClose={() => setConfirmDeleteNode(null)}
        title={t.confirmDeleteTitle}
        message={confirmDeleteNode ? t.confirmDeleteBody({ name: confirmDeleteNode.name }) : ""}
        confirmLabel={t.permanentlyDelete}
        cancelLabel={t.actionCancel}
        destructive
        onConfirm={async () => {
          if (!confirmDeleteNode) return;
          try {
            await api.del(Api.permanent(confirmDeleteNode.id));
            toast(t.permanentlyDelete, "success");
            setConfirmDeleteNode(null);
            void load();
          } catch (e) {
            toast(e instanceof Error ? e.message : t.errorUnexpectedTitle, "error");
          }
        }}
      />

      {/* Empty trash confirmation */}
      <ConfirmDialog
        open={confirmEmptyTrash}
        onClose={() => setConfirmEmptyTrash(false)}
        title={t.emptyTrashAction}
        message={t.confirmDeleteBody({ name: t.trash })}
        confirmLabel={t.permanentlyDelete}
        cancelLabel={t.actionCancel}
        destructive
        onConfirm={async () => {
          if (!nodes || nodes.length === 0) return;
          for (const node of nodes) {
            try {
              await api.del(Api.permanent(node.id));
            } catch {
              // ignore individual fails
            }
          }
          toast(t.emptyTrashAction, "success");
          setConfirmEmptyTrash(false);
          void load();
        }}
      />
    </div>
  );
}

function emptyTitle(filter: string, t: Strings) {
  switch (filter) {
    case "starred":
      return t.emptyStarredTitle;
    case "recent":
      return t.emptyRecentTitle;
    case "trash":
      return t.emptyTrashTitle;
    case "shared":
      return t.emptySharedTitle;
    default:
      return t.emptyFolderTitle;
  }
}

function emptyBody(filter: string, t: Strings) {
  switch (filter) {
    case "starred":
      return t.emptyStarredBody;
    case "recent":
      return t.emptyRecentBody;
    case "trash":
      return t.emptyTrashBody;
    case "shared":
      return t.emptySharedBody;
    default:
      return t.emptyFolderBody;
  }
}

/* ------------------------------------------------------------------- grid */

function Grid({
  nodes,
  selection,
  onToggle,
  onActivate,
  onMenu,
  dragProps,
  folderProps,
  over,
  isMobile,
  Sentinel,
}: {
  nodes: NodeModel[];
  selection: Set<string>;
  onToggle: (id: string, additive: boolean, range?: boolean) => void;
  onActivate: (n: NodeModel) => void;
  onMenu: (m: {
    x?: number;
    y?: number;
    anchorRect?: { left: number; right: number; top: number; bottom: number };
    node: NodeModel;
    isBulk?: boolean;
  }) => void;
  dragProps: (id: string, sel?: Set<string>) => Record<string, unknown>;
  folderProps: (id: string) => Record<string, unknown>;
  over: string;
  isMobile?: boolean;
  Sentinel?: React.ComponentType;
}) {
  const kept = useKeptIds();
  const hasSelection = selection.size > 0;

  return (
    <div style={{ padding: isMobile ? "10px 10px 120px" : "13px 13px 120px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(180px, 1fr))",
          gap: isMobile ? 10 : 13,
        }}
      >
        {nodes.map((node) => (
          <Tile
            key={node.id}
            node={node}
            selected={selection.has(node.id)}
            isSelectingMultiple={selection.size > 1 && selection.has(node.id)}
            hasSelection={hasSelection}
            onToggle={onToggle}
            onActivate={onActivate}
            onMenu={onMenu}
            dragProps={dragProps}
            folderProps={folderProps}
            isOver={over === node.id}
            kept={kept.has(node.id)}
            isMobile={isMobile}
          />
        ))}
      </div>
      {Sentinel && <Sentinel />}
    </div>
  );
}

const Tile = React.memo(function Tile({
  node,
  selected,
  isSelectingMultiple,
  hasSelection,
  onToggle,
  onActivate,
  onMenu,
  dragProps,
  folderProps,
  isOver,
  kept,
  isMobile,
}: {
  node: NodeModel;
  selected: boolean;
  isSelectingMultiple: boolean;
  hasSelection: boolean;
  onToggle: (id: string, additive: boolean, range?: boolean) => void;
  onActivate: (n: NodeModel) => void;
  onMenu: (m: {
    x?: number;
    y?: number;
    anchorRect?: { left: number; right: number; top: number; bottom: number };
    node: NodeModel;
    isBulk?: boolean;
  }) => void;
  dragProps: (id: string, sel?: Set<string>) => Record<string, unknown>;
  folderProps: (id: string) => Record<string, unknown>;
  isOver: boolean;
  kept: boolean;
  isMobile?: boolean;
}) {
  const t = useL10n();
  const cat = categoryOfNode(node);
  const isPending = node.status === "pending";
  const isFailed = node.status === "failed";

  return (
    <div
      data-node-id={node.id}
      {...(isPending ? {} : dragProps(node.id))}
      {...(isPending ? {} : (isFolder(node) ? folderProps(node.id) : {}))}
      onClick={(e) => {
        if (isPending) return;
        e.stopPropagation();
        if (isMobile) {
          if (hasSelection) {
            onToggle(node.id, true, false);
          } else {
            onActivate(node);
          }
          return;
        }
        if (e.detail >= 2) onActivate(node);
        else onToggle(node.id, e.ctrlKey || e.metaKey, e.shiftKey);
      }}
      onDoubleClick={() => !isPending && onActivate(node)}
      onContextMenu={(e) => {
        if (isPending) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (isSelectingMultiple) {
          onMenu({ x: e.clientX, y: e.clientY, node, isBulk: true });
        } else {
          if (!selected) {
            onToggle(node.id, false, false);
          }
          onMenu({ x: e.clientX, y: e.clientY, node, isBulk: false });
        }
      }}
      style={{
        cursor: isPending ? "wait" : "pointer",
        display: "flex",
        flexDirection: "column",
        opacity: isPending ? 0.45 : 1,
        filter: isPending ? "grayscale(40%)" : undefined,
        transition: "opacity 180ms ease",
      }}
    >
      <div
        style={{
          position: "relative",
          aspectRatio: "1 / 1",
          borderRadius: "var(--r-tile)",
          border: `1px solid ${
            isFailed
              ? "var(--danger, #ef4444)"
              : isOver || selected
              ? "var(--accent)"
              : "var(--stroke)"
          }`,
          background: isFailed
            ? "rgba(239, 68, 68, 0.08)"
            : isOver
            ? "rgba(76,141,255,0.12)"
            : "var(--bg-elevated)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {isPending && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0, 0, 0, 0.35)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              zIndex: 10,
            }}
          >
            <div
              className="ld-spin"
              style={{
                width: 24,
                height: 24,
                border: "2.5px solid rgba(255, 255, 255, 0.3)",
                borderTopColor: "#FFFFFF",
                borderRadius: "50%",
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: "#FFFFFF",
                fontWeight: 600,
                textShadow: "0 1px 3px rgba(0,0,0,0.8)",
              }}
            >
              Đang dán...
            </span>
          </div>
        )}

        {isFailed && (
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              background: "rgba(239, 68, 68, 0.95)",
              color: "#FFFFFF",
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 6,
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              gap: 4,
              boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            }}
            title={node.error || "Thao tác thất bại"}
          >
            <Icon glyph="alert" size={11} color="#FFFFFF" />
            Lỗi
          </div>
        )}
        {node.has_thumbnail || cat === "image" || cat === "video" ? (
          <>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileTileIcon category={cat} size={54} folderColor={node.color} />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={api.media(Api.thumbnail(node.id))}
              alt=""
              loading="lazy"
              decoding="async"
              // @ts-ignore
              fetchPriority="low"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              style={{ position: "relative", width: "100%", height: "100%", objectFit: "cover" }}
            />
            {cat === "video" && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "rgba(0, 0, 0, 0.62)",
                    border: "1px solid rgba(255, 255, 255, 0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FFFFFF",
                  }}
                >
                  <Icon glyph="play" size={18} strokeWidth={2.4} color="#FFFFFF" />
                </div>
              </div>
            )}
            <div
              style={{
                position: "absolute",
                insetInlineEnd: 6,
                bottom: 6,
                background: "var(--bg-elevated)",
                border: "1px solid var(--stroke)",
                borderRadius: 8,
                padding: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileTileIcon category={cat} size={18} />
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FileTileIcon
              category={cat}
              size={54}
              folderColor={node.color}
            />
          </div>
        )}

        {selected && (
          <span
            style={{
              position: "absolute",
              insetInlineEnd: 8,
              top: 8,
              width: 22,
              height: 22,
              borderRadius: 999,
              background: "var(--accent)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon glyph="check" size={14} color="#FFFFFF" strokeWidth={2.6} />
          </span>
        )}

        {kept && !selected && (
          <span
            style={{
              position: "absolute",
              insetInlineEnd: 8,
              top: 8,
              width: 20,
              height: 20,
              borderRadius: 999,
              background: "var(--accent)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title={t.offlineRemoveDownload}
          >
            <Icon glyph="check" size={13} color="#FFFFFF" strokeWidth={2.6} />
          </span>
        )}
        {node.shared && !selected && !kept && (
          <span style={{ position: "absolute", insetInlineEnd: 8, top: 8 }}>
            <Icon glyph="share" size={15} color="var(--accent)" />
          </span>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            className="t-body-md"
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "var(--fg-primary)",
            }}
          >
            {node.name}
          </span>
          {node.role === "viewer" && (
            <span
              style={{
                fontSize: 10,
                padding: "1px 5px",
                borderRadius: 4,
                background: "rgba(234, 179, 8, 0.15)",
                color: "#ca8a04",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                flexShrink: 0,
              }}
              title="Chỉ đọc (Không có quyền chỉnh sửa)"
            >
              <Icon glyph="lock" size={9} color="#ca8a04" />
              Chỉ đọc
            </span>
          )}

          {node.starred && (
            <span style={{ color: "#E8935C", flexShrink: 0 }} title={t.starred}>
              <Icon glyph="star-filled" size={13} color="#E8935C" />
            </span>
          )}
          {node.shared && (
            <span style={{ color: "var(--accent)", flexShrink: 0 }} title={t.actionShare}>
              <Icon glyph="link" size={13} color="var(--accent)" />
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          <div
            className="t-label-sm"
            style={{
              color: isFailed ? "var(--danger)" : "var(--fg-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {isPending
              ? "Đang dán..."
              : isFailed
              ? (node.error || "Lỗi thao tác")
              : isFolder(node)
              ? relative(node.updated_at)
              : bytes(node.size_bytes)}
          </div>
          {isMobile && (
            <Tappable
              radius={999}
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                onMenu({
                  anchorRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
                  x: rect.right,
                  y: rect.bottom,
                  node,
                  isBulk: false,
                });
              }}
              style={{ padding: 4, color: "var(--fg-secondary)", marginRight: -4 }}
              title={t.moreActions}
            >
              <Icon glyph="more" size={15} color="var(--fg-secondary)" />
            </Tappable>
          )}
        </div>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------- list */

/**
 * The two facts under a name, joined with a middot rather than a space: run
 * together, "300 KB 2 hours ago" reads as one broken phrase.
 *
 * A folder has no size worth printing, and whose it is outranks when it changed
 * on something shared with you.
 */
function subtitleFor(node: NodeModel): string {
  const join = (a: string, b: string) => [a, b].filter(Boolean).join("  ·  ");
  const when = relative(node.updated_at);
  if (isFolder(node)) return node.owner ? join(node.owner.name, when) : when;
  const size = bytes(node.size_bytes);
  return node.owner ? join(node.owner.name, size) : join(size, when);
}

function List({
  nodes,
  selection,
  onToggle,
  onActivate,
  onMenu,
  dragProps,
  folderProps,
  over,
  isTrash = false,
  onRestore,
  onDeleteForever,
  isMobile,
  Sentinel,
}: {
  nodes: NodeModel[];
  selection: Set<string>;
  onToggle: (id: string, additive: boolean, range?: boolean) => void;
  onActivate: (n: NodeModel) => void;
  onMenu: (m: {
    x?: number;
    y?: number;
    anchorRect?: { left: number; right: number; top: number; bottom: number };
    node: NodeModel;
    isBulk?: boolean;
  }) => void;
  dragProps: (id: string, sel?: Set<string>) => Record<string, unknown>;
  folderProps: (id: string) => Record<string, unknown>;
  over: string;
  isTrash?: boolean;
  onRestore?: (n: NodeModel) => void;
  onDeleteForever?: (n: NodeModel) => void;
  isMobile?: boolean;
  Sentinel?: React.ComponentType;
}) {
  const kept = useKeptIds();
  const hasSelection = selection.size > 0;

  return (
    <div style={{ padding: isMobile ? "8px 10px 120px" : "13px 13px 120px" }}>
      {nodes.map((node) => (
        <Row
          key={node.id}
          node={node}
          selected={!isTrash && selection.has(node.id)}
          selecting={!isTrash && hasSelection}
          isSelectingMultiple={selection.size > 1 && selection.has(node.id)}
          isOver={over === node.id}
          isTrash={isTrash}
          onToggle={onToggle}
          onActivate={onActivate}
          onMenu={onMenu}
          onRestore={onRestore}
          onDeleteForever={onDeleteForever}
          dragProps={dragProps}
          folderProps={folderProps}
          isMobile={isMobile}
          kept={kept.has(node.id)}
        />
      ))}
      {Sentinel && <Sentinel />}
    </div>
  );
}

const Row = React.memo(function Row({
  node,
  selected,
  selecting,
  isSelectingMultiple,
  isOver,
  isTrash,
  onToggle,
  onActivate,
  onMenu,
  onRestore,
  onDeleteForever,
  dragProps,
  folderProps,
  isMobile,
  kept,
}: {
  node: NodeModel;
  selected: boolean;
  selecting: boolean;
  isSelectingMultiple: boolean;
  isOver: boolean;
  isTrash: boolean;
  onToggle: (id: string, additive: boolean, range?: boolean) => void;
  onActivate: (n: NodeModel) => void;
  onMenu: (m: {
    x?: number;
    y?: number;
    anchorRect?: { left: number; right: number; top: number; bottom: number };
    node: NodeModel;
    isBulk?: boolean;
  }) => void;
  onRestore?: (n: NodeModel) => void;
  onDeleteForever?: (n: NodeModel) => void;
  dragProps: (id: string, sel?: Set<string>) => Record<string, unknown>;
  folderProps: (id: string) => Record<string, unknown>;
  isMobile?: boolean;
  kept: boolean;
}) {
  const t = useL10n();
  const cat = categoryOfNode(node);
  const isPending = node.status === "pending";
  const isFailed = node.status === "failed";

  return (
    <div
      data-node-id={node.id}
      {...(isTrash || isPending ? {} : dragProps(node.id))}
      {...(!isTrash && !isPending && isFolder(node) ? folderProps(node.id) : {})}
      onClick={(e) => {
        if (isTrash || isPending) return;
        e.stopPropagation();
        if (isMobile) {
          if (selecting) {
            onToggle(node.id, true, false);
          } else {
            onActivate(node);
          }
          return;
        }
        if (e.detail >= 2) onActivate(node);
        else onToggle(node.id, e.ctrlKey || e.metaKey, e.shiftKey);
      }}
      onDoubleClick={() => {
        if (!isTrash && !isPending) onActivate(node);
      }}
      onContextMenu={(e) => {
        if (isPending) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (isSelectingMultiple) {
          onMenu({ x: e.clientX, y: e.clientY, node, isBulk: true });
        } else {
          if (!selected) {
            onToggle(node.id, false, false);
          }
          onMenu({ x: e.clientX, y: e.clientY, node, isBulk: false });
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "2px 0",
        padding: "9px 10px",
        borderRadius: "var(--r-tile)",
        border: `1px solid ${
          isFailed
            ? "var(--danger, #ef4444)"
            : isOver || selected
            ? "var(--accent)"
            : "transparent"
        }`,
        background: isFailed
          ? "rgba(239, 68, 68, 0.08)"
          : isOver || selected
          ? "rgba(76, 141, 255, 0.1)"
          : "transparent",
        cursor: isPending ? "wait" : (isTrash ? "default" : "pointer"),
        opacity: isPending ? 0.45 : 1,
        filter: isPending ? "grayscale(40%)" : undefined,
        transition: "opacity 180ms ease",
      }}
    >
      {selecting && (
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            border: `1.6px solid ${selected ? "var(--accent)" : "var(--stroke)"}`,
            background: selected ? "var(--accent)" : "transparent",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          {selected && <Icon glyph="check" size={14} color="#FFFFFF" strokeWidth={2.6} />}
        </span>
      )}
      <span
        style={{
          width: 42,
          height: 42,
          flex: "none",
          borderRadius: 10,
          background: "var(--bg-elevated)",
          border: "1px solid var(--stroke)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <FileTileIcon category={cat} size={36} folderColor={node.color} />
        {(node.has_thumbnail || cat === "image" || cat === "video") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={api.media(Api.thumbnail(node.id))}
            alt=""
            loading="lazy"
            decoding="async"
            // @ts-ignore
            fetchPriority="low"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            className="t-body-lg"
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "var(--fg-primary)",
            }}
          >
            {node.name}
          </span>
          {!isTrash && node.role === "viewer" && (
            <span
              style={{
                fontSize: 10,
                padding: "1px 5px",
                borderRadius: 4,
                background: "rgba(234, 179, 8, 0.15)",
                color: "#ca8a04",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                flexShrink: 0,
              }}
              title="Chỉ đọc (Không có quyền chỉnh sửa)"
            >
              <Icon glyph="lock" size={9} color="#ca8a04" />
              Chỉ đọc
            </span>
          )}

          {!isTrash && node.starred && (
            <Icon glyph="star-filled" size={13} color="#E8935C" />
          )}
          {!isTrash && node.shared && (
            <Icon glyph="link" size={13} color="var(--accent)" />
          )}
          {!isTrash && kept && (
            <Icon glyph="offline" size={13} color="var(--accent)" />
          )}
        </span>
        <span
          className="t-body-sm"
          style={{
            color: isFailed ? "var(--danger)" : "var(--fg-secondary)",
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {isPending ? (
            <>
              <span
                className="ld-spin"
                style={{
                  width: 12,
                  height: 12,
                  border: "2px solid var(--accent)",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  display: "inline-block",
                }}
              />
              <span>Đang dán...</span>
            </>
          ) : isFailed ? (
            <>
              <Icon glyph="alert" size={12} color="var(--danger)" />
              <span>Lỗi: {node.error || "Thao tác thất bại"}</span>
            </>
          ) : (
            subtitleFor(node)
          )}
        </span>
      </span>
      {isTrash ? (
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Tappable
            radius={18}
            onClick={(e) => {
              e.stopPropagation();
              onRestore?.(node);
            }}
            style={{ padding: 8, color: "var(--fg-secondary)" }}
            title={t.restore}
          >
            <Icon glyph="restore" size={18} />
          </Tappable>
          <Tappable
            radius={18}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteForever?.(node);
            }}
            style={{ padding: 8, color: "var(--warning)" }}
            title={t.permanentlyDelete}
          >
            <Icon glyph="trash" size={18} color="var(--warning)" />
          </Tappable>
        </div>
      ) : (
        !selecting && (
          <Tappable
            radius={18}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              onMenu({
                anchorRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
                x: rect.right,
                y: rect.bottom,
                node,
              });
            }}
            style={{ padding: 8, color: "var(--fg-secondary)" }}
            title={t.moreActions}
          >
            <Icon glyph="more" size={18} />
          </Tappable>
        )
      )}
    </div>
  );
});
