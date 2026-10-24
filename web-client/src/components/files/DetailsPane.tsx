"use client";

import React, { Component, type ReactNode, useEffect, useRef, useState } from "react";
import { Icon, type Glyph } from "@/components/Icon";
import { Button, Dialog, Tappable, TextField, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { bytes, dateTime, relative } from "@/lib/format";
import { useL10n } from "@/lib/l10n";
import { categoryOf, isFolder, type NodeModel } from "@/lib/models";
import { colorForCategory, folderSwatches } from "@/lib/tokens";
import { forget, isKept, keep } from "@/lib/offline";
import { FileTileIcon, categoryOfNode } from "./FileTileIcon";

export class DetailsErrorBoundary extends Component<
  { children: ReactNode; onClose?: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onClose?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("DetailsPane render error:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <aside
          role="region"
          style={{
            position: "fixed",
            insetInlineEnd: 0,
            top: 0,
            bottom: 0,
            width: "var(--detail-pane)",
            maxWidth: "100vw",
            background: "var(--bg-primary)",
            borderInlineStart: "1px solid var(--stroke)",
            zIndex: 120,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: 16,
            boxSizing: "border-box",
          }}
        >
          <span className="t-body-md" style={{ color: "var(--fg-secondary)", textAlign: "center" }}>
            Không thể hiển thị xem trước tệp này
          </span>
          <Button
            label="Đóng"
            variant="quiet"
            compact
            expand={false}
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onClose?.();
            }}
          />
        </aside>
      );
    }
    return this.props.children;
  }
}

/**
 * The details pane, ported from features/files/widgets/desktop/node_details_pane.
 *
 * Opens only when explicitly requested via context menu "Xem trước",
 * stays open while selecting other files, and closes only via the close button.
 */
export function DetailsPane({
  node,
  onClose,
  onOpen,
  onChanged,
  onShare,
}: {
  node: NodeModel;
  onClose: () => void;
  onOpen: (n: NodeModel) => void;
  onChanged: () => void;
  onShare: (n: NodeModel) => void;
}) {
  const t = useL10n();
  const toast = useToast();
  const asideRef = useRef<HTMLElement | null>(null);

  if (!node) return null;

  const category = categoryOf(node);
  const tone = colorForCategory(category);
  const [versions, setVersions] = useState<{ id: string; size_bytes: number; created_at: number }[]>([]);
  const [kept, setKept] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(node.name || "");
  const [colorOpen, setColorOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (node?.id) setKept(isKept(node.id));
  }, [node?.id]);

  useEffect(() => {
    if (node?.name) setRenameName(node.name);
  }, [node?.name]);

  // Always reset scroll inside DetailsPane to top when active node changes
  useEffect(() => {
    if (asideRef.current) {
      asideRef.current.scrollTop = 0;
    }
  }, [node?.id]);

  // versions are a file's own history, so a folder has none to ask about
  useEffect(() => {
    if (!node || isFolder(node)) {
      setVersions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<{ versions?: typeof versions }>(Api.versions(node.id));
        if (!cancelled) setVersions(data?.versions ?? []);
      } catch {
        if (!cancelled) setVersions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [node?.id]);

  return (
    <aside
      ref={asideRef}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      className="ld-enter menu"
      role="region"
      style={{
        position: "fixed",
        insetInlineEnd: 0,
        top: 0,
        bottom: 0,
        width: "var(--detail-pane)",
        maxWidth: "100vw",
        background: "var(--bg-primary)",
        borderInlineStart: "1px solid var(--stroke)",
        zIndex: 120,
        overflowY: "auto",
        padding: 20,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, minWidth: 0, width: "100%" }}>
        <h2
          className="t-title-sm"
          style={{
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: "24px",
            color: "var(--fg-primary)",
            margin: 0,
            display: "block",
          }}
          title={node.name}
        >
          {node.name}
        </h2>
        <Tappable
          onClick={onClose}
          radius={999}
          style={{ padding: 6, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          title={t.actionCancel}
        >
          <Icon glyph="close" size={18} />
        </Tappable>
      </div>

      <div
        style={{
          position: "relative",
          aspectRatio: "4 / 3",
          borderRadius: "var(--r-tile)",
          border: "1px solid var(--stroke)",
          background: "var(--bg-elevated)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          marginBottom: 18,
        }}
      >
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FileTileIcon category={categoryOfNode(node)} size={54} folderColor={node.color} />
        </div>
        {node.has_thumbnail || category === "image" || category === "video" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={node.id}
            src={api.media(Api.thumbnail(node.id))}
            alt=""
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}
      </div>

      <Facts node={node} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 18 }}>
        <Action glyph="eye" label={t.actionOpen} onClick={() => onOpen(node)} />
        {!isFolder(node) && (
          <Action
            glyph="download"
            label={t.download}
            onClick={() => window.open(api.media(Api.download(node.id)), "_blank")}
          />
        )}
        <Action
          glyph={node.starred ? "star-filled" : "star"}
          label={t.starred}
          onClick={async () => {
            if (node.starred) await api.del(Api.star(node.id));
            else await api.post(Api.star(node.id), {});
            onChanged();
          }}
        />
        <Action glyph="share" label={t.actionShare} onClick={() => onShare(node)} />
        {!isFolder(node) && (
          <Action
            glyph="offline"
            label={kept ? t.offlineRemoveDownload : t.offlineMakeAvailable}
            onClick={async () => {
              try {
                if (kept) {
                  await forget(node.id);
                  setKept(false);
                  toast(t.offlineRemoved({ name: node.name }), "success");
                } else {
                  const ok = await keep(node.id, node.name);
                  if (!ok) {
                    toast(t.errorUnexpectedTitle, "error");
                    return;
                  }
                  setKept(true);
                  toast(t.offlineQueued({ name: node.name }), "success");
                }
              } catch (e) {
                toast(e instanceof Error ? e.message : t.errorUnexpectedTitle, "error");
              }
            }}
          />
        )}
        <Action
          glyph="rename"
          label={t.actionRename}
          onClick={() => {
            setRenameName(node.name);
            setRenameOpen(true);
          }}
        />
        {isFolder(node) && (
          <Action
            glyph="grid"
            label={t.folderColor}
            onClick={() => setColorOpen(true)}
          />
        )}
        <Action
          glyph="trash"
          label={t.confirmTrashTitle}
          danger
          onClick={async () => {
            await api.del(Api.node(node.id));
            toast(t.confirmTrashTitle, "success");
            onClose();
            onChanged();
          }}
        />
      </div>

      {/* the endpoint returns the versions that came before, so the count on
          the node is what says there is any history at all */}
      {!isFolder(node) && (node.version_count ?? 1) > 1 && versions.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="t-label-md" style={{ color: "var(--fg-secondary)", marginBottom: 10 }}>
            {t.versionHistory}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {versions.map((v) => (
              <div
                key={v.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  border: "1px solid var(--stroke)",
                  borderRadius: "var(--r-chip)",
                  background: "var(--bg-elevated)",
                }}
              >
                <Icon glyph="restore" size={16} color="var(--fg-secondary)" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-body-md" style={{ display: "block" }}>
                    {relative(v.created_at)}
                  </span>
                  <span className="t-body-sm" style={{ color: "var(--fg-secondary)" }}>
                    {bytes(v.size_bytes)}
                  </span>
                </span>
                <Tappable
                  radius={8}
                  style={{ padding: "6px 8px", color: "var(--accent)" }}
                  title={t.restore}
                  onClick={async () => {
                    // restoring keeps the current bytes as a version of their
                    // own, so the move is itself reversible
                    await api.post(Api.restoreVersion(node.id, v.id), {});
                    toast(t.versionRestored, "success");
                    onChanged();
                  }}
                >
                  <span className="t-label-lg">{t.restore}</span>
                </Tappable>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} title={t.actionRename}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!renameName.trim() || renameName.trim() === node.name) {
              setRenameOpen(false);
              return;
            }
            setIsSubmitting(true);
            try {
              await api.patch(Api.node(node.id), { name: renameName.trim() });
              setRenameOpen(false);
              onChanged();
            } catch (err) {
              toast(err instanceof Error ? err.message : t.errorUnexpectedTitle, "error");
            } finally {
              setIsSubmitting(false);
            }
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
            <Button
              label={t.actionCancel}
              variant="quiet"
              expand={false}
              compact
              onClick={() => setRenameOpen(false)}
            />
            <Button
              label={t.actionSave}
              variant="primary"
              expand={false}
              compact
              busy={isSubmitting}
              type="submit"
            />
          </div>
        </form>
      </Dialog>

      {/* Folder color picker dialog */}
      <Dialog
        open={colorOpen}
        onClose={() => setColorOpen(false)}
        title={t.folderColor}
      >
        <div style={{ marginBottom: 16 }}>
          <div className="t-body-sm" style={{ color: "var(--fg-secondary)" }}>
            {node.name}
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
            const isSelected = (node.color || "neutral") === key;
            return (
              <Tappable
                key={key}
                onClick={async () => {
                  setColorOpen(false);
                  try {
                    await api.patch(Api.node(node.id), { color: key });
                    onChanged();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : t.errorUnexpectedTitle, "error");
                  }
                }}
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
      </Dialog>
    </aside>
  );
}

function Facts({ node }: { node: NodeModel }) {
  const t = useL10n();
  if (!node) return null;

  const safeName = node.name || "";
  const safeSize = isFolder(node) ? "—" : bytes(node.size_bytes || 0);
  const safeModified = node.updated_at ? relative(node.updated_at) : "—";
  const safeAdded = node.created_at ? dateTime(node.created_at) : "—";

  const rows: [string, string][] = [
    [t.sortName, safeName],
    [t.sortSize, safeSize],
    [t.gallerySortModified, safeModified],
    [t.gallerySortAdded, safeAdded],
  ];
  if (node.image_width && node.image_height) {
    rows.splice(2, 0, ["", `${node.image_width} × ${node.image_height}`]);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map(([k, v], i) => {
        const isName = k === t.sortName;
        return (
          <div key={i} style={{ display: "flex", alignItems: isName ? "flex-start" : "center", gap: 12 }}>
            <span
              className="t-body-sm"
              style={{
                color: "var(--fg-muted)",
                width: 104,
                minWidth: 104,
                flexShrink: 0,
                whiteSpace: "nowrap",
                lineHeight: "20px",
              }}
            >
              {k}
            </span>
            <span
              className="t-body-md"
              style={{
                flex: 1,
                minWidth: 0,
                lineHeight: "20px",
                color: "var(--fg-primary)",
                ...(isName
                  ? {
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      maxHeight: "40px",
                    }
                  : {
                      overflowWrap: "anywhere",
                    }),
              }}
              title={v}
            >
              {v}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Action({
  glyph,
  label,
  onClick,
  danger,
}: {
  glyph: Glyph;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const itemColor = danger ? "var(--warning)" : "var(--fg-primary)";
  return (
    <Tappable
      onClick={onClick}
      radius={10}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        height: 44,
        minHeight: 44,
        padding: "0 12px",
        color: itemColor,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon glyph={glyph} size={18} color={danger ? "var(--warning)" : "var(--fg-secondary)"} />
      </div>
      <span
        className="t-body-md"
        style={{
          flex: 1,
          minWidth: 0,
          fontWeight: 500,
          color: itemColor,
          textAlign: "left",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          lineHeight: "44px",
        }}
      >
        {label}
      </span>
      <div
        style={{
          width: 16,
          height: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon glyph="chevron-right" size={14} color="var(--fg-muted)" />
      </div>
    </Tappable>
  );
}

