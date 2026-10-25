"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { categoryOf, type NodeModel } from "@/lib/models";
import { transfers, type Transfer } from "@/lib/upload";
import { useUploader } from "@/lib/uploads";
import { ShareSheet } from "@/components/share/ShareSheet";
import { useInfiniteList, getAdaptivePageSize } from "@/lib/useInfiniteList";

// In-memory module cache so navigating back to Gallery instantly displays loaded photos
let memoryGalleryCache: NodeModel[] | null = null;

/**
 * The image gallery: strictly photos/images only in one timeline.
 * Calls `/api/v1/nodes?filter=image` and strictly renders images.
 */
export function GalleryScreen({ onOpen }: { onOpen: (n: NodeModel, list?: NodeModel[]) => void }) {
  const t = useL10n();
  const { isDesktop } = useDeviceClass();
  const [columns, setColumns] = useState(5);
  const [sortBy, setSortBy] = useState<"taken" | "created" | "updated" | "name" | "size">("taken");
  const [sortDesc, setSortDesc] = useState(true);
  const [menu, setMenu] = useState<{
    x?: number;
    y?: number;
    node: NodeModel;
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

  // Clear cache on unmount so exiting and re-entering loads fresh from beginning
  useEffect(() => {
    return () => {
      memoryGalleryCache = null;
    };
  }, []);

  const {
    items: rawNodes,
    setItems: setNodes,
    loading,
    loadingMore,
    hasMore,
    error,
    reload: load,
    Sentinel,
  } = useInfiniteList<NodeModel>({
    pageSize: getAdaptivePageSize(50, 100),
    initialItems: memoryGalleryCache ?? undefined,
    onItemsUpdated: (items) => {
      memoryGalleryCache = items;
    },
    getItemKey: (node) => node.id,
    deps: [sortBy, sortDesc],
    fetchPage: async ({ offset, limit, signal }) => {
      const data = await api.get<{ nodes: NodeModel[]; has_more?: boolean; next_offset?: number }>(
        Api.nodes,
        {
          filter: "image",
          sort: sortBy,
          order: sortDesc ? "desc" : "asc",
          limit,
          offset,
        },
        { signal }
      );
      const imagesOnly = (data?.nodes ?? []).filter(
        (n) => categoryOf(n) === "image" || n.mime_type?.startsWith("image/")
      );
      return {
        items: imagesOnly,
        hasMore: Boolean(data?.has_more ?? (data?.nodes?.length ? data.nodes.length >= limit : false)),
        nextOffset: data?.next_offset ?? offset + (data?.nodes?.length ?? 0),
      };
    },
  });

  const nodes = loading && !memoryGalleryCache?.length ? null : rawNodes;
  const upload = useUploader("", () => void load());

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const reload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 150);
    };
    window.addEventListener("ld_nodes_changed", reload);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ld_nodes_changed", reload);
    };
  }, [load]);

  const count = nodes?.length ?? 0;

  const sortLabel = (() => {
    switch (sortBy) {
      case "taken":
        return t.gallerySortTaken;
      case "created":
        return t.gallerySortAdded;
      case "updated":
        return t.gallerySortModified;
      case "name":
        return t.gallerySortName;
      case "size":
        return t.gallerySortSize;
      default:
        return t.gallerySortTaken;
    }
  })();

  const toggleSort = () => {
    setSortDesc((d) => !d);
  };

  return (
    <div style={{ minHeight: "100dvh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 64,
          padding: "0 24px",
          borderBottom: "1px solid var(--stroke)",
          position: "sticky",
          top: 0,
          background: "var(--bg-primary)",
          zIndex: 60,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h1 className="t-title-lg" style={{ margin: 0, fontSize: 20 }}>
            {t.gallery}
          </h1>
          <div style={{ fontSize: 13, color: "var(--fg-secondary)", marginTop: 2 }}>
            {nodes !== null ? t.gallerySummary({ photos: count, videos: 0 }) : " "}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isDesktop && (
            <SizeSlider columns={columns} onChanged={setColumns} steps={[3, 4, 5, 6, 8, 10, 12]} />
          )}
          <Button
            label={sortLabel}
            glyph={sortDesc ? "arrow-down" : "arrow-up"}
            variant="secondary"
            compact
            expand={false}
            onClick={toggleSort}
          />
        </div>
      </header>

      {error ? (
        <ErrorState message={error} />
      ) : nodes === null ? (
        <GridSkeleton />
      ) : nodes.length === 0 ? (
        <EmptyState glyph="gallery" title={t.galleryEmptyTitle} message={t.galleryEmptyBody} />
      ) : (
        <GalleryGridContent
          nodes={nodes}
          columns={columns}
          isDesktop={isDesktop}
          onOpen={onOpen}
          setMenu={setMenu}
          setCanvasMenu={setCanvasMenu}
          Sentinel={Sentinel}
        />
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/*"
        hidden
        onChange={(e) => void upload.pick(e.target.files)}
      />

      {upload.sheet}

      <Menu
        open={Boolean(menu)}
        x={menu?.x}
        y={menu?.y}
        title={menu?.node.name}
        onClose={() => setMenu(null)}
        items={
          menu
            ? [
                {
                  label: t.actionOpen,
                  glyph: "eye" as Glyph,
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

function LazyGalleryTile({
  node,
  nodes,
  ratio,
  isDesktop,
  onOpen,
  onContextMenu,
}: {
  node: NodeModel;
  nodes: NodeModel[];
  ratio: number;
  isDesktop: boolean;
  onOpen: (n: NodeModel, list?: NodeModel[]) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Viewport-only loading: only load thumbnail when within 400px of visible area.
    // Unmount when scrolled far away (>800px) to reclaim RAM and texture memory.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
          } else {
            const rect = entry.boundingClientRect;
            const viewH = window.innerHeight || 800;
            if (rect.bottom < -800 || rect.top > viewH + 800) {
              setIsVisible(false);
            }
          }
        }
      },
      { rootMargin: "400px 0px 400px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isHeic = /\.(heic|heif)$/i.test(node.name);
  const thumbUrl = api.media(Api.thumbnail(node.id));
  const canFallback = !isHeic && (node.size_bytes || 0) <= 1024 * 1024;
  const fallbackUrl = canFallback ? api.media(Api.download(node.id)) : "";

  return (
    <div
      ref={containerRef}
      data-gallery-tile={node.id}
      onClick={() => onOpen(node, nodes)}
      onContextMenu={onContextMenu}
      style={{
        display: "block",
        width: "100%",
        aspectRatio: `${ratio}`,
        overflow: "hidden",
        borderRadius: isDesktop ? 14 : 8,
        border: "1px solid var(--stroke)",
        background: "var(--bg-elevated)",
        position: "relative",
        cursor: "pointer",
        contain: "paint layout",
      }}
    >
      {isVisible ? (
        imgError && !canFallback ? (
          <span
            style={{
              display: "grid",
              placeItems: "center",
              height: "100%",
              color: "var(--fg-muted)",
              opacity: 0.3,
            }}
          >
            <Icon glyph="image" size={24} />
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgError && canFallback ? fallbackUrl : thumbUrl}
            alt={node.name}
            loading="lazy"
            decoding="async"
            onError={() => {
              setImgError(true);
            }}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              transition: "opacity 0.15s ease",
            }}
          />
        )
      ) : (
        <span
          style={{
            display: "grid",
            placeItems: "center",
            height: "100%",
            color: "var(--fg-muted)",
            opacity: 0.3,
          }}
        >
          <Icon glyph="image" size={24} />
        </span>
      )}
    </div>
  );
}

function GalleryGridContent({
  nodes,
  columns,
  isDesktop,
  onOpen,
  setMenu,
  setCanvasMenu,
  Sentinel,
}: {
  nodes: NodeModel[];
  columns: number;
  isDesktop: boolean;
  onOpen: (n: NodeModel, list?: NodeModel[]) => void;
  setMenu: (m: { x?: number; y?: number; node: NodeModel } | null) => void;
  setCanvasMenu: (m: { x?: number; y?: number } | null) => void;
  Sentinel: React.ComponentType;
}) {
  return (
    <div
      style={{ padding: isDesktop ? "16px 24px 120px" : "8px 8px 120px" }}
      onContextMenu={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-gallery-tile]")) return;
        if (target.closest("button, a, input")) return;
        e.preventDefault();
        setCanvasMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isDesktop ? `repeat(${columns}, 1fr)` : "repeat(3, minmax(0, 1fr))",
          gap: isDesktop ? 14 : 6,
        }}
      >
        {nodes.map((n) => {
          const ratio =
            n.image_width && n.image_height && n.image_height > 0
              ? Math.min(Math.max(n.image_width / n.image_height, 0.3), 3.0)
              : 1;

          return (
            <LazyGalleryTile
              key={n.id}
              node={n}
              nodes={nodes}
              ratio={ratio}
              isDesktop={isDesktop}
              onOpen={onOpen}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({ x: e.clientX, y: e.clientY, node: n });
              }}
            />
          );
        })}
      </div>
      <Sentinel />
    </div>
  );
}

export const ImageScreen = GalleryScreen;

/* -------------------------------------------------------------- transfers */

export function TransfersScreen() {
  const t = useL10n();
  const [items, setItems] = useState<Transfer[]>([]);
  useEffect(() => {
    const stop = transfers.subscribe(setItems);
    return () => {
      stop();
    };
  }, []);

  return (
    <div style={{ minHeight: "100dvh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "max(8px, env(safe-area-inset-top)) 16px 8px",
          position: "sticky",
          top: 0,
          background: "var(--bg-primary)",
          zIndex: 60,
        }}
      >
        <h1 className="t-title-lg" style={{ margin: 0, flex: 1 }}>
          Transfers
        </h1>
        {items.some((x) => x.state === "done") && (
          <Tappable onClick={() => transfers.clearFinished()} radius={10} style={{ padding: "8px 12px" }}>
            <span className="t-label-lg" style={{ color: "var(--accent)" }}>
              Clear finished
            </span>
          </Tappable>
        )}
      </header>

      <div style={{ padding: "8px 16px 120px" }}>
        {items.length === 0 ? (
          <EmptyState glyph="transfers" title={t.emptyTransfersTitle} message={t.emptyTransfersBody} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((item) => {
              const pct = item.size ? Math.round((item.sent / item.size) * 100) : 0;
              return (
                <div
                  key={item.id}
                  style={{
                    padding: "14px 16px",
                    background: "var(--bg-elevated)",
                    border: `1px solid ${item.state === "failed" ? "var(--warning)" : "var(--stroke)"}`,
                    borderRadius: "var(--r-card)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Icon
                      glyph={item.state === "failed" ? "alert" : item.state === "done" ? "check" : "upload"}
                      size={18}
                      color={item.state === "failed" ? "var(--warning)" : item.state === "done" ? "var(--accent)" : "var(--fg-secondary)"}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="t-body-lg" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.name}
                      </span>
                      <span className="t-body-sm" style={{ color: "var(--fg-secondary)" }}>
                        {item.state === "failed"
                          ? item.error
                          : item.state === "done"
                            ? bytes(item.size)
                            : `${bytes(item.sent)} of ${bytes(item.size)}`}
                      </span>
                    </span>
                    {item.state === "uploading" && (
                      <span className="t-label-md" style={{ color: "var(--accent)" }}>
                        {pct}%
                      </span>
                    )}
                  </div>
                  {item.state === "uploading" && (
                    <div style={{ height: 4, borderRadius: 999, background: "var(--bg-sunken)", marginTop: 10, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", transition: "width 200ms linear" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
