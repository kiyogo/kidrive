"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useUploader } from "@/lib/uploads";
import { ShareSheet } from "@/components/share/ShareSheet";
import { DetailsPane } from "./DetailsPane";
import { bandStyle, hasPointer, rangeBetween, useFileKeys, useMarquee, useNodeDrag } from "./desktop";
import { useL10n, type Strings } from "@/lib/l10n";
import { FileTileIcon, categoryOfNode } from "./FileTileIcon";

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
  const [nodes, setNodes] = useState<NodeModel[] | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{
    x?: number;
    y?: number;
    anchorRect?: { left: number; right: number; top: number; bottom: number };
    node: NodeModel;
  } | null>(null);
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
  const listRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renamingNode, setRenamingNode] = useState<NodeModel | null>(null);
  const [renameName, setRenameName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDeleteNode, setConfirmDeleteNode] = useState<NodeModel | null>(null);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);

  useEffect(() => {
    if (createFolderTrigger && createFolderTrigger > 0) {
      setFolderName("");
      setCreateFolderOpen(true);
    }
  }, [createFolderTrigger]);

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    setIsSubmitting(true);
    try {
      await api.post(Api.folder, { name: folderName.trim(), parent_id: folderId });
      setCreateFolderOpen(false);
      setFolderName("");
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t.errorUnexpectedTitle, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRename = async () => {
    if (!renamingNode || !renameName.trim()) return;
    setIsSubmitting(true);
    try {
      await api.patch(Api.node(renamingNode.id), { name: renameName.trim() });
      setRenamingNode(null);
      setRenameName("");
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

  const handleRecolor = async (colorKey: string) => {
    if (!recoloringNode) return;
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

  const load = useCallback(async () => {
    setError("");
    setNodes(null);
    try {
      // The trash is its own endpoint, not a filter. /nodes accepts shared,
      // starred and recent only, and quietly ignores anything else: asking it
      // for "trash" returned the whole drive, which looked like every file had
      // been deleted.
      const data =
        filter === "trash"
          ? await api.get<{ nodes: NodeModel[] }>(Api.trash)
          : await api.get<{ nodes: NodeModel[] }>(Api.nodes, {
              parent_id: filter === "none" ? folderId : "",
              filter: filter === "none" ? undefined : filter,
              query: query || undefined,
            });
      setNodes(data?.nodes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errorUnexpectedBody);
    }
  }, [folderId, filter, query, t]);

  useEffect(() => {
    void load();
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

  const toggle = (id: string, additive: boolean, range = false) => {
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
  };

  const activate = (node: NodeModel) => {
    if (isFolder(node)) onOpenFolder(node);
    else onPreview(node, nodes ? nodes.filter((n) => !isFolder(n)) : undefined);
  };

  const { pick: upload, sheet: clashSheet, busy: resolvingClash } = useUploader(folderId, () => {
    toast(t.transferCompleted, "success");
    void load();
  });

  const chosen = visible.filter((n) => selection.has(n.id));

  const trashChosen = useCallback(async () => {
    const list = visible.filter((n) => selection.has(n.id));
    if (!list.length) return;
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
  }, [visible, selection, toast, load]);

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
    enabled: !layered,
  });

  const { over, dragProps, folderProps } = useNodeDrag(
    useCallback(
      async (ids: string[], intoFolderId: string) => {
        for (const id of ids) {
          try {
            await api.patch(Api.node(id), { parent_id: intoFolderId });
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
      (files: FileList, intoFolderId: string) => {
        void upload(files, intoFolderId);
      },
      [upload],
    ),
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
        void upload(e.dataTransfer.files);
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

          {isDesktop && filter === "none" ? (
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
              {filter === "none" && (
                <UtilityButton glyph="folder" title={t.newFolder} onClick={() => { setFolderName(""); setCreateFolderOpen(true); }} />
              )}
              <Button label={t.upload} glyph="upload" compact expand={false} onClick={() => fileInput.current?.click()} />
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
                  transition: "border-color var(--d-hover) var(--ease)",
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
                {filter === "none" && (
                  <UtilityButton
                    glyph="folder"
                    title={t.newFolder}
                    onClick={() => {
                      setFolderName("");
                      setCreateFolderOpen(true);
                    }}
                  />
                )}
                <Button label={t.upload} glyph="upload" compact expand={false} onClick={() => fileInput.current?.click()} />
              </span>
            </>
          )
        )}
      </header>

      {filter === "trash" && isMobile && (
        <Banner glyph="recent" message={t.trashRetentionNote({ days: 30 })} tint="var(--fg-secondary)" />
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
        onChange={(e) => void upload(e.target.files)}
      />

      {/* the selection bar floats over the listing, so the listing starts below it */}
      {chosen.length > 0 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="ld-enter"
          style={{
            position: "sticky",
            top: isDesktop ? 72 : 8,
            margin: "8px 16px -48px",
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--accent)",
            borderRadius: "var(--r-pill)",
          }}
        >
          <Tappable onClick={() => setSelection(new Set())} radius={999} style={{ padding: 6 }}>
            <Icon glyph="close" size={18} />
          </Tappable>
          <span className="t-title-sm" style={{ flex: 1 }}>
            {t.selectedCount({ count: chosen.length })}
          </span>
          <Tappable onClick={() => setSelection(new Set(visible.map((n) => n.id)))} radius={999} style={{ padding: 6 }} title={t.actionSelect}>
            <Icon glyph="check" size={18} />
          </Tappable>
          {chosen.length === 1 && (
            <Tappable
              radius={999}
              style={{ padding: 6 }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setMenu({
                  anchorRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
                  x: rect.right,
                  y: rect.bottom,
                  node: chosen[0],
                });
              }}
              title={t.moreActions}
            >
              <Icon glyph="more" size={18} />
            </Tappable>
          )}
          <Tappable
            radius={999}
            style={{ padding: 6, color: "var(--warning)" }}
            title={t.confirmTrashTitle}
            onClick={async () => {
              for (const node of chosen) {
                try {
                  await api.del(Api.node(node.id));
                } catch {
                  /* reported below, once */
                }
              }
              toast(t.confirmTrashTitle, "success");
              setSelection(new Set());
              void load();
            }}
          >
            <Icon glyph="trash" size={18} />
          </Tappable>
        </div>
      )}

      {/* listing */}
      <div ref={listRef} style={{ flex: 1, minHeight: 0, paddingTop: chosen.length ? 72 : 0 }}>
        {error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : nodes === null ? (
          view === "grid" && filter !== "trash" ? <GridSkeleton /> : <ListSkeleton />
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
            actionLabel={filter === "none" && !query ? t.upload : undefined}
            onAction={filter === "none" && !query ? () => fileInput.current?.click() : undefined}
          />
        ) : view === "grid" && filter !== "trash" ? (
          <Grid nodes={visible} selection={selection} onToggle={toggle} onActivate={activate} onMenu={setMenu} dragProps={dragProps} folderProps={folderProps} over={over} />
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
          />
        )}
      </div>

      {/* exactly one selected opens the pane; several means a bulk action is
          in progress and one item's details would describe the wrong thing */}
      {isDesktop && chosen.length === 1 && (
        <DetailsPane
          node={chosen[0]}
          onClose={() => setSelection(new Set())}
          onOpen={activate}
          onChanged={() => void load()}
          onShare={(n) => setSharing(n)}
        />
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
          { label: t.newFolder, glyph: "folder-plus", onClick: () => { setFolderName(""); setCreateFolderOpen(true); } },
          { label: t.upload, glyph: "upload", onClick: () => fileInput.current?.click() },
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
        title={menu?.node.name}
        subtitle={menu ? subtitleFor(menu.node) : undefined}
        onClose={() => setMenu(null)}
        items={
          menu
            ? filter === "trash"
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
                    glyph: (isFolder(menu.node) ? "folder" : "eye") as Glyph,
                    onClick: () => activate(menu.node),
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
                    onClick: () => {
                      setRenamingNode(menu.node);
                      setRenameName(menu.node.name);
                    },
                  },
                  ...(isFolder(menu.node)
                    ? [
                        {
                          label: t.folderColor,
                          glyph: "grid" as Glyph,
                          onClick: () => setRecoloringNode(menu.node),
                        },
                      ]
                    : []),
                  {
                    label: t.actionMove,
                    glyph: "move" as Glyph,
                    onClick: () => void openMoveDialog(menu.node),
                  },
                  {
                    label: t.actionShare,
                    glyph: "share" as Glyph,
                    onClick: () => setSharing(menu.node),
                  },
                  {
                    label: t.trash,
                    glyph: "trash" as Glyph,
                    danger: true,
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
  }) => void;
  dragProps: (id: string, sel: Set<string>) => Record<string, unknown>;
  folderProps: (id: string) => Record<string, unknown>;
  over: string;
}) {
  const kept = useKeptIds();
  return (
    <div
      style={{
        display: "grid",
        // sized by how wide a tile should be, not by how many should fit
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 13,
        padding: "13px 13px 120px",
      }}
    >
      {nodes.map((node) => (
        <Tile
          key={node.id}
          node={node}
          selected={selection.has(node.id)}
          onToggle={onToggle}
          onActivate={onActivate}
          onMenu={onMenu}
          dragProps={dragProps}
          folderProps={folderProps}
          over={over}
          selection={selection}
          kept={kept.has(node.id)}
        />
      ))}
    </div>
  );
}

function Tile({
  node,
  selected,
  onToggle,
  onActivate,
  onMenu,
  dragProps,
  folderProps,
  over,
  selection,
  kept,
}: {
  node: NodeModel;
  selected: boolean;
  onToggle: (id: string, additive: boolean, range?: boolean) => void;
  onActivate: (n: NodeModel) => void;
  onMenu: (m: {
    x?: number;
    y?: number;
    anchorRect?: { left: number; right: number; top: number; bottom: number };
    node: NodeModel;
  }) => void;
  dragProps: (id: string, sel: Set<string>) => Record<string, unknown>;
  folderProps: (id: string) => Record<string, unknown>;
  over: string;
  selection: Set<string>;
  kept: boolean;
}) {
  const t = useL10n();
  const cat = categoryOfNode(node);

  return (
    <div
      data-node-id={node.id}
      {...dragProps(node.id, selection)}
      {...(isFolder(node) ? folderProps(node.id) : {})}
      onClick={(e) => {
        e.stopPropagation();
        if (e.detail >= 2) onActivate(node);
        else onToggle(node.id, e.ctrlKey || e.metaKey, e.shiftKey);
      }}
      onDoubleClick={() => onActivate(node)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMenu({ x: e.clientX, y: e.clientY, node });
      }}
      style={{ cursor: "pointer", display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          position: "relative",
          aspectRatio: "1 / 1",
          borderRadius: "var(--r-tile)",
          border: `1px solid ${over === node.id || selected ? "var(--accent)" : "var(--stroke)"}`,
          background: over === node.id ? "rgba(76,141,255,0.12)" : "var(--bg-elevated)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          transition: "border-color var(--d-hover) var(--ease)",
        }}
      >
        {node.has_thumbnail ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={api.media(Api.thumbnail(node.id))}
              alt=""
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
        {node.owner && (
          <span style={{ position: "absolute", insetInlineStart: 6, top: 6 }} title={node.owner.name}>
            <Avatar name={node.owner.name} seed={node.owner.avatar_seed} size={26} showBorder />
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
        <div className="t-label-sm" style={{ color: "var(--fg-secondary)", marginTop: 2 }}>
          {isFolder(node) ? relative(node.updated_at) : bytes(node.size_bytes)}
        </div>
      </div>
    </div>
  );
}

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
  }) => void;
  dragProps: (id: string, sel: Set<string>) => Record<string, unknown>;
  folderProps: (id: string) => Record<string, unknown>;
  over: string;
  isTrash?: boolean;
  onRestore?: (n: NodeModel) => void;
  onDeleteForever?: (n: NodeModel) => void;
}) {
  const t = useL10n();
  const kept = useKeptIds();
  return (
    <div style={{ padding: "13px 13px 120px" }}>
      {nodes.map((node) => {
        const cat = categoryOfNode(node);
        const selected = !isTrash && selection.has(node.id);
        const selecting = !isTrash && selection.size > 0;
        return (
          <div
            key={node.id}
            data-node-id={node.id}
            {...(isTrash ? {} : dragProps(node.id, selection))}
            {...(!isTrash && isFolder(node) ? folderProps(node.id) : {})}
            onClick={(e) => {
              e.stopPropagation();
              if (isTrash) return;
              if (e.detail >= 2) onActivate(node);
              else onToggle(node.id, e.ctrlKey || e.metaKey, e.shiftKey);
            }}
            onDoubleClick={() => {
              if (!isTrash) onActivate(node);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMenu({ x: e.clientX, y: e.clientY, node });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "2px 0",
              padding: "9px 10px",
              borderRadius: "var(--r-tile)",
              border: `1px solid ${over === node.id || selected ? "var(--accent)" : "transparent"}`,
              background: over === node.id || selected ? "rgba(76, 141, 255, 0.1)" : "transparent",
              cursor: isTrash ? "default" : "pointer",
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
              {node.has_thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={api.media(Api.thumbnail(node.id))}
                  alt=""
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <FileTileIcon category={cat} size={36} folderColor={node.color} />
              )}
              {node.owner && (
                <span style={{ position: "absolute", top: -2, left: -2 }}>
                  <Avatar name={node.owner.name} seed={node.owner.avatar_seed} size={18} showBorder />
                </span>
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
                {!isTrash && node.starred && (
                  <Icon glyph="star-filled" size={13} color="#E8935C" />
                )}
                {!isTrash && node.shared && (
                  <Icon glyph="link" size={13} color="var(--accent)" />
                )}
                {!isTrash && kept.has(node.id) && (
                  <Icon glyph="offline" size={13} color="var(--accent)" />
                )}
              </span>
              <span className="t-body-sm" style={{ color: "var(--fg-secondary)", marginTop: 2, display: "block" }}>
                {subtitleFor(node)}
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
      })}
    </div>
  );
}
