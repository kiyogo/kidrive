"use client";

import { useEffect, useState } from "react";
import { useL10n } from "@/lib/l10n";
import { Icon } from "@/components/Icon";
import { EmptyState, ErrorState, GridSkeleton, SizeSlider, Tappable, useDeviceClass } from "@/components/ui";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { bytes, relative } from "@/lib/format";
import type { NodeModel } from "@/lib/models";

/**
 * All videos in one place, matching Flutter VideosPage.
 */
export function VideosScreen({ onOpen }: { onOpen: (n: NodeModel, list?: NodeModel[]) => void }) {
  const t = useL10n();
  const { isDesktop } = useDeviceClass();
  const [nodes, setNodes] = useState<NodeModel[] | null>(null);
  const [error, setError] = useState("");
  const [columns, setColumns] = useState(4);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api.get<{ nodes: NodeModel[] }>(Api.nodes, { filter: "video" });
        setNodes(data?.nodes ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : t.errorUnexpectedBody);
      }
    })();
  }, [t.errorUnexpectedBody]);

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
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h1 className="t-title-md" style={{ margin: 0, lineHeight: 1.2 }}>
            {t.videos}
          </h1>
          {nodes && nodes.length > 0 && (
            <span className="t-body-sm" style={{ color: "var(--fg-secondary)", marginTop: 2 }}>
              {t.videosSummary({ count: nodes.length })}
            </span>
          )}
        </div>

        {isDesktop && (
          <SizeSlider columns={columns} onChanged={setColumns} steps={[3, 4, 5]} />
        )}
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
            display: "grid",
            gridTemplateColumns: isDesktop ? `repeat(${columns}, 1fr)` : "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
            padding: "16px 20px 120px",
          }}
        >
          {nodes.map((node) => (
            <Tappable
              key={node.id}
              onClick={() => onOpen(node, nodes)}
              radius={14}
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "16 / 9",
                overflow: "hidden",
                border: "1px solid var(--stroke)",
                background: "var(--bg-elevated)",
                borderRadius: "var(--r-tile)",
              }}
            >
              {/* Video Thumbnail or dark fallback */}
              {node.has_thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={api.media(Api.thumbnail(node.id))}
                  alt={node.name}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "#141424",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
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
                    background: "rgba(0,0,0,0.5)",
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
                  insetInline: 0,
                  background: "rgba(0,0,0,0.65)",
                  padding: "6px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon glyph="play" size={13} color="#FFFFFF" />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "#FFFFFF",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                  title={node.name}
                >
                  {node.name}
                </span>
                {node.size_bytes > 0 && (
                  <span
                    style={{
                      flexShrink: 0,
                      color: "rgba(255,255,255,0.7)",
                      fontSize: 12,
                    }}
                  >
                    {bytes(node.size_bytes)}
                  </span>
                )}
              </div>
            </Tappable>
          ))}
        </div>
      )}
    </div>
  );
}
