"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button, Dialog, DropdownStatus, Tappable, TextField, useDeviceClass, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { useInfiniteList, useVirtualWindow } from "@/lib/useInfiniteList";

export interface NetworkShareItem {
  id: string;
  name: string; // Tên
  purpose: string; // Mục đích -> "Chia sẻ mặc định"
  path: string; // Đường dẫn
  description: string; // Mô tả
  readOnly: boolean; // Chỉ đọc
  browseable: boolean; // Hiển thị trên mạng
  hideUnreadable: boolean; // Ẩn chia sẻ không có quyền truy cập
  createdAt: number;
}

export interface FolderTreeNode {
  id: string;
  name: string;
  path: string;
  isDrive?: boolean;
  children?: FolderTreeNode[];
}

export const FOLDER_TREE: FolderTreeNode[] = [];
export const AVAILABLE_SHARE_PATHS: { path: string; label: string; desc: string }[] = [];

function FolderTreeItem({
  node,
  depth,
  selectedPath,
  expandedIds,
  onSelect,
  onToggle,
}: {
  node: FolderTreeNode;
  depth: number;
  selectedPath: string;
  expandedIds: Set<string>;
  onSelect: (node: FolderTreeNode) => void;
  onToggle: (id: string, e: React.MouseEvent) => void;
}) {
  const isSelected = Boolean(
    selectedPath &&
    node.path &&
    (selectedPath === node.path ||
      selectedPath.replace(/\/+$/, "") === node.path.replace(/\/+$/, ""))
  );
  const hasChildren = !!node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        onClick={() => onSelect(node)}
        style={{
          display: "flex",
          alignItems: "center",
          paddingLeft: 10 + depth * 22,
          paddingRight: 10,
          paddingTop: 6,
          paddingBottom: 6,
          borderRadius: 8,
          cursor: "pointer",
          background: "transparent",
          userSelect: "none",
          gap: 7,
          transition: "color 0.15s ease",
        }}
      >
        {/* Caret / chevron: Dùng vector icon chevron-down / chevron-right chuẩn, không dùng unicode tam giác thô */}
        {hasChildren ? (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id, e);
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

        {/* Drive or Folder icon */}
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

        {/* Folder or Drive name */}
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: isSelected ? "var(--accent, #4c8dff)" : "var(--fg-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {node.name}
        </span>
      </div>

      {/* Children if expanded */}
      {hasChildren && isExpanded && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {node.children!.map((child) => (
            <FolderTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function NetworkSharesSection({
  onBack,
  embedded,
}: {
  onBack?: () => void;
  embedded?: boolean;
}) {
  const { isMobile } = useDeviceClass();
  const toast = useToast();

  const [isAdding, setIsAdding] = useState(false);
  const [editingShareId, setEditingShareId] = useState<string | null>(null);

  // Form state cho /add
  const [shareName, setShareName] = useState("");
  const [purpose, setPurpose] = useState("Chia sẻ mặc định");
  const [purposeDropdownOpen, setPurposeDropdownOpen] = useState(false);
  const [deletingShare, setDeletingShare] = useState<NetworkShareItem | null>(null);
  const [sharePath, setSharePath] = useState("/");
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [shareDescription, setShareDescription] = useState("");

  // Trạng thái đóng/mở 2 khung
  const [shareCardExpanded, setShareCardExpanded] = useState(true);
  const [shares1Expanded, setShares1Expanded] = useState(true);

  // Trạng thái Nâng cao & Quyền truy cập
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [browseable, setBrowseable] = useState(true);
  const [hideUnreadable, setHideUnreadable] = useState(false);

  // Load shares from API with Infinite Scroll
  const {
    items: shares,
    setItems: setShares,
    loading,
    loadingMore,
    hasMore,
    reload: loadShares,
    Sentinel,
  } = useInfiniteList<NetworkShareItem>({
    pageSize: 30,
    getItemKey: (s) => s.id,
    fetchPage: async ({ offset, limit, signal }) => {
      const res = await api.get<{ shares: any[]; has_more?: boolean; next_offset?: number; total?: number }>(
        Api.adminShares,
        { limit, offset },
        { signal }
      );
      const list = res?.shares ?? [];
      const mapped = list.map((s: any) => ({
        id: s.id,
        name: s.name,
        purpose: s.purpose || "Chia sẻ mặc định",
        path: s.path,
        description: s.description || "",
        readOnly: !!s.read_only,
        browseable: s.browseable !== false,
        hideUnreadable: !!s.hide_unreadable,
        createdAt: s.created_at,
      }));
      return {
        items: mapped,
        hasMore: Boolean(res?.has_more ?? (list.length >= limit)),
        nextOffset: res?.next_offset ?? offset + list.length,
        total: res?.total,
      };
    },
  });

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await api.get<{ tree: FolderTreeNode[] }>(Api.adminSharesTree);
      if (res?.tree && res.tree.length > 0) {
        let nodes = res.tree;
        if (nodes.length === 1 && nodes[0]?.name === "/" && nodes[0].children && nodes[0].children.length > 0) {
          nodes = nodes[0].children;
        }

        // Tự động mở rộng tất cả các cấp thư mục để người dùng thấy rõ cấu trúc cây
        const allIds = new Set<string>();
        const collectIds = (items: FolderTreeNode[]) => {
          items.forEach((n) => {
            allIds.add(n.id);
            if (n.children && n.children.length > 0) {
              collectIds(n.children);
            }
          });
        };
        collectIds(nodes);

        setFolderTree(nodes);
        setExpandedNodeIds(allIds);
      } else {
        setFolderTree([]);
      }
    } catch {
      setFolderTree([]);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Xử lý URL /settings/shares/add và /settings/shares/edit/:id
  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncRoute = () => {
      const path = window.location.pathname;
      const isAdd =
        path.endsWith("/shares/add") ||
        path.endsWith("/network-shares/add") ||
        ((path.includes("/shares") || path.includes("/network-shares")) && path.endsWith("/add"));

      if (isAdd) {
        setIsAdding(true);
        setEditingShareId(null);
      } else if (path.includes("/shares/edit/") || path.includes("/network-shares/edit/")) {
        const parts = path.includes("/shares/edit/") ? path.split("/shares/edit/") : path.split("/network-shares/edit/");
        const targetId = decodeURIComponent(parts[1]?.split("/")[0] || "");
        if (targetId) {
          setIsAdding(true);
          const found = shares.find((s) => s.id === targetId || s.name === targetId);
          if (found) {
            if (editingShareId !== found.id) {
              setEditingShareId(found.id);
              setShareName(found.name);
              setPurpose(found.purpose || "Chia sẻ mặc định");
              setSharePath(found.path);
              setShareDescription(found.description);
              setReadOnly(found.readOnly);
              setBrowseable(found.browseable);
              setHideUnreadable(found.hideUnreadable);
            }
          } else {
            setEditingShareId(targetId);
          }
        }
      } else if (path.endsWith("/settings/shares") || path.endsWith("/settings/network-shares") || path === "/settings/shares" || path === "/settings/network-shares") {
        setIsAdding(false);
        setEditingShareId(null);
      }
    };

    syncRoute();
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, [shares]);

  const handleOpenAdd = (updateUrl = true) => {
    setEditingShareId(null);
    setShareName("");
    setPurpose("Chia sẻ mặc định");
    setSharePath("");
    setExpandedNodeIds(new Set());
    setPurposeDropdownOpen(false);
    setShareDescription("");
    setReadOnly(false);
    setBrowseable(true);
    setHideUnreadable(false);
    setShareCardExpanded(true);
    setShares1Expanded(true);
    setAdvancedExpanded(false);
    setIsAdding(true);

    if (updateUrl && typeof window !== "undefined") {
      window.history.pushState(null, "", "/settings/shares/add");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  const handleStartEdit = (item: NetworkShareItem, updateUrl = true) => {
    setEditingShareId(item.id);
    setShareName(item.name);
    setPurpose(item.purpose || "Chia sẻ mặc định");
    setSharePath(item.path);
    setPurposeDropdownOpen(false);
    setShareDescription(item.description);
    setReadOnly(item.readOnly);
    setBrowseable(item.browseable);
    setHideUnreadable(item.hideUnreadable);
    setShareCardExpanded(true);
    setShares1Expanded(true);
    setAdvancedExpanded(false);
    setIsAdding(true);

    if (updateUrl && typeof window !== "undefined") {
      window.history.pushState(null, "", `/settings/shares/edit/${item.id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  const handleCancelAdd = () => {
    setEditingShareId(null);
    setIsAdding(false);
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", "/settings/shares");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  const handleSaveShare = async () => {
    const trimmedName = shareName.trim();
    if (!trimmedName) {
      toast("Vui lòng nhập tên chia sẻ", "error");
      return;
    }
    const trimmedPath = sharePath.trim();
    if (!trimmedPath) {
      toast("Vui lòng nhập đường dẫn thư mục", "error");
      return;
    }

    try {
      if (editingShareId) {
        await api.patch(Api.adminShare(editingShareId), {
          name: trimmedName,
          purpose,
          path: trimmedPath,
          description: shareDescription.trim(),
          read_only: readOnly,
          browseable,
          hide_unreadable: hideUnreadable,
        });
        toast(`Đã cập nhật chia sẻ "${trimmedName}" thành công!`, "success");
      } else {
        await api.post(Api.adminShares, {
          name: trimmedName,
          purpose,
          path: trimmedPath,
          description: shareDescription.trim(),
          read_only: readOnly,
          browseable,
          hide_unreadable: hideUnreadable,
        });
        toast(`Đã thêm chia sẻ "${trimmedName}" thành công!`, "success");
      }
      await loadShares();
      handleCancelAdd();
    } catch (e: any) {
      toast(e?.message || "Lỗi lưu chia sẻ trên máy chủ", "error");
    }
  };

  const handleDeleteShare = async (id: string, name: string) => {
    try {
      await api.del(Api.adminShare(id));
      await loadShares();
      toast(`Đã xóa chia sẻ "${name}"`, "info");
    } catch (e: any) {
      toast(e?.message || "Lỗi xóa chia sẻ", "error");
    }
  };

  /* ========================================================================= */
  /* GIAO DIỆN FORM THÊM CHIA SẺ MẠNG (settings/network-shares/add)            */
  /* Giống 100% vị trí, cấu trúc, kích thước padding như /settings/disks/add    */
  /* ========================================================================= */
  if (isAdding) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: isMobile ? 110 : 60 }}>
        {/* Header quay lại Chia sẻ tệp mạng nội bộ */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Tappable
            onClick={handleCancelAdd}
            radius={999}
            style={{ padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}
            title="Quay lại Chia sẻ tệp mạng nội bộ"
          >
            <Icon glyph="chevron-left" size={20} color="var(--fg-primary)" />
          </Tappable>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 className="t-title-md" style={{ margin: 0, fontWeight: 600, color: "var(--fg-primary)", fontSize: 18 }}>
              Chia sẻ tệp mạng nội bộ
            </h2>
          </div>
        </div>

        {/* Khung form: Cùng cấu trúc, độ rộng và padding chuẩn cố định như Disks */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Khung 1: Chia sẻ (Có thể đóng/mở toàn bộ khung, padding cố định 20px 24px để tiêu đề không bị di chuyển) */}
          <div
            style={{
              width: "min(520px, 100%)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--stroke)",
              borderRadius: "var(--r-card, 12px)",
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: shareCardExpanded ? 18 : 0,
              boxSizing: "border-box",
              position: "relative",
              transition: "all var(--d-hover, 150ms) var(--ease)",
            }}
          >
            {/* Header Khung 1: Bấm để đóng/mở */}
            <button
              type="button"
              onClick={() => setShareCardExpanded((prev) => !prev)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textAlign: "left",
                userSelect: "none",
                minHeight: 24,
              }}
            >
              <div className="t-title-md" style={{ margin: 0, fontWeight: 600, color: "var(--fg-primary)", lineHeight: "24px" }}>
                Chia sẻ
              </div>
              <Icon
                glyph={shareCardExpanded ? "chevron-down" : "chevron-right"}
                size={18}
                color="var(--fg-primary)"
              />
            </button>

            {shareCardExpanded && (
              <>
                {/* Tên */}
                <TextField
                  label="Tên"
                  hint="Nhập tên thư mục chia sẻ"
                  value={shareName}
                  onChange={setShareName}
                  autoFocus
                />

                {/* Mục đích -> "Chia sẻ mặc định" (chỉ có 1 cái thôi) */}
                <div style={{ position: "relative", zIndex: purposeDropdownOpen ? 90 : 2 }}>
                  <div style={{ marginBottom: 8 }}>
                    <span className="t-label-md" style={{ color: "var(--fg-primary)", fontWeight: 600 }}>
                      Mục đích
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPurposeDropdownOpen((prev) => !prev)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "var(--bg-elevated)",
                      border: `1px solid ${purposeDropdownOpen ? "var(--accent)" : "var(--stroke)"}`,
                      borderRadius: "var(--r-field, 12px)",
                      cursor: "pointer",
                      color: "var(--fg-primary)",
                      textAlign: "left",
                      boxSizing: "border-box",
                      transition: "border-color var(--d-hover) var(--ease)",
                      outline: "none",
                    }}
                  >
                    <span style={{ fontWeight: 500, fontSize: 13, color: "var(--fg-primary)" }}>
                      {purpose}
                    </span>
                    <Icon glyph={purposeDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="var(--fg-primary)" />
                  </button>

                  {/* Dropdown Menu xổ xuống */}
                  {purposeDropdownOpen && (
                    <>
                      <div
                        style={{ position: "fixed", inset: 0, zIndex: 900 }}
                        onClick={() => setPurposeDropdownOpen(false)}
                      />
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          left: 0,
                          right: 0,
                          width: "100%",
                          zIndex: 901,
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--stroke)",
                          borderRadius: "var(--r-card, 16px)",
                          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
                          padding: 6,
                          boxSizing: "border-box",
                        }}
                      >
                        {[
                          "Chia sẻ mặc định",
                          "Chia sẻ Media DLNA",
                          "Chia sẻ sao lưu Time Machine",
                          "Chia sẻ công cộng Chỉ đọc",
                        ].map((opt) => {
                          const isSel = purpose === opt;
                          return (
                            <div
                              key={opt}
                              onClick={() => {
                                setPurpose(opt);
                                setPurposeDropdownOpen(false);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 12px",
                                borderRadius: "var(--r-chip, 10px)",
                                background: isSel ? "rgba(79, 126, 248, 0.08)" : "transparent",
                                cursor: "pointer",
                                transition: "background 0.15s ease",
                              }}
                            >
                              <span style={{ fontSize: 13, fontWeight: isSel ? 600 : 500, color: isSel ? "var(--accent)" : "var(--fg-primary)" }}>
                                {opt}
                              </span>
                              {isSel && <Icon glyph="check" size={14} color="var(--accent)" strokeWidth={2.5} />}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Đường dẫn: Hiển thị cây thư mục như ảnh 2, đồng bộ giao diện web bo góc, hiện trắng */}
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <span className="t-label-md" style={{ color: "var(--fg-primary)", fontWeight: 600 }}>
                      Đường dẫn
                    </span>
                  </div>

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
                        value={sharePath}
                        onChange={(e) => setSharePath(e.target.value)}
                        placeholder="Chọn thư mục bên dưới hoặc nhập đường dẫn..."
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

                    {/* Cây thư mục bên dưới */}
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
                      {treeLoading ? (
                        <DropdownStatus type="loading" message="Đang tải danh mục thư mục..." />
                      ) : folderTree.length === 0 ? (
                        <DropdownStatus type="empty" glyph="folder" message="Không có thư mục lưu trữ" />
                      ) : (
                        folderTree.map((rootNode) => (
                          <FolderTreeItem
                            key={rootNode.id}
                            node={rootNode}
                            depth={0}
                            selectedPath={sharePath}
                            expandedIds={expandedNodeIds}
                            onSelect={(node) => {
                              setSharePath(node.path);
                              if (!shareName.trim()) {
                                setShareName(node.name === "/" ? "root" : node.name);
                              }
                              if (node.children && node.children.length > 0) {
                                setExpandedNodeIds((prev) => new Set(prev).add(node.id));
                              }
                            }}
                            onToggle={(id, e) => {
                              e.stopPropagation();
                              setExpandedNodeIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(id)) next.delete(id);
                                else next.add(id);
                                return next;
                              });
                            }}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Mô tả */}
                <TextField
                  label="Mô tả"
                  hint="Nhập mô tả cho thư mục chia sẻ"
                  value={shareDescription}
                  onChange={setShareDescription}
                />
              </>
            )}
          </div>

          {/* Khung 2: Shares1 (Có thể đóng/mở toàn bộ khung, padding cố định 20px 24px để tiêu đề không bị di chuyển) */}
          <div
            style={{
              width: "min(520px, 100%)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--stroke)",
              borderRadius: "var(--r-card, 12px)",
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: shares1Expanded ? 16 : 0,
              boxSizing: "border-box",
              position: "relative",
              transition: "all var(--d-hover, 150ms) var(--ease)",
            }}
          >
            {/* Header Khung 2: Bấm để đóng/mở */}
            <button
              type="button"
              onClick={() => setShares1Expanded((prev) => !prev)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textAlign: "left",
                userSelect: "none",
                minHeight: 24,
              }}
            >
              <div className="t-title-md" style={{ margin: 0, fontWeight: 600, color: "var(--fg-primary)", lineHeight: "24px" }}>
                Shares1
              </div>
              <Icon
                glyph={shares1Expanded ? "chevron-down" : "chevron-right"}
                size={18}
                color="var(--fg-primary)"
              />
            </button>

            {shares1Expanded && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Nâng cao (theo đúng 100% ảnh mẫu: Icon tune + Nâng cao + chevron + subtitle) */}
                <div
                  onClick={() => setAdvancedExpanded((prev) => !prev)}
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
                        Nâng cao
                      </span>
                    </div>
                    <Icon
                      glyph={advancedExpanded ? "chevron-down" : "chevron-right"}
                      size={18}
                      color="var(--fg-primary)"
                    />
                  </div>
                  <div style={{ fontSize: 13, color: "var(--fg-secondary)", lineHeight: 1.4 }}>
                    Không cần thay đổi nếu bạn chưa quen.
                  </div>
                </div>

                {/* Khi bấm Nâng cao mới hiện ra: Mục Truy cập */}
                {advancedExpanded && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-primary)", marginBottom: 2 }}>
                      Truy cập
                    </div>

                    {/* 1. Chỉ đọc */}
                    <div
                      onClick={() => setReadOnly((prev) => !prev)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: "var(--r-card, 10px)",
                        background: readOnly ? "rgba(79, 126, 248, 0.08)" : "transparent",
                        border: `1px solid ${readOnly ? "var(--accent)" : "var(--stroke)"}`,
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Icon glyph="lock" size={17} color={readOnly ? "var(--accent)" : "var(--fg-primary)"} />
                        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-primary)" }}>
                          Chỉ đọc
                        </span>
                      </div>
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          border: `2px solid ${readOnly ? "var(--accent)" : "var(--stroke)"}`,
                          background: readOnly ? "var(--accent)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.15s ease",
                          flex: "none",
                        }}
                      >
                        {readOnly && <Icon glyph="check" size={12} color="#fff" strokeWidth={2.5} />}
                      </div>
                    </div>

                    {/* 2. Hiển thị trên mạng */}
                    <div
                      onClick={() => setBrowseable((prev) => !prev)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: "var(--r-card, 10px)",
                        background: browseable ? "rgba(79, 126, 248, 0.08)" : "transparent",
                        border: `1px solid ${browseable ? "var(--accent)" : "var(--stroke)"}`,
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Icon glyph="eye" size={17} color={browseable ? "var(--accent)" : "var(--fg-primary)"} />
                        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-primary)" }}>
                          Hiển thị trên mạng
                        </span>
                      </div>
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          border: `2px solid ${browseable ? "var(--accent)" : "var(--stroke)"}`,
                          background: browseable ? "var(--accent)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.15s ease",
                          flex: "none",
                        }}
                      >
                        {browseable && <Icon glyph="check" size={12} color="#fff" strokeWidth={2.5} />}
                      </div>
                    </div>

                    {/* 3. Ẩn chia sẻ không có quyền truy cập */}
                    <div
                      onClick={() => setHideUnreadable((prev) => !prev)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: "var(--r-card, 10px)",
                        background: hideUnreadable ? "rgba(79, 126, 248, 0.08)" : "transparent",
                        border: `1px solid ${hideUnreadable ? "var(--accent)" : "var(--stroke)"}`,
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Icon glyph="eye" size={17} color={hideUnreadable ? "var(--accent)" : "var(--fg-primary)"} />
                        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-primary)" }}>
                          Ẩn chia sẻ không có quyền truy cập
                        </span>
                      </div>
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          border: `2px solid ${hideUnreadable ? "var(--accent)" : "var(--stroke)"}`,
                          background: hideUnreadable ? "var(--accent)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.15s ease",
                          flex: "none",
                        }}
                      >
                        {hideUnreadable && <Icon glyph="check" size={12} color="#fff" strokeWidth={2.5} />}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer buttons: Vị trí width min(520px, 100%) giống hệt Disks */}
          <div style={{ width: "min(520px, 100%)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Button
              label="Hủy"
              variant="secondary"
              compact
              expand={false}
              onClick={handleCancelAdd}
            />
            <Button
              label="Lưu"
              glyph="check"
              variant="primary"
              compact
              expand={false}
              onClick={handleSaveShare}
            />
          </div>
        </div>
      </div>
    );
  }

  /* ========================================================================= */
  /* GIAO DIỆN BẢNG DỮ LIỆU CHÍNH (settings/network-shares)                    */
  /* ========================================================================= */
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", paddingBottom: isMobile ? 110 : 30 }}>
      {/* Top action row: Tiêu đề & Nút Thêm */}
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
            Chia sẻ tệp mạng nội bộ
          </h2>
        </div>
        <Button
          label="Thêm"
          glyph="plus"
          variant="primary"
          compact
          expand={false}
          onClick={handleOpenAdd}
        />
      </div>

      {/* Dữ liệu: Thẻ Card trực quan trên Điện thoại, Bảng trên Máy tính */}
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          {loading ? (
            <div style={{ background: "var(--bg-elevated)", borderRadius: 14, border: "1px solid var(--stroke)" }}>
              <DropdownStatus type="loading" message="Đang tải danh sách chia sẻ mạng..." />
            </div>
          ) : shares.length === 0 ? (
            <div style={{ background: "var(--bg-elevated)", borderRadius: 14, border: "1px solid var(--stroke)" }}>
              <DropdownStatus type="empty" glyph="share" message="Chưa có thư mục chia sẻ mạng nào." />
            </div>
          ) : (
            shares.map((item) => (
              <div
                key={item.id}
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
                {/* Dòng 1: Tên, Purpose tag & Nút thao tác */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: "rgba(76, 141, 255, 0.12)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon glyph="share" size={18} color="var(--accent)" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--fg-primary)", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--fg-secondary)" }}>
                        {item.purpose || "Chia sẻ mặc định"}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(item)}
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
                      onClick={() => setDeletingShare(item)}
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
                      title="Xóa chia sẻ"
                    >
                      <Icon glyph="trash" size={14} />
                    </button>
                  </div>
                </div>

                {/* Dòng 2: Đường dẫn */}
                <div
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.clipboard) {
                      navigator.clipboard.writeText(item.path);
                      toast(`Đã sao chép đường dẫn: ${item.path}`, "success");
                    }
                  }}
                  style={{
                    padding: "6px 10px",
                    background: "var(--bg-sunken)",
                    borderRadius: 6,
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 12,
                    color: "var(--fg-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                  title="Bấm để sao chép đường dẫn"
                >
                  📁 {item.path}
                </div>

                {/* Dòng 3: Quyền & Mô tả */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--fg-secondary)" }}>Quyền:</span>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: item.readOnly ? "rgba(239, 68, 68, 0.1)" : "rgba(76, 175, 109, 0.1)",
                        color: item.readOnly ? "#EF4444" : "#4CAF6D",
                      }}
                    >
                      {item.readOnly ? "Chỉ đọc" : "Đọc & ghi"}
                    </span>
                    {item.browseable && (
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 500,
                          background: "rgba(128, 128, 128, 0.1)",
                          color: "var(--fg-secondary)",
                        }}
                      >
                        Hiển thị mạng
                      </span>
                    )}
                  </div>

                  {item.description && (
                    <div style={{ color: "var(--fg-secondary)", fontSize: 11, maxWidth: "50%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.description}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {shares.length > 0 && <Sentinel />}
        </div>
      ) : (
        /* Bảng dữ liệu: Hiển thị đầy đủ, thoáng đãng từ trái qua phải, không bị co ép dòng */
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
                    <td colSpan={6} style={{ padding: 0 }}>
                      <DropdownStatus type="loading" message="Đang tải danh sách chia sẻ mạng..." />
                    </td>
                  </tr>
                ) : shares.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <DropdownStatus type="empty" glyph="share" message="Chưa có thư mục chia sẻ mạng nào." />
                    </td>
                  </tr>
                ) : (
                  shares.map((item, idx) => (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: idx === shares.length - 1 ? "none" : "1px solid var(--stroke)",
                        transition: "background 0.15s ease",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {/* Tên */}
                      <td style={{ padding: "14px 20px", fontWeight: 600, color: "var(--fg-primary)", whiteSpace: "nowrap" }}>
                        <span>{item.name}</span>
                      </td>

                      {/* Mục đích */}
                      <td style={{ padding: "14px 20px", color: "var(--fg-primary)", fontSize: 13, whiteSpace: "nowrap" }}>
                        {item.purpose}
                      </td>

                      {/* Đường dẫn */}
                      <td
                        onClick={() => {
                          if (typeof navigator !== "undefined" && navigator.clipboard) {
                            navigator.clipboard.writeText(item.path);
                            toast(`Đã sao chép đường dẫn: ${item.path}`, "success");
                          }
                        }}
                        title="Bấm để sao chép đường dẫn"
                        style={{
                          padding: "14px 20px",
                          fontFamily: "var(--font-mono, monospace)",
                          color: "var(--fg-primary)",
                          fontSize: 12,
                          whiteSpace: "nowrap",
                          cursor: "pointer",
                        }}
                      >
                        <span>{item.path}</span>
                      </td>

                      {/* Mô tả */}
                      <td style={{ padding: "14px 20px", color: "var(--fg-secondary)", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.description || "—"}
                      </td>

                      {/* Quyền */}
                      <td style={{ padding: "14px 20px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", alignItems: "center" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: "rgba(76, 175, 109, 0.1)",
                              color: "#4CAF6D",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Đọc
                          </span>
                          {!item.readOnly && (
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 600,
                                background: "rgba(76, 175, 109, 0.1)",
                                color: "#4CAF6D",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Ghi
                            </span>
                          )}
                          {item.browseable && (
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 500,
                                background: "rgba(128, 128, 128, 0.1)",
                                color: "var(--fg-secondary)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Hiển thị mạng
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Thao tác */}
                      <td style={{ padding: "14px 20px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item)}
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
                            onClick={() => setDeletingShare(item)}
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
                            title="Xóa chia sẻ này"
                          >
                            <Icon glyph="trash" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {shares.length > 0 && <Sentinel />}
        </div>
      )}

      {/* Dialog xác nhận xóa chia sẻ mạng */}
      {deletingShare && (
        <Dialog
          open={!!deletingShare}
          onClose={() => setDeletingShare(null)}
          title="Xác nhận xóa chia sẻ mạng"
          maxWidth={460}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 13, color: "var(--fg-secondary)", lineHeight: 1.5 }}>
              Bạn có chắc chắn muốn xóa thư mục chia sẻ <b>"{deletingShare.name}"</b> (<code>{deletingShare.path}</code>)? Các thiết bị trong mạng LAN sẽ không còn thấy hoặc truy cập được thư mục này.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <Button label="Hủy" variant="secondary" compact expand={false} onClick={() => setDeletingShare(null)} />
              <Button
                label="Xác nhận xóa"
                variant="primary"
                compact
                expand={false}
                onClick={() => {
                  handleDeleteShare(deletingShare.id, deletingShare.name);
                  setDeletingShare(null);
                }}
              />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
