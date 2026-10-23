"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, Button, Dialog, DropdownStatus, Sheet, Tappable, TextField, useDeviceClass, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { bytes } from "@/lib/format";
import { type UserModel } from "@/lib/models";
import { useSession } from "@/lib/session";
import { useInfiniteList, useVirtualWindow } from "@/lib/useInfiniteList";

export interface DatasetPermissionItem {
  id: string;
  name: string;
  pool: string;
  mount: string;
  quota: string;
  used: string;
}

export type PermissionLevel = "none" | "viewer" | "editor";

export interface FolderTreeNode {
  id: string;
  name: string;
  path: string;
  isDrive?: boolean;
  children?: FolderTreeNode[];
}

export interface SelectedTreeItem {
  key: string;
  path?: string;
  depth: number;
}

function findNodeInTree(
  tree: FolderTreeNode[],
  keyOrPath: string,
  depth = 0
): { node: FolderTreeNode; depth: number } | null {
  const normSearch = keyOrPath.trim().replace(/^\/+/, "").toLowerCase();
  for (const n of tree) {
    const itemKey = ((n as any).key || n.name || "").trim().replace(/^\/+/, "").toLowerCase();
    const nodeName = (n.name || "").trim().toLowerCase();
    const nodePath = (n.path || "").trim().replace(/^\/+/, "").toLowerCase();

    if (
      itemKey === normSearch ||
      nodeName === normSearch ||
      nodePath === normSearch ||
      n.id === keyOrPath ||
      itemKey.endsWith("/" + normSearch) ||
      normSearch.endsWith("/" + itemKey) ||
      nodePath.endsWith("/" + normSearch)
    ) {
      return { node: n, depth };
    }
    if (n.children && n.children.length > 0) {
      const found = findNodeInTree(n.children, keyOrPath, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function CategoryTreeItem({
  node,
  depth,
  selectedDatasets,
  expandedIds,
  onToggleSelect,
  onToggleExpand,
}: {
  node: FolderTreeNode;
  depth: number;
  selectedDatasets: Set<string>;
  expandedIds: Set<string>;
  onToggleSelect: (node: FolderTreeNode, depth: number) => void;
  onToggleExpand: (id: string, e: React.MouseEvent) => void;
}) {
  const itemKey = (node as any).key || node.name || node.path;
  const cleanKey = itemKey.replace(/^\/+/, "");
  const isSelected =
    selectedDatasets.has(itemKey) ||
    selectedDatasets.has(cleanKey) ||
    selectedDatasets.has("/" + cleanKey) ||
    selectedDatasets.has(node.name) ||
    Boolean(node.path && selectedDatasets.has(node.path.replace(/\/+/g, "/")));
  const hasChildren = !!node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        onClick={() => {
          onToggleSelect(node, depth);
          if (hasChildren && !isExpanded) {
            onToggleExpand(node.id, {} as any);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          paddingLeft: 10 + depth * 22,
          paddingRight: 10,
          paddingTop: 6,
          paddingBottom: 6,
          borderRadius: 8,
          cursor: "pointer",
          background: "transparent", // Tuyệt đối không làm nền cho cái danh mục khi bấm vô
          userSelect: "none",
          gap: 7,
          transition: "color 0.15s ease",
        }}
      >
        {/* Caret / chevron: Dùng vector icon chevron-down / chevron-right chuẩn, có thể đóng mở sâu đến max */}
        {hasChildren ? (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id, e);
            }}
            style={{
              width: 14,
              height: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              cursor: "pointer",
            }}
          >
            <Icon
              glyph={isExpanded ? "chevron-down" : "chevron-right"}
              size={13}
              strokeWidth={2.4}
              color={isSelected ? "var(--accent, #4c8dff)" : "var(--fg-secondary, #737882)"}
            />
          </div>
        ) : (
          <div style={{ width: 14, height: 14, flexShrink: 0 }} />
        )}

        {/* Drive or Folder icon: đổi màu khi chọn */}
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {node.isDrive ? (
            <Icon
              glyph="drive"
              size={17}
              color={isSelected ? "var(--accent, #4c8dff)" : "var(--fg-primary)"}
            />
          ) : (
            <Icon
              glyph="folder"
              size={17}
              color={isSelected ? "var(--accent, #4c8dff)" : "var(--fg-primary)"}
            />
          )}
        </div>

        {/* Folder or Dataset name */}
        <span
          style={{
            fontSize: 13,
            fontWeight: 500, // Tuyệt đối không in đậm chữ khi bấm vô
            color: isSelected ? "var(--accent, #4c8dff)" : "var(--fg-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {node.name}
        </span>
      </div>

      {/* Children if expanded - sâu max */}
      {hasChildren && isExpanded && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {node.children!.map((child) => (
            <CategoryTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedDatasets={selectedDatasets}
              expandedIds={expandedIds}
              onToggleSelect={onToggleSelect}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function UsersSection({ onBack, embedded }: { onBack?: () => void; embedded?: boolean }) {
  const { isMobile } = useDeviceClass();
  const toast = useToast();
  const { user: currentUser } = useSession();
  const [datasetTree, setDatasetTree] = useState<FolderTreeNode[]>([]);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  const [datasetsLoading, setDatasetsLoading] = useState(false);

  const handleToggleExpandNode = (id: string, e?: React.MouseEvent) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isFetchingMetadataRef = useRef(false);
  const prevViewModeRef = useRef<"list" | "add" | "edit">("list");

  // Load datasets directly and build matching hierarchical tree (Data -> KiyoVN -> 1Data, etc.)
  const loadStorageMetadata = useCallback(async () => {
    if (isFetchingMetadataRef.current) return;
    isFetchingMetadataRef.current = true;
    setDatasetsLoading(true);
    try {
      const [dsRes, poolsRes] = await Promise.all([
        api.get<{ datasets: any[] }>(Api.adminDatasets).catch(() => api.get<{ datasets: any[] }>(Api.datasets).catch(() => null)),
        api.get<{ pools: any[] }>(Api.adminPools).catch(() => null),
      ]);
      const datasets = dsRes?.datasets || [];
      const pools = poolsRes?.pools || [];

      // Determine pool names
      const poolNames = new Set<string>();
      if (pools && pools.length > 0) {
        pools.forEach((p: any) => { if (p.name) poolNames.add(p.name); });
      }
      datasets.forEach((d: any) => {
        if (d.pool) poolNames.add(d.pool);
        const slashIdx = d.name.indexOf("/");
        if (slashIdx !== -1) {
          poolNames.add(d.name.slice(0, slashIdx));
        } else {
          poolNames.add(d.name);
        }
      });

      const roots: FolderTreeNode[] = [];
      const nodeMap = new Map<string, FolderTreeNode>();

      poolNames.forEach((poolName) => {
        const rootNode: FolderTreeNode = {
          id: `pool-${poolName}`,
          name: poolName,
          path: `/mnt/${poolName}`.replace(/\/+/g, "/"),
          isDrive: true,
          children: [],
        };
        (rootNode as any).key = poolName;
        nodeMap.set(poolName, rootNode);
        roots.push(rootNode);
      });

      const sorted = [...datasets].sort((a: any, b: any) => a.name.localeCompare(b.name));
      sorted.forEach((d: any) => {
        const norm = d.name.replace(/^\/+/, "");
        const parts = norm.split("/").filter(Boolean);
        if (parts.length === 0) return;

        const poolName = parts[0];
        let parent = nodeMap.get(poolName);
        if (!parent) {
          parent = {
            id: `pool-${poolName}`,
            name: poolName,
            path: (d.mount || `/mnt/${poolName}`).replace(/\/+/g, "/"),
            isDrive: true,
            children: [],
          };
          (parent as any).key = poolName;
          nodeMap.set(poolName, parent);
          roots.push(parent);
        }

        if (parts.length === 1) {
          if (d.mount) parent.path = d.mount.replace(/\/+/g, "/");
          if (d.id) parent.id = `ds-${d.id}`;
          return;
        }

        let currentPath = poolName;
        for (let i = 1; i < parts.length; i++) {
          const part = parts[i];
          const prevPath = currentPath;
          currentPath = `${currentPath}/${part}`;

          if (!nodeMap.has(currentPath)) {
            const isLeaf = i === parts.length - 1;
            const node: FolderTreeNode = {
              id: isLeaf && d.id ? `ds-${d.id}` : `node-${currentPath}`,
              name: part,
              path: (isLeaf && d.mount ? d.mount : `${parent.path}/${part}`).replace(/\/+/g, "/"),
              isDrive: false,
              children: [],
            };
            (node as any).key = currentPath;
            nodeMap.set(currentPath, node);

            const parentNode = nodeMap.get(prevPath);
            if (parentNode) {
              if (!parentNode.children) parentNode.children = [];
              parentNode.children.push(node);
            }
          } else if (i === parts.length - 1) {
            const existing = nodeMap.get(currentPath)!;
            if (d.mount) existing.path = d.mount.replace(/\/+/g, "/");
            if (d.id) existing.id = `ds-${d.id}`;
          }
        }
      });

      setDatasetTree(roots);

      // Pre-expand top 2 levels of nodes so hierarchy is visible without overwhelming
      const expandSet = new Set<string>();
      const collectParentIds = (nodes: FolderTreeNode[], depth = 0) => {
        if (depth >= 2) return;
        nodes.forEach((n) => {
          if (n.children && n.children.length > 0) {
            expandSet.add(n.id);
            collectParentIds(n.children, depth + 1);
          }
        });
      };
      collectParentIds(roots, 0);
      setExpandedNodeIds(expandSet);
    } catch {
      setDatasetTree([]);
    } finally {
      setDatasetsLoading(false);
      isFetchingMetadataRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadStorageMetadata();
    const handleUpdate = () => {
      void loadStorageMetadata();
    };
    window.addEventListener("ld_datasets_updated", handleUpdate);
    return () => {
      window.removeEventListener("ld_datasets_updated", handleUpdate);
    };
  }, [loadStorageMetadata]);

  // Mode: "list" | "add" | "edit"
  const [viewMode, setViewMode] = useState<"list" | "add" | "edit">("list");
  const [editingUser, setEditingUser] = useState<UserModel | null>(null);

  // Ensure dataset tree is loaded when transitioning into add or edit mode (only on transition, preventing infinite loops)
  useEffect(() => {
    if ((viewMode === "add" || viewMode === "edit") && prevViewModeRef.current !== viewMode) {
      if (datasetTree.length === 0) {
        void loadStorageMetadata();
      }
    }
    prevViewModeRef.current = viewMode;
  }, [viewMode, datasetTree.length, loadStorageMetadata]);



  // Invite modal state
  const [inviting, setInviting] = useState(false);
  const [inviteLabel, setInviteLabel] = useState("");
  const [createdInvite, setCreatedInvite] = useState<{ code: string; link: string } | null>(null);

  // Delete modal state
  const [deleteModalUser, setDeleteModalUser] = useState<UserModel | null>(null);
  const [resetPwModalUser, setResetPwModalUser] = useState<UserModel | null>(null);
  const [tempPassword, setTempPassword] = useState("");

  // Form Fields
  const [formUsername, setFormUsername] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formConfirmPassword, setFormConfirmPassword] = useState("");
  const [formQuotaPreset, setFormQuotaPreset] = useState<string>("unlimited");
  const [formCustomQuotaGB, setFormCustomQuotaGB] = useState<number>(100);
  const [formDisabled, setFormDisabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Collapsible cards state
  const [accountInfoExpanded, setAccountInfoExpanded] = useState(true);
  const [quotaExpanded, setQuotaExpanded] = useState(true);
  const [categoriesExpanded, setCategoriesExpanded] = useState(true);
  const [advancedEnabled, setAdvancedEnabled] = useState(false);

  // Permissions state: Đọc & Ghi mặc định bật, Thực thi mặc định tắt
  const [selectedTreeItems, setSelectedTreeItems] = useState<SelectedTreeItem[]>([]);
  const [categoryPath, setCategoryPath] = useState("/");
  const selectedDatasets = useMemo(() => {
    const set = new Set<string>();
    selectedTreeItems.forEach((item) => {
      const clean = item.key.replace(/^\/+/, "");
      set.add(clean);
      set.add("/" + clean);
      set.add(item.key);
      if (item.path) {
        set.add(item.path.replace(/\/+/g, "/"));
      }
    });
    return set;
  }, [selectedTreeItems]);
  const [permRead, setPermRead] = useState(true);
  const [permWrite, setPermWrite] = useState(true);
  const [permExecute, setPermExecute] = useState(false);

  // Load users from API with Infinite Scroll
  const {
    items: rawUsers,
    setItems: setUsers,
    loading,
    loadingMore,
    hasMore,
    reload: loadUsers,
    Sentinel,
  } = useInfiniteList<UserModel>({
    pageSize: 30,
    getItemKey: (u) => u.id,
    fetchPage: async ({ offset, limit, signal }) => {
      const data = await api.get<{ users: UserModel[]; total?: number; has_more?: boolean; next_offset?: number }>(
        Api.adminUsers,
        {
          limit,
          offset,
        },
        { signal }
      );
      const list = data?.users ?? [];
      const merged = list.map((u) => {
        let permsStr = u.dataset_permissions;
        if (!permsStr && typeof window !== "undefined") {
          permsStr = localStorage.getItem(`ld_user_dataset_perms_${u.id}`) || "";
        }
        return {
          ...u,
          dataset_permissions: permsStr || (u.role === "admin" ? '{"/":"editor"}' : "{}"),
        };
      });
      return {
        items: merged,
        hasMore: Boolean(data?.has_more ?? (list.length >= limit)),
        nextOffset: data?.next_offset ?? offset + list.length,
        total: data?.total,
      };
    },
  });

  const users = rawUsers;

  // Open "Thêm người dùng" page
  const handleOpenAdd = (updateUrl = true) => {
    setEditingUser(null);
    setFormUsername("");
    setFormDisplayName("");
    setFormEmail("");
    setFormPassword("");
    setFormConfirmPassword("");
    setFormQuotaPreset("unlimited");
    setFormCustomQuotaGB(100);
    setFormDisabled(false);

    // Advanced & card states
    setAdvancedEnabled(false);
    setAccountInfoExpanded(true);
    setQuotaExpanded(true);
    setCategoriesExpanded(true);

    // Quyền nâng cao: Đọc và Ghi mặc định bật, Thực thi mặc định tắt
    setPermRead(true);
    setPermWrite(true);
    setPermExecute(false);
    setSelectedTreeItems([]);
    setCategoryPath("");

    setViewMode("add");
    if (updateUrl && typeof window !== "undefined") {
      window.history.pushState(null, "", "/settings/users/add");
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Open "Chỉnh sửa" user page
  const handleOpenEdit = (targetUser: UserModel, updateUrl = true) => {
    setEditingUser(targetUser);
    setFormUsername(targetUser.username);
    setFormDisplayName(targetUser.display_name || targetUser.username);
    setFormEmail(targetUser.email || "");
    setFormPassword("");
    setFormConfirmPassword("");
    setFormDisabled(Boolean(targetUser.disabled));

    // Advanced & card states
    setAdvancedEnabled(false);
    setAccountInfoExpanded(true);
    setQuotaExpanded(true);
    setCategoriesExpanded(true);

    // Quota Preset calculation
    const quotaBytes = targetUser.quota_bytes;
    if (!quotaBytes || quotaBytes === 0) {
      setFormQuotaPreset("unlimited");
    } else {
      const gb = Math.round(quotaBytes / (1024 * 1024 * 1024));
      if ([50, 100, 250, 500, 1024, 2048].includes(gb)) {
        setFormQuotaPreset(gb === 1024 ? "1TB" : gb === 2048 ? "2TB" : `${gb}GB`);
      } else {
        setFormQuotaPreset("custom");
        setFormCustomQuotaGB(gb);
      }
    }

    // Permissions map
    let parsedPerms: Record<string, any> = {};
    try {
      if (targetUser.dataset_permissions) {
        parsedPerms = JSON.parse(targetUser.dataset_permissions);
      }
    } catch {
      parsedPerms = {};
    }

    const initialSelectedItems: SelectedTreeItem[] = [];
    let hasRead = true;
    let hasWrite = true;
    let hasExec = false;

    const seenNodes = new Set<string>();
    Object.entries(parsedPerms).forEach(([key, val]) => {
      if (!val || val === "none") return;
      let cleanKey = key.trim().replace(/^\/\/+/, "/");
      if (cleanKey.startsWith("/mnt/zfs-recovery/")) {
        cleanKey = cleanKey.replace("/mnt/zfs-recovery/", "");
      } else if (cleanKey.startsWith("/mnt/")) {
        cleanKey = cleanKey.replace("/mnt/", "");
      }
      cleanKey = cleanKey.replace(/^\/+/, "");

      const found = findNodeInTree(datasetTree, cleanKey) || findNodeInTree(datasetTree, key);
      const canonicalKey = (found?.node as any)?.key || cleanKey;
      if (!canonicalKey || seenNodes.has(canonicalKey)) {
        return;
      }
      seenNodes.add(canonicalKey);

      initialSelectedItems.push({
        key: canonicalKey,
        path: "/" + canonicalKey.replace(/^\/+/, ""),
        depth: found?.depth ?? 0,
      });
      if (typeof val === "object" && val !== null) {
        if (typeof val.read === "boolean") hasRead = val.read;
        if (typeof val.write === "boolean") hasWrite = val.write;
        if (typeof val.execute === "boolean") hasExec = val.execute;
      } else if (val === "viewer") {
        hasWrite = false;
      }
    });

    if (initialSelectedItems.length > 0) {
      setSelectedTreeItems(initialSelectedItems);
      const uniquePaths = Array.from(new Set(initialSelectedItems.map((it) => "/" + it.key.replace(/^\/+/, ""))));
      setCategoryPath(uniquePaths.join(", "));
    } else {
      setSelectedTreeItems([]);
      setCategoryPath("");
    }
    setPermRead(hasRead);
    setPermWrite(hasWrite);
    setPermExecute(hasExec);

    setViewMode("edit");
    if (updateUrl && typeof window !== "undefined") {
      window.history.pushState(null, "", `/settings/users/edit/${targetUser.id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBackToList = () => {
    setViewMode("list");
    setEditingUser(null);
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", "/settings/users");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  // Synchronize route with browser URL for /settings/users, /settings/users/add, and /settings/users/edit/:id
  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncRouteFromUrl = () => {
      const path = window.location.pathname;
      if (path.endsWith("/users/add") || (path.includes("/users") && path.endsWith("/add"))) {
        setViewMode("add");
        setEditingUser(null);
      } else if (path.includes("/users/edit/")) {
        const parts = path.split("/users/edit/");
        const targetId = decodeURIComponent(parts[1]?.split("/")[0] || "");
        if (targetId) {
          const found = users.find((u) => u.id === targetId || u.username === targetId);
          if (found) {
            if (!editingUser || editingUser.id !== found.id) {
              handleOpenEdit(found, false);
            }
          } else {
            setViewMode("edit");
          }
        }
      } else if (path === "/settings/users" || path.endsWith("/settings/users")) {
        setViewMode("list");
        setEditingUser(null);
      }
    };

    syncRouteFromUrl();
    window.addEventListener("popstate", syncRouteFromUrl);
    return () => window.removeEventListener("popstate", syncRouteFromUrl);
  }, [users]);

  // Toggle dataset selection in Danh mục (hỗ trợ chọn nhiều danh mục tự do, không giới hạn):
  const handleToggleSelectDataset = (node: FolderTreeNode, depth: number) => {
    const rawKey = (node as any).key || node.name || node.path;
    const cleanKey = rawKey.replace(/^\/+/, "");
    const cleanPath = "/" + cleanKey;

    setSelectedTreeItems((prev) => {
      const isAlreadySelected = prev.some(
        (item) => item.key.replace(/^\/+/, "") === cleanKey
      );

      let nextItems: SelectedTreeItem[];
      if (isAlreadySelected) {
        // Bấm lại mục đang chọn thì tắt nó đi
        nextItems = prev.filter(
          (item) => item.key.replace(/^\/+/, "") !== cleanKey
        );
      } else {
        // Thêm mục mới được chọn vào danh sách
        nextItems = [...prev, { key: cleanKey, path: cleanPath, depth }];
      }

      // Cập nhật thanh đường dẫn ở trên: Nếu chưa chọn gì thì để trống, có chọn thì hiện path (không trùng lặp)
      if (nextItems.length === 0) {
        setCategoryPath("");
      } else {
        const uniquePaths = Array.from(new Set(nextItems.map((it) => "/" + it.key.replace(/^\/+/, ""))));
        setCategoryPath(uniquePaths.join(", "));
      }

      return nextItems;
    });
  };

  // Save (Create or Update) User
  const handleSaveUser = async () => {
    const cleanUsername = formUsername.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleanUsername) {
      toast("Vui lòng nhập tên người dùng hợp lệ!", "error");
      return;
    }

    if (viewMode === "add") {
      if (!formPassword) {
        toast("Vui lòng nhập mật khẩu cho người dùng mới!", "error");
        return;
      }
      if (formPassword.length < 6) {
        toast("Mật khẩu phải có ít nhất 6 ký tự!", "error");
        return;
      }
      if (formPassword !== formConfirmPassword) {
        toast("Mật khẩu xác nhận không khớp!", "error");
        return;
      }
    } else {
      if (formPassword && formPassword.length < 6) {
        toast("Mật khẩu mới phải có ít nhất 6 ký tự!", "error");
        return;
      }
      if (formPassword && formPassword !== formConfirmPassword) {
        toast("Mật khẩu xác nhận không khớp!", "error");
        return;
      }
    }

    // Calculate Quota in bytes
    let quotaBytes = 0;
    if (formQuotaPreset === "50GB") quotaBytes = 50 * 1024 * 1024 * 1024;
    else if (formQuotaPreset === "100GB") quotaBytes = 100 * 1024 * 1024 * 1024;
    else if (formQuotaPreset === "250GB") quotaBytes = 250 * 1024 * 1024 * 1024;
    else if (formQuotaPreset === "500GB") quotaBytes = 500 * 1024 * 1024 * 1024;
    else if (formQuotaPreset === "1TB") quotaBytes = 1024 * 1024 * 1024 * 1024;
    else if (formQuotaPreset === "2TB") quotaBytes = 2048 * 1024 * 1024 * 1024;
    else if (formQuotaPreset === "custom") quotaBytes = (formCustomQuotaGB || 100) * 1024 * 1024 * 1024;

    const finalRole = editingUser?.role || "member";

    // Build permissions map
    const permsToSave: Record<string, any> = {};
    const level: PermissionLevel = permWrite ? "editor" : (permRead ? "viewer" : "none");
    if (selectedTreeItems.length > 0) {
      selectedTreeItems.forEach((item) => {
        const cleanKey = item.key.trim().replace(/^\/+/, "");
        if (!cleanKey) return;
        permsToSave[cleanKey] = {
          level,
          read: permRead,
          write: permWrite,
          execute: permExecute,
        };
        permsToSave["/" + cleanKey] = {
          level,
          read: permRead,
          write: permWrite,
          execute: permExecute,
        };
      });
    }
    const permsJsonString = JSON.stringify(permsToSave);

    setSubmitting(true);
    try {
      if (viewMode === "add") {
        const res = await api.post<{ user: UserModel }>(Api.adminUsers, {
          username: cleanUsername,
          password: formPassword,
          display_name: formDisplayName.trim() || cleanUsername,
          email: formEmail.trim(),
          role: finalRole,
          quota_bytes: quotaBytes,
          dataset_permissions: permsJsonString,
        });

        if (res?.user) {
          if (typeof window !== "undefined") {
            localStorage.setItem(`ld_user_dataset_perms_${res.user.id}`, permsJsonString);
          }
          setUsers((prev) => [res.user, ...prev]);
        }
        toast(`Đã thêm người dùng "${cleanUsername}" thành công!`, "success");
      } else if (viewMode === "edit" && editingUser) {
        await api.patch(`${Api.adminUsers}/${editingUser.id}`, {
          username: cleanUsername,
          display_name: formDisplayName.trim() || cleanUsername,
          email: formEmail.trim(),
          password: formPassword || undefined,
          role: finalRole,
          quota_bytes: quotaBytes,
          disabled: formDisabled,
          dataset_permissions: permsJsonString,
        });

        if (typeof window !== "undefined") {
          localStorage.setItem(`ld_user_dataset_perms_${editingUser.id}`, permsJsonString);
          window.dispatchEvent(new Event("ld_permissions_updated"));
        }

        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingUser.id
              ? {
                  ...u,
                  username: cleanUsername,
                  display_name: formDisplayName.trim() || cleanUsername,
                  email: formEmail.trim(),
                  quota_bytes: quotaBytes,
                  disabled: formDisabled,
                  dataset_permissions: permsJsonString,
                }
              : u,
          ),
        );
        toast(`Đã cập nhật người dùng "${cleanUsername}" thành công!`, "success");
      }
      handleBackToList();
    } catch (e: any) {
      toast(e?.message || (viewMode === "add" ? "Lỗi tạo người dùng trên máy chủ" : "Lỗi cập nhật người dùng"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete User
  const handleDeleteUser = async (userToDelete: UserModel) => {
    try {
      await api.del(`${Api.adminUsers}/${userToDelete.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
      setDeleteModalUser(null);
      handleBackToList();
      toast(`Đã xóa tài khoản "${userToDelete.username}" thành công!`, "success");
    } catch (e: any) {
      toast(e?.message || "Không thể xóa tài khoản người dùng!", "error");
    }
  };

  // Reset Password directly
  const handleResetPassword = async (userToReset: UserModel) => {
    try {
      const res = await api.post<{ temporary_password?: string }>(`${Api.adminUsers}/${userToReset.id}/reset-password`, {});
      if (!res?.temporary_password) throw new Error("Không nhận được mật khẩu tạm từ máy chủ");
      setTempPassword(res.temporary_password);
      setResetPwModalUser(userToReset);
    } catch (e: any) {
      toast(e?.message || "Không thể đặt lại mật khẩu người dùng!", "error");
    }
  };

  // Helper render categories text for the "Danh mục" column
  const formatUserCategories = (u: UserModel) => {
    let map: Record<string, string> = {};
    try {
      if (u.dataset_permissions) map = JSON.parse(u.dataset_permissions);
    } catch {
      map = {};
    }
    const permitted = Object.entries(map).filter(([_, v]) => v && v !== "none");
    const keys = permitted.map(([k]) => k);

    if (u.role === "admin") {
      if (keys.length > 0 && !keys.includes("/")) {
        return keys.length <= 2 ? keys.join(", ") : `${keys[0]}, ${keys[1]} (+${keys.length - 2})`;
      }
      return "Tất cả danh mục";
    }

    if (keys.length === 0) {
      return "Chưa phân danh mục";
    }
    if (keys.length === 1) {
      return keys[0];
    }
    if (keys.length === 2) {
      return `${keys[0]}, ${keys[1]}`;
    }
    return `${keys[0]}, ${keys[1]} (+${keys.length - 2})`;
  };

  // =========================================================================
  // VIEW: EDIT / ADD SUBPAGE
  // =========================================================================
  if (viewMode === "add" || viewMode === "edit") {
    const isEdit = viewMode === "edit";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%", maxWidth: "100%", margin: 0 }}>
        {/* Top Breadcrumb & Action bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Tappable
              onClick={handleBackToList}
              radius={999}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                background: "var(--bg-elevated)",
                border: "1px solid var(--stroke)",
                borderRadius: "50%",
                cursor: "pointer",
                color: "var(--fg-secondary)",
              }}
              title="Quay lại"
            >
              <Icon glyph="chevron-left" size={16} />
            </Tappable>
            <h2 className="t-title-md" style={{ margin: 0, fontWeight: 700, fontSize: 18, color: "var(--fg-primary)" }}>
              {isEdit ? "Chỉnh sửa người dùng" : "Thêm người dùng mới"}
            </h2>
          </div>

          <Button
            label={isEdit ? "Lưu thay đổi" : "Tạo người dùng"}
            glyph="check"
            variant="primary"
            compact
            expand={false}
            busy={submitting}
            onClick={handleSaveUser}
          />
        </div>

        {/* SECTION 1: THÔNG TIN CƠ BẢN */}
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--stroke)",
            borderRadius: 14,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            onClick={() => setAccountInfoExpanded((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--fg-primary)" }}>
              Thông tin tài khoản
            </div>
            <Icon
              glyph={accountInfoExpanded ? "chevron-down" : "chevron-right"}
              size={18}
              color="var(--fg-primary)"
            />
          </div>

          {accountInfoExpanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                <TextField
                  label="Tên đăng nhập"
                  hint="lan_huong"
                  value={formUsername}
                  onChange={setFormUsername}
                />
                <TextField
                  label="Tên hiển thị"
                  hint="Nguyễn Lan Hương"
                  value={formDisplayName}
                  onChange={setFormDisplayName}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                <div>
                  <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500, color: "var(--fg-primary)" }}>
                    {isEdit ? "Mật khẩu mới" : "Mật khẩu"}
                  </div>
                  <TextField
                    type="password"
                    hint={isEdit ? "Để trống để giữ mật khẩu cũ" : "Tối thiểu 6 ký tự"}
                    value={formPassword}
                    onChange={setFormPassword}
                  />
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500, color: "var(--fg-primary)" }}>
                    Xác nhận mật khẩu
                  </div>
                  <TextField
                    type="password"
                    hint="Nhập lại mật khẩu vừa gõ"
                    value={formConfirmPassword}
                    onChange={setFormConfirmPassword}
                  />
                </div>
              </div>

              <TextField
                label="Email liên hệ"
                hint="user@example.com"
                value={formEmail}
                onChange={setFormEmail}
              />
            </div>
          )}
        </div>

        {/* SECTION 2: HẠN NGẠCH LƯU TRỮ */}
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--stroke)",
            borderRadius: 14,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            onClick={() => setQuotaExpanded((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--fg-primary)" }}>
              Hạn ngạch lưu trữ
            </div>
            <Icon
              glyph={quotaExpanded ? "chevron-down" : "chevron-right"}
              size={18}
              color="var(--fg-primary)"
            />
          </div>

          {quotaExpanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Chọn Quota: 1 dòng ngang duy nhất, Tùy chỉnh hiện ô nhập ngay bên phải */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--fg-primary)" }}>
                  Hạn ngạch dung lượng
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  {[
                    { id: "unlimited", label: "Không giới hạn" },
                    { id: "50GB", label: "50 GB" },
                    { id: "100GB", label: "100 GB" },
                    { id: "250GB", label: "250 GB" },
                    { id: "500GB", label: "500 GB" },
                    { id: "1TB", label: "1 TB" },
                    { id: "2TB", label: "2 TB" },
                    { id: "custom", label: "Tùy chỉnh" },
                  ].map((p) => {
                    const active = formQuotaPreset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setFormQuotaPreset(p.id)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 8,
                          border: `1px solid ${active ? "var(--accent)" : "var(--stroke)"}`,
                          background: active ? "var(--accent)" : "var(--bg-primary)",
                          color: active ? "#fff" : "var(--fg-primary)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          height: 32,
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}

                  {/* Khi bấm tùy chỉnh: Khung nhập không có tiêu đề hiện ngay bên phải của nút tùy chỉnh */}
                  {formQuotaPreset === "custom" && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 2 }}>
                      <input
                        type="text"
                        value={formCustomQuotaGB}
                        onChange={(e) => setFormCustomQuotaGB(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                        style={{
                          width: 70,
                          height: 32,
                          padding: "0 10px",
                          borderRadius: 8,
                          border: "1px solid var(--accent)",
                          background: "var(--bg-primary)",
                          color: "var(--fg-primary)",
                          fontSize: 13,
                          fontWeight: 600,
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-primary)" }}>GB</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Trạng thái hoạt động */}
              <div
                onClick={() => setFormDisabled((d) => !d)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  background: "var(--bg-primary)",
                  border: "1px solid var(--stroke)",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-primary)" }}>
                    {formDisabled ? "Tài khoản đang bị tạm khóa" : "Tài khoản đang kích hoạt bình thường"}
                  </div>
                </div>
                <div
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    background: !formDisabled ? "#10B981" : "var(--stroke)",
                    position: "relative",
                    transition: "background 0.2s",
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "#fff",
                      position: "absolute",
                      top: 2,
                      left: !formDisabled ? 22 : 2,
                      transition: "left 0.2s",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: DANH MỤC */}
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--stroke)",
            borderRadius: 14,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            onClick={() => setCategoriesExpanded((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--fg-primary)" }}>
              Danh mục
            </div>
            <Icon
              glyph={categoriesExpanded ? "chevron-down" : "chevron-right"}
              size={18}
              color="var(--fg-primary)"
            />
          </div>

          {categoriesExpanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Danh mục: Đồng bộ copy giao diện từ /settings/shares/add, bo góc 12px, nền trắng */}
              <div
                style={{
                  width: "100%",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--stroke)",
                  borderRadius: "var(--r-card, 12px)",
                  overflow: "hidden",
                  boxSizing: "border-box",
                  paddingBottom: 10,
                }}
              >
                {/* Thanh đường dẫn trên cùng */}
                <div
                  style={{
                    padding: "10px 14px",
                    borderBottom: "1px solid var(--stroke)",
                    background: "var(--bg-elevated)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="text"
                    value={categoryPath}
                    onChange={(e) => setCategoryPath(e.target.value)}
                    placeholder="Chưa chọn danh mục"
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      fontWeight: 500,
                      fontSize: 13,
                      color: "var(--fg-primary)",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  />
                </div>

                {/* Cây danh mục bên dưới */}
                <div
                  style={{
                    padding: "8px 6px 4px 6px",
                    maxHeight: 240,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    marginBottom: 4,
                  }}
                >
                  {datasetsLoading ? (
                    <DropdownStatus type="loading" message="Đang tải danh mục..." />
                  ) : datasetTree.length === 0 ? (
                    <DropdownStatus type="empty" glyph="folder" message="Không có bộ dữ liệu nào trong hệ thống." />
                  ) : (
                    datasetTree.map((node) => (
                      <CategoryTreeItem
                        key={node.id}
                        node={node}
                        depth={0}
                        selectedDatasets={selectedDatasets}
                        expandedIds={expandedNodeIds}
                        onToggleSelect={handleToggleSelectDataset}
                        onToggleExpand={handleToggleExpandNode}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Quyền nâng cao: Hiện ở trong Danh mục luôn */}
              <div style={{ paddingTop: 8, marginTop: 2 }}>
                {/* Nút Cài đặt nâng cao: Thiết kế theo đúng ảnh mẫu */}
                <div
                  onClick={() => setAdvancedEnabled((prev) => !prev)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    cursor: "pointer",
                    userSelect: "none",
                    padding: "4px 0",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Icon glyph="tune" size={18} color="var(--fg-primary)" />
                      <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-primary)" }}>
                        Quyền nâng cao
                      </span>
                    </div>
                    <Icon
                      glyph={advancedEnabled ? "chevron-down" : "chevron-right"}
                      size={18}
                      color="var(--fg-primary)"
                    />
                  </div>
                  <div style={{ fontSize: 13, color: "var(--fg-secondary)", lineHeight: 1.4 }}>
                    Không cần thay đổi nếu bạn chưa quen.
                  </div>
                </div>

                {/* Khi mở: Chỉ có Đọc, Ghi, Thực thi. Mặc định là bật Đọc và Ghi */}
                {advancedEnabled && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                    {/* Option 1: Đọc - Mặc định bật */}
                    <div
                      onClick={() => setPermRead((prev) => !prev)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: "var(--r-card, 10px)",
                        background: permRead ? "rgba(79, 126, 248, 0.08)" : "transparent",
                        border: `1px solid ${permRead ? "var(--accent)" : "var(--stroke)"}`,
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Icon glyph="eye" size={17} color={permRead ? "var(--accent)" : "var(--fg-primary)"} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-primary)" }}>
                          Đọc
                        </span>
                      </div>
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: `1.5px solid ${permRead ? "var(--accent)" : "var(--stroke)"}`,
                          background: permRead ? "var(--accent)" : "transparent",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {permRead && <Icon glyph="check" size={13} color="#ffffff" strokeWidth={3} />}
                      </div>
                    </div>

                    {/* Option 2: Ghi - Mặc định bật */}
                    <div
                      onClick={() => setPermWrite((prev) => !prev)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: "var(--r-card, 10px)",
                        background: permWrite ? "rgba(79, 126, 248, 0.08)" : "transparent",
                        border: `1px solid ${permWrite ? "var(--accent)" : "var(--stroke)"}`,
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Icon glyph="edit" size={17} color={permWrite ? "var(--accent)" : "var(--fg-primary)"} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-primary)" }}>
                          Ghi
                        </span>
                      </div>
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: `1.5px solid ${permWrite ? "var(--accent)" : "var(--stroke)"}`,
                          background: permWrite ? "var(--accent)" : "transparent",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {permWrite && <Icon glyph="check" size={13} color="#ffffff" strokeWidth={3} />}
                      </div>
                    </div>

                    {/* Option 3: Thực thi - Mặc định tắt */}
                    <div
                      onClick={() => setPermExecute((prev) => !prev)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: "var(--r-card, 10px)",
                        background: permExecute ? "rgba(79, 126, 248, 0.08)" : "transparent",
                        border: `1px solid ${permExecute ? "var(--accent)" : "var(--stroke)"}`,
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Icon glyph="code" size={17} color={permExecute ? "var(--accent)" : "var(--fg-primary)"} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-primary)" }}>
                          Thực thi
                        </span>
                      </div>
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: `1.5px solid ${permExecute ? "var(--accent)" : "var(--stroke)"}`,
                          background: permExecute ? "var(--accent)" : "transparent",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {permExecute && <Icon glyph="check" size={13} color="#ffffff" strokeWidth={3} />}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM ACTION BAR */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, paddingBottom: 30, width: "100%" }}>
          {isEdit && editingUser?.id !== "usr-admin" && editingUser?.username !== "admin" ? (
            <Button
              label="Xóa người dùng"
              variant="danger"
              glyph="trash"
              compact
              expand={false}
              onClick={() => setDeleteModalUser(editingUser)}
            />
          ) : (
            <div />
          )}

          <Button
            label={isEdit ? "Lưu thay đổi" : "Tạo người dùng"}
            glyph="check"
            variant="primary"
            compact
            expand={false}
            busy={submitting}
            onClick={handleSaveUser}
          />
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: MAIN USERS LIST
  // =========================================================================
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", paddingBottom: isMobile ? 110 : 30 }}>
      {/* Top action row: Tiêu đề & Nút Thao tác */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {onBack && (
            <Tappable
              onClick={onBack}
              radius={999}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                background: "var(--bg-elevated)",
                border: "1px solid var(--stroke)",
                borderRadius: "50%",
                cursor: "pointer",
                color: "var(--fg-secondary)",
              }}
              title="Quay lại"
            >
              <Icon glyph="chevron-left" size={18} />
            </Tappable>
          )}
          <h2 className="t-title-md" style={{ margin: 0, fontWeight: 600, color: "var(--fg-primary)", fontSize: 18 }}>
            Người dùng
          </h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Nút 1: Mời người dùng */}
          <Button
            label={isMobile ? "Mời" : "Mời người dùng"}
            glyph="qr"
            variant="secondary"
            compact
            expand={false}
            onClick={() => {
              setCreatedInvite(null);
              setInviting(true);
            }}
          />

          {/* Nút 2: Thêm người dùng */}
          <Button
            label="Thêm"
            glyph="plus"
            variant="primary"
            compact
            expand={false}
            onClick={handleOpenAdd}
          />
        </div>
      </div>

      {/* Dữ liệu: Thẻ Card trực quan trên Điện thoại, Bảng trên Máy tính */}
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          {loading ? (
            <div style={{ background: "var(--bg-elevated)", borderRadius: 14, border: "1px solid var(--stroke)" }}>
              <DropdownStatus type="loading" message="Đang tải danh sách người dùng..." />
            </div>
          ) : users.length === 0 ? (
            <div style={{ background: "var(--bg-elevated)", borderRadius: 14, border: "1px solid var(--stroke)" }}>
              <DropdownStatus type="empty" glyph="users" message="Chưa có người dùng nào." />
            </div>
          ) : (
            users.map((u) => {
              const isCurrent = currentUser?.id === u.id || currentUser?.username === u.username;
              return (
                <div
                  key={u.id}
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--stroke)",
                    borderRadius: 14,
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {/* Dòng 1: Avatar, Tên, Trạng thái & Thao tác */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                      <Avatar name={u.display_name || u.username} seed={u.avatar_seed} size={38} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: "var(--fg-primary)", display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {u.display_name || u.username}
                          </span>
                          {isCurrent && (
                            <span style={{ fontSize: 9, background: "rgba(59, 130, 246, 0.12)", color: "var(--accent)", padding: "1px 5px", borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>
                              BẠN
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--fg-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          @{u.username} {u.email ? `• ${u.email}` : ""}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <span
                        style={{
                          padding: "2px 7px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: !u.disabled ? "rgba(76, 175, 109, 0.1)" : "rgba(239, 68, 68, 0.1)",
                          color: !u.disabled ? "#4CAF6D" : "#EF4444",
                        }}
                      >
                        {!u.disabled ? "Hoạt động" : "Đã khóa"}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleOpenEdit(u)}
                        style={{
                          background: "var(--accent, #4c8dff)",
                          border: "none",
                          borderRadius: 8,
                          padding: "5px 10px",
                          color: "#ffffff",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Sửa
                      </button>

                      <button
                        type="button"
                        title="Đặt lại mật khẩu"
                        onClick={() => handleResetPassword(u)}
                        style={{
                          background: "var(--bg-sunken)",
                          border: "1px solid var(--stroke)",
                          cursor: "pointer",
                          padding: "5px 7px",
                          borderRadius: 6,
                          color: "var(--fg-secondary)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon glyph="lock" size={14} />
                      </button>

                      {u.id !== "usr-admin" && u.username !== "admin" && (
                        <button
                          type="button"
                          onClick={() => setDeleteModalUser(u)}
                          style={{
                            background: "var(--bg-sunken)",
                            border: "1px solid var(--stroke)",
                            cursor: "pointer",
                            padding: "5px 7px",
                            borderRadius: 6,
                            color: "var(--warning, #EF4444)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          title="Xóa người dùng"
                        >
                          <Icon glyph="trash" size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dòng 2: Hạn ngạch & Danh mục */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                      paddingTop: 8,
                      borderTop: "1px solid var(--stroke)",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "var(--fg-secondary)" }}>Hạn ngạch:</span>
                      <span style={{ fontWeight: 600, color: "var(--fg-primary)" }}>
                        {u.quota_bytes > 0 ? bytes(u.quota_bytes) : "Không giới hạn"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "60%" }}>
                      <span style={{ color: "var(--fg-secondary)", flexShrink: 0 }}>Danh mục:</span>
                      <span
                        onClick={() => handleOpenEdit(u)}
                        style={{
                          cursor: "pointer",
                          color: "var(--accent)",
                          fontWeight: 600,
                          background: "rgba(76, 141, 255, 0.1)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatUserCategories(u)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {users.length > 0 && <Sentinel />}
        </div>
      ) : (
        /* Bảng dữ liệu Desktop */
        <div
          style={{
            width: "100%",
            background: "var(--bg-elevated)",
            border: "1px solid var(--stroke)",
            borderRadius: "var(--r-card, 14px)",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto", width: "100%", scrollbarWidth: "none" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <DropdownStatus type="loading" message="Đang tải danh sách người dùng..." />
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <DropdownStatus type="empty" glyph="users" message="Chưa có người dùng nào." />
                    </td>
                  </tr>
                ) : (
                  users.map((u, idx) => {
                    const isCurrent = currentUser?.id === u.id || currentUser?.username === u.username;

                    return (
                      <tr
                        key={u.id}
                        style={{
                          borderBottom: idx === users.length - 1 ? "none" : "1px solid var(--stroke)",
                          transition: "background 0.15s ease",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {/* Cột 1: Người dùng */}
                        <td style={{ padding: "14px 20px", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <Avatar name={u.display_name || u.username} seed={u.avatar_seed} size={36} />
                            <div>
                              <div style={{ fontWeight: 600, color: "var(--fg-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                                {u.display_name || u.username}
                                {isCurrent && (
                                  <span style={{ fontSize: 10, background: "rgba(59, 130, 246, 0.12)", color: "var(--accent)", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                                    BẠN
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 12, color: "var(--fg-secondary)" }}>
                                @{u.username} {u.email ? `• ${u.email}` : ""}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Cột 2: Hạn ngạch */}
                        <td style={{ padding: "14px 20px", color: "var(--fg-primary)", fontSize: 13, whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 500 }}>
                            {u.quota_bytes > 0 ? bytes(u.quota_bytes) : "Không giới hạn"}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--fg-secondary)", marginTop: 2 }}>
                            Đã dùng: {bytes(u.quota_bytes_used || 0)}
                          </div>
                        </td>

                        {/* Cột 3: Phân quyền */}
                        <td style={{ padding: "14px 20px", whiteSpace: "nowrap" }}>
                          <span
                            onClick={() => handleOpenEdit(u)}
                            style={{
                              cursor: "pointer",
                              color: "var(--accent)",
                              fontWeight: 600,
                              fontSize: 12,
                              background: "rgba(76, 141, 255, 0.1)",
                              padding: "3px 8px",
                              borderRadius: 4,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatUserCategories(u)}
                          </span>
                        </td>

                        {/* Cột 4: Trạng thái */}
                        <td style={{ padding: "14px 20px", whiteSpace: "nowrap" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: !u.disabled ? "rgba(76, 175, 109, 0.1)" : "rgba(239, 68, 68, 0.1)",
                              color: !u.disabled ? "#4CAF6D" : "#EF4444",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {!u.disabled ? "Hoạt động" : "Đã khóa"}
                          </span>
                        </td>

                        {/* Cột 5: Thao tác */}
                        <td style={{ padding: "14px 20px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(u)}
                              style={{
                                background: "var(--accent, #4c8dff)",
                                border: "none",
                                borderRadius: 8,
                                padding: "6px 14px",
                                color: "#ffffff",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08)",
                              }}
                            >
                              Chỉnh sửa
                            </button>
                            <button
                              type="button"
                              title="Đặt lại mật khẩu"
                              onClick={() => handleResetPassword(u)}
                              style={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                padding: "6px 8px",
                                borderRadius: 6,
                                color: "var(--fg-secondary)",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Icon glyph="lock" size={16} />
                            </button>
                            {u.id !== "usr-admin" && u.username !== "admin" && (
                              <button
                                type="button"
                                onClick={() => setDeleteModalUser(u)}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: "6px 8px",
                                  borderRadius: 6,
                                  color: "var(--fg-secondary)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                                title="Xóa người dùng này"
                              >
                                <Icon glyph="trash" size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {users.length > 0 && <Sentinel />}
        </div>
      )}

      {/* Modal Mời người dùng (Invite Sheet) */}
      <Sheet
        open={inviting}
        onClose={() => setInviting(false)}
        title={createdInvite ? "Mã mời người dùng" : "Mời người dùng tham gia"}
      >
        {createdInvite ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                padding: "16px",
                background: "var(--bg-primary)",
                border: "1px solid var(--stroke)",
                borderRadius: "var(--r-field)",
                fontFamily: "var(--font-mono)",
                fontSize: 18,
                fontWeight: 600,
                textAlign: "center",
                letterSpacing: 2,
              }}
            >
              {createdInvite.code}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Button
                label="Sao chép mã"
                variant="secondary"
                compact
                onClick={async () => {
                  await navigator.clipboard.writeText(createdInvite.code);
                  toast("Đã sao chép mã mời!", "success");
                }}
              />
              <Button
                label="Sao chép liên kết"
                compact
                onClick={async () => {
                  const link = window.location.origin + createdInvite.link;
                  await navigator.clipboard.writeText(link);
                  toast("Đã sao chép liên kết mời!", "success");
                }}
              />
            </div>
            <Button label="Xong" variant="secondary" onClick={() => setInviting(false)} />
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!inviteLabel.trim()) return;
              try {
                const res = await api.post<{ code: string; link: string }>(Api.invites, { label: inviteLabel.trim() });
                setCreatedInvite(res);
                setInviteLabel("");
              } catch (err) {
                toast(err instanceof Error ? err.message : "Không thể tạo lời mời!", "error");
              }
            }}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <TextField
              label="Ghi chú người được mời"
              hint="Đồng nghiệp, Bạn bè, Gia đình"
              value={inviteLabel}
              onChange={setInviteLabel}
              autoFocus
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button label="Hủy" variant="secondary" compact onClick={() => setInviting(false)} />
              <Button label="Tạo mã mời" compact type="submit" />
            </div>
          </form>
        )}
      </Sheet>

      {/* Modal Xác nhận Đặt lại Mật khẩu */}
      {resetPwModalUser && (
        <Dialog
          open={!!resetPwModalUser}
          onClose={() => setResetPwModalUser(null)}
          title="Mật khẩu tạm thời mới"
          maxWidth={420}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 13, color: "var(--fg-secondary)" }}>
              Đã cấp mật khẩu tạm thời cho người dùng <b>{resetPwModalUser.username}</b>. Hãy gửi mã này cho họ:
            </div>
            <div
              style={{
                padding: "12px 14px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--stroke)",
                borderRadius: 8,
                fontFamily: "monospace",
                fontSize: 16,
                fontWeight: 700,
                textAlign: "center",
                color: "var(--accent)",
              }}
            >
              {tempPassword}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button
                label="Sao chép"
                variant="secondary"
                compact
                onClick={async () => {
                  await navigator.clipboard.writeText(tempPassword);
                  toast("Đã sao chép mật khẩu tạm thời!", "success");
                }}
              />
              <Button label="Đóng" compact onClick={() => setResetPwModalUser(null)} />
            </div>
          </div>
        </Dialog>
      )}

      {/* Modal Xác nhận Xóa người dùng */}
      {deleteModalUser && (
        <Dialog
          open={!!deleteModalUser}
          onClose={() => setDeleteModalUser(null)}
          title="Xác nhận xóa tài khoản"
          maxWidth={440}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                padding: "12px 14px",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: 10,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Bạn có chắc chắn muốn xóa tài khoản <b>{deleteModalUser.username}</b> ({deleteModalUser.display_name})?
              Toàn bộ phiên đăng nhập và phân quyền của người này sẽ bị thu hồi vĩnh viễn.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button label="Hủy" variant="secondary" compact onClick={() => setDeleteModalUser(null)} />
              <Button
                label="Xác nhận xóa"
                variant="danger"
                compact
                onClick={() => handleDeleteUser(deleteModalUser)}
              />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
