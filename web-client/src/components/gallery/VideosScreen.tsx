"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useL10n } from "@/lib/l10n";
import { Icon, type Glyph } from "@/components/Icon";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  GridSkeleton,
  Menu,
  SizeSlider,
  Tappable,
  TextField,
  useDeviceClass,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { bytes } from "@/lib/format";
import type { NodeModel } from "@/lib/models";
import { useUploader } from "@/lib/uploads";
import { ShareSheet } from "@/components/share/ShareSheet";

type SortKey = "created" | "updated" | "name" | "size";

/**
 * All videos in one place, matching Flutter VideosPage:
 * - Masonry grid layout with natural video aspect ratios.
 * - Columns customizable (3, 4, 5 on desktop).
 * - Default sorting by newest added (created desc).
 */
export function VideosScreen({ onOpen }: { onOpen: (n: NodeModel, list?: NodeModel[]) => void }) {
  const t = useL10n();
  const { isDesktop, isTablet } = useDeviceClass();
  const [nodes, setNodes] = useState<NodeModel[] | null>(null);
  const [error, setError] = useState("");
  const [columns, setColumns] = useState(3);
  const [sortBy, setSortBy] = useState<SortKey>("created");
  const [sortDesc, setSortDesc] = useState(true);
  const [sortMenuAnchor, setSortMenuAnchor] = useState<{ left: number; right: number; top: number; bottom: number } | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const sortBtnRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    x?: number;
    y?: number;
    node: NodeModel;
    isBulk?: boolean;
  } | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<{
    x?: number;
    y?: number;
  } | null>(null);
  const [sharing, setSharing] = useState<NodeModel | null>(null);
  const [renamingNode, setRenamingNode] = useState<NodeModel | null>(null);
  const [renameName, setRenameName] = useState("");
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  // Restore saved column preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ld.videos.columns");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if ([3, 4, 5].includes(parsed)) {
          setColumns(parsed);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleColumnsChange = (n: number) => {
    setColumns(n);
    try {
      localStorage.setItem("ld.videos.columns", String(n));
    } catch {
      // Ignore
    }
  };

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ nodes: NodeModel[] }>(Api.nodes, {
        filter: "video",
        sort: sortBy,
        order: sortDesc ? "desc" : "asc",
        limit: 500,
      });
      setNodes(data?.nodes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errorUnexpectedBody);
    }
  }, [sortBy, sortDesc, t.errorUnexpectedBody]);

  const upload = useUploader("", () => void load());

  // Fetch video nodes with current sort
  useEffect(() => {
    void load();
  }, [load]);

  const toggleSelect = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedNodes = useMemo(() => {
    if (!nodes || selection.size === 0) return [];
    return nodes.filter((n) => selection.has(n.id));
  }, [nodes, selection]);

  const sortLabel = useMemo(() => {
    switch (sortBy) {
      case "created":
        return t.gallerySortAdded;
      case "updated":
        return t.gallerySortModified;
      case "name":
        return t.gallerySortName;
      case "size":
        return t.gallerySortSize;
    }
  }, [sortBy, t]);

  const effectiveColumns = isDesktop ? columns : isTablet ? 2 : 2;

  // Distribute nodes into masonry columns matching Flutter's SliverMasonryGrid
  const columnBuckets = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];
    const count = effectiveColumns;
    const buckets: NodeModel[][] = Array.from({ length: count }, () => []);
    const heights = new Array(count).fill(0);

    for (const node of nodes) {
      const r =
        ratios[node.id] ??
        (node.image_width && node.image_height && node.image_height > 0
          ? node.image_width / node.image_height
          : 16 / 9);
      const clamped = Math.min(Math.max(r, 0.2), 5.0);
      const heightUnits = 1 / clamped;

      let minCol = 0;
      for (let c = 1; c < count; c++) {
        if (heights[c] < heights[minCol]) {
          minCol = c;
        }
      }
      buckets[minCol].push(node);
      heights[minCol] += heightUnits;
    }

    return buckets;
  }, [nodes, effectiveColumns, ratios]);

  return (
    <div style={{ minHeight: "100dvh" }}>
      <header
        style={{
          height: 64,
          padding: "0 20px",
          position: "sticky",
          top: 0,
          background: "var(--bg-primary)",
          borderBottom: "1px solid var(--stroke)",
          zIndex: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
          <h1 className="t-title-md" style={{ margin: 0, lineHeight: 1.2 }}>
            {selection.size > 0 ? t.gallerySelected({ count: selection.size }) : t.videos}
          </h1>
          {nodes && nodes.length > 0 && selection.size === 0 && (
            <span className="t-body-sm" style={{ color: "var(--fg-secondary)", marginTop: 2 }}>
              {t.videosSummary({ count: nodes.length })}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {selection.size > 0 ? (
            <>
              <Button
                variant="secondary"
                label={t.download}
                glyph="download"
                compact
                expand={false}
                onClick={() => {
                  for (const n of selectedNodes) {
                    window.open(api.media(Api.download(n.id)), "_blank");
                  }
                  setSelection(new Set());
                }}
              />
              <Button
                variant="text"
                label={t.actionDeselect}
                compact
                expand={false}
                onClick={() => setSelection(new Set())}
              />
            </>
          ) : (
            <>
              {isDesktop && (
                <SizeSlider columns={columns} onChanged={handleColumnsChange} steps={[3, 4, 5]} />
              )}
              <div ref={sortBtnRef}>
                <Button
                  variant="secondary"
                  label={sortLabel}
                  glyph={sortDesc ? "arrowDown" : "arrowUp"}
                  compact
                  expand={false}
                  onClick={() => {
                    const rect = sortBtnRef.current?.getBoundingClientRect();
                    if (rect) {
                      setSortMenuAnchor({
                        left: rect.left,
                        right: rect.right,
                        top: rect.top,
                        bottom: rect.bottom,
                      });
                    }
                  }}
                />
              </div>
              <Menu
                open={Boolean(sortMenuAnchor)}
                anchorRect={sortMenuAnchor}
                onClose={() => setSortMenuAnchor(null)}
                items={[
                  {
                    label: t.gallerySortAdded,
                    onClick: () => {
                      if (sortBy === "created") setSortDesc((d) => !d);
                      else {
                        setSortBy("created");
                        setSortDesc(true);
                      }
                    },
                  },
                  {
                    label: t.gallerySortModified,
                    onClick: () => {
                      if (sortBy === "updated") setSortDesc((d) => !d);
                      else {
                        setSortBy("updated");
                        setSortDesc(true);
                      }
                    },
                  },
                  {
                    label: t.gallerySortName,
                    onClick: () => {
                      if (sortBy === "name") setSortDesc((d) => !d);
                      else {
                        setSortBy("name");
                        setSortDesc(false);
                      }
                    },
                  },
                  {
                    label: t.gallerySortSize,
                    onClick: () => {
                      if (sortBy === "size") setSortDesc((d) => !d);
                      else {
                        setSortBy("size");
                        setSortDesc(true);
                      }
                    },
                  },
                ]}
              />
            </>
          )}
        </div>
      </header>

      {error ? (
        <ErrorState message={error} />
      ) : nodes === null ? (
        <GridSkeleton />
      ) : nodes.length === 0 ? (
        <EmptyState glyph="video" title={t.videosEmptyTitle} message={t.videosEmptyBody} />
      ) : (
        <div
          style={{
            display: "flex",
            gap: 13,
            padding: "13px 13px 100px 13px",
            boxSizing: "border-box",
            width: "100%",
          }}
          onContextMenu={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest("[data-video-tile]")) return;
            if (target.closest("button, a, input")) return;
            e.preventDefault();
            setCanvasMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          {columnBuckets.map((bucket, colIdx) => (
            <div
              key={colIdx}
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 13,
              }}
            >
              {bucket.map((node) => {
                const isSelected = selection.has(node.id);
                const r =
                  ratios[node.id] ??
                  (node.image_width && node.image_height && node.image_height > 0
                    ? node.image_width / node.image_height
                    : 16 / 9);
                const clampedRatio = Math.min(Math.max(r, 0.2), 5.0);

                return (
                  <VideoCard
                    key={node.id}
                    node={node}
                    ratio={clampedRatio}
                    selected={isSelected}
                    selecting={selection.size > 0}
                    onRatioResolved={(resolvedRatio) => {
                      setRatios((prev) => {
                        if (prev[node.id] === resolvedRatio) return prev;
                        return { ...prev, [node.id]: resolvedRatio };
                      });
                    }}
                    onOpen={() => {
                      if (selection.size > 0) {
                        toggleSelect(node.id);
                      } else {
                        onOpen(node, nodes);
                      }
                    }}
                    onToggleSelect={() => toggleSelect(node.id)}
                    onMenu={setMenu}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="video/*"
        hidden
        onChange={(e) => void upload.pick(e.target.files)}
      />

      {upload.sheet}

      <Menu
        open={Boolean(menu)}
        x={menu?.x}
        y={menu?.y}
        title={menu?.isBulk ? t.selectedCount({ count: selectedNodes.length }) : menu?.node.name}
        onClose={() => setMenu(null)}
        items={
          menu
            ? menu.isBulk
              ? [
                  {
                    label: t.download,
                    glyph: "download" as Glyph,
                    onClick: () => {
                      for (const n of selectedNodes) {
                        window.open(api.media(Api.download(n.id)), "_blank");
                      }
                      setSelection(new Set());
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
                    onClick: async () => {
                      for (const n of selectedNodes) {
                        await api.del(Api.node(n.id));
                      }
                      toast(t.trash, "success");
                      setSelection(new Set());
                      void load();
                    },
                  },
                ]
              : [
                  {
                    label: t.actionPlay,
                    glyph: "play" as Glyph,
                    onClick: () => onOpen(menu.node, nodes ?? undefined),
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
                    label: t.download,
                    glyph: "download" as Glyph,
                    onClick: () => window.open(api.media(Api.download(menu.node.id)), "_blank"),
                  },
                  {
                    label: t.actionRename,
                    glyph: "edit" as Glyph,
                    onClick: () => {
                      setRenamingNode(menu.node);
                      setRenameName(menu.node.name);
                    },
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

      <Menu
        open={Boolean(canvasMenu)}
        x={canvasMenu?.x}
        y={canvasMenu?.y}
        onClose={() => setCanvasMenu(null)}
        items={[
          {
            label: t.upload,
            glyph: "upload" as Glyph,
            onClick: () => fileInput.current?.click(),
          },
          {
            label: t.actionRefresh,
            glyph: "refresh" as Glyph,
            onClick: () => void load(),
          },
          ...(nodes && nodes.length > 0
            ? [
                {
                  label: t.actionSelect,
                  glyph: "check" as Glyph,
                  onClick: () => setSelection(new Set(nodes.map((n) => n.id))),
                },
              ]
            : []),
        ]}
      />

      {sharing && <ShareSheet node={sharing} onClose={() => setSharing(null)} />}

      <Dialog open={Boolean(renamingNode)} onClose={() => setRenamingNode(null)} title={t.actionRename}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!renamingNode || !renameName.trim()) return;
            try {
              await api.patch(Api.node(renamingNode.id), { name: renameName.trim() });
              toast(t.actionRename, "success");
              setRenamingNode(null);
              void load();
            } catch (err) {
              toast(err instanceof Error ? err.message : t.errorUnexpectedTitle, "error");
            }
          }}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <TextField
            label={t.actionRename}
            value={renameName}
            onChange={setRenameName}
            autoFocus
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button label={t.actionCancel} variant="secondary" onClick={() => setRenamingNode(null)} />
            <Button label={t.actionSave} type="submit" disabled={!renameName.trim()} />
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function VideoCard({
  node,
  ratio,
  selected,
  selecting,
  onOpen,
  onToggleSelect,
  onRatioResolved,
  onMenu,
}: {
  node: NodeModel;
  ratio: number;
  selected: boolean;
  selecting: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onRatioResolved: (r: number) => void;
  onMenu: (m: { x?: number; y?: number; node: NodeModel; isBulk?: boolean }) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth && imgRef.current.naturalHeight) {
      onRatioResolved(imgRef.current.naturalWidth / imgRef.current.naturalHeight);
    }
  }, [node.id, onRatioResolved]);

  return (
    <Tappable
      data-video-tile={node.id}
      onClick={selecting ? onToggleSelect : onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (selecting && selected) {
          onMenu({ x: e.clientX, y: e.clientY, node, isBulk: true });
        } else {
          if (!selected) {
            onToggleSelect();
          }
          onMenu({ x: e.clientX, y: e.clientY, node, isBulk: false });
        }
      }}
      radius={14}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${ratio}`,
        overflow: "hidden",
        border: selected ? "2px solid var(--accent)" : "1px solid var(--stroke)",
        padding: selected ? 4 : 0,
        background: "#141424",
        borderRadius: "var(--r-tile)",
        boxSizing: "border-box",
      }}
    >
      {/* Video Thumbnail */}
      {node.has_thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={api.media(Api.thumbnail(node.id))}
          alt={node.name}
          loading="lazy"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              onRatioResolved(img.naturalWidth / img.naturalHeight);
            }
          }}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            borderRadius: selected ? "calc(var(--r-tile) - 4px)" : "inherit",
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#141424",
          }}
        />
      )}

      {/* Center Play Button Overlay */}
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
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon glyph="play" size={20} color="#FFFFFF" />
        </div>
      </div>

      {/* Bottom Info Bar Overlay (matching Flutter VideoTile) */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(0, 0, 0, 0.65)",
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 14,
          padding: "6px 8px",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Icon glyph="play" size={14} color="#FFFFFF" />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "#FFFFFF",
            fontSize: 12.5,
            fontWeight: 500,
            lineHeight: 1.2,
          }}
          title={node.name}
        >
          {node.name}
        </span>
        {node.size_bytes > 0 && (
          <span
            style={{
              flexShrink: 0,
              color: "rgba(255, 255, 255, 0.7)",
              fontSize: 11.5,
              lineHeight: 1.2,
            }}
          >
            {bytes(node.size_bytes)}
          </span>
        )}
      </div>

      {/* Selection Checkmark */}
      {selecting && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: selected ? "var(--accent)" : "rgba(0, 0, 0, 0.4)",
            border: `1.5px solid ${selected ? "var(--accent)" : "rgba(255, 255, 255, 0.8)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected && <Icon glyph="check" size={14} color="#FFFFFF" />}
        </div>
      )}
    </Tappable>
  );
}
