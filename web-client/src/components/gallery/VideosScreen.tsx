"use client";

import { useEffect, useState } from "react";
import { useL10n } from "@/lib/l10n";
import { Icon } from "@/components/Icon";
import { EmptyState, ErrorState, GridSkeleton, Tappable } from "@/components/ui";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { bytes, relative } from "@/lib/format";
import type { NodeModel } from "@/lib/models";

/**
 * All videos in one place, matching Flutter VideosPage.
 */
export function VideosScreen({ onOpen }: { onOpen: (n: NodeModel) => void }) {
  const t = useL10n();
  const [nodes, setNodes] = useState<NodeModel[] | null>(null);
  const [error, setError] = useState("");

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
          padding: "max(8px, env(safe-area-inset-top)) 16px 8px",
          position: "sticky",
          top: 0,
          background: "var(--bg-primary)",
          zIndex: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1 className="t-title-lg" style={{ margin: 0 }}>
            {t.videos}
          </h1>
          {nodes && nodes.length > 0 && (
            <span className="t-body-sm" style={{ color: "var(--fg-secondary)" }}>
              {t.videosSummary({ count: nodes.length })}
            </span>
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
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
            padding: "12px 16px 120px",
          }}
        >
          {nodes.map((node) => (
            <Tappable
              key={node.id}
              onClick={() => onOpen(node)}
              radius={14}
              style={{
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                border: "1px solid var(--stroke)",
                background: "var(--bg-elevated)",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "16 / 9",
                  background: "var(--bg-sunken)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {node.has_thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={api.media(Api.thumbnail(node.id))}
                    alt={node.name}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <Icon glyph="video" size={32} color="#4CC6C6" />
                )}
                {/* Play button overlay */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0,0,0,0.25)",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      background: "rgba(0,0,0,0.65)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid rgba(255,255,255,0.2)",
                    }}
                  >
                    <Icon glyph="play" size={20} color="#FFFFFF" />
                  </div>
                </div>
              </div>

              <div style={{ padding: "10px 12px" }}>
                <div
                  className="t-body-md"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: 600,
                  }}
                  title={node.name}
                >
                  {node.name}
                </div>
                <div
                  className="t-body-sm"
                  style={{
                    color: "var(--fg-secondary)",
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 4,
                  }}
                >
                  <span>{bytes(node.size_bytes)}</span>
                  <span>{relative(node.updated_at || node.created_at)}</span>
                </div>
              </div>
            </Tappable>
          ))}
        </div>
      )}
    </div>
  );
}
