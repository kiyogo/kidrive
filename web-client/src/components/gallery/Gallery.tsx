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
import type { NodeModel } from "@/lib/models";
import { transfers, type Transfer } from "@/lib/upload";
import { useUploader } from "@/lib/uploads";
import { ShareSheet } from "@/components/share/ShareSheet";

/**
 * The image gallery: strictly photos/images only in one timeline.
 * Calls `/api/v1/nodes?filter=image` and strictly renders images.
 */
export function GalleryScreen({ onOpen }: { onOpen: (n: NodeModel, list?: NodeModel[]) => void }) {
  const t = useL10n();
  const { isDesktop } = useDeviceClass();
  const [nodes, setNodes] = useState<NodeModel[] | null>(null);
  const [error, setError] = useState("");
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

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ nodes: NodeModel[] }>(Api.nodes, {
        filter: "image",
        sort: sortBy,
        order: sortDesc ? "desc" : "asc",
      });
      const imagesOnly = (data?.nodes ?? []).filter((n) => n.mime_type?.startsWith("image/"));
      setNodes(imagesOnly);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errorUnexpectedBody);
    }
  }, [t, sortBy, sortDesc]);

  const upload = useUploader("", () => void load());

  useEffect(() => {
    void load();
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
            {t.gallerySummary({ photos: count, videos: 0 })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isDesktop && (
            <SizeSlider columns={columns} onChanged={setColumns} steps={[3, 4, 5, 6, 8]} />
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
        <div
          style={{ padding: "16px 24px 120px" }}
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
              gridTemplateColumns: isDesktop ? `repeat(${columns}, 1fr)` : "repeat(auto-fill, minmax(170px, 1fr))",
              gap: 14,
            }}
          >
            {nodes.map((n) => {
              const ratio =
                n.image_width && n.image_height && n.image_height > 0
                  ? Math.min(Math.max(n.image_width / n.image_height, 0.3), 3.0)
                  : 1;

              return (
                <Tappable
                  key={n.id}
                  data-gallery-tile={n.id}
                  onClick={() => onOpen(n, nodes)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenu({ x: e.clientX, y: e.clientY, node: n });
                  }}
                  radius={14}
                  style={{
                    display: "block",
                    width: "100%",
                    aspectRatio: `${ratio}`,
                    overflow: "hidden",
                    border: "1px solid var(--stroke)",
                    background: "var(--bg-elevated)",
                    position: "relative",
                  }}
                >
                  {n.has_thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={api.media(Api.thumbnail(n.id))}
                      alt={n.name}
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <span style={{ display: "grid", placeItems: "center", height: "100%" }}>
                      <Icon glyph="image" size={36} color="#4CC6C6" />
                    </span>
                  )}
                </Tappable>
              );
            })}
          </div>
        </div>
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
