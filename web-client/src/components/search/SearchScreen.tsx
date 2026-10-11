"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmptyState, Spinner, Tappable } from "@/components/ui";
import { categoryOfNode, FileTileIcon } from "@/components/files/FileTileIcon";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { bytes, relative } from "@/lib/format";
import { useL10n } from "@/lib/l10n";
import { isFolder, type NodeModel } from "@/lib/models";

/**
 * Omnisearch screen, ported from features/search/pages/search_page.dart.
 *
 * Searches across everything the caller can reach: their own files plus
 * anything shared with them.
 */
export function SearchScreen({
  onBack,
  onOpenFolder,
  onPreview,
}: {
  onBack: () => void;
  onOpenFolder: (node: NodeModel) => void;
  onPreview: (node: NodeModel) => void;
}) {
  const t = useL10n();
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NodeModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search query
  useEffect(() => {
    const trimmed = term.trim();
    const handle = setTimeout(() => {
      setQuery(trimmed);
    }, 280);
    return () => clearTimeout(handle);
  }, [term]);

  // Fetch search results from backend API
  useEffect(() => {
    if (!query) {
      setResults(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    void (async () => {
      try {
        const res = await api.get<{ nodes: NodeModel[] }>(Api.nodes, {
          query,
        });
        if (active) {
          setResults(res.nodes ?? []);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : t.errorUnexpectedBody);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [query, t.errorUnexpectedBody]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "100dvh" }}>
      {/* Header bar matching Flutter SearchPage */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          borderBottom: "1px solid var(--stroke)",
          background: "var(--bg-primary)",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <Tappable onClick={onBack} radius={999} style={{ padding: 8 }} title={t.actionBack}>
          <Icon glyph="chevron-left" size={20} />
        </Tappable>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 14px",
            background: "var(--bg-sunken)",
            border: "1px solid var(--stroke)",
            borderRadius: "var(--r-pill)",
          }}
        >
          <Icon glyph="search" size={18} color="var(--fg-secondary)" />
          <input
            ref={inputRef}
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t.search}
            style={{
              flex: 1,
              background: "transparent",
              border: 0,
              outline: "none",
              color: "var(--fg-primary)",
              fontSize: 15,
            }}
          />
          {term.length > 0 && (
            <Tappable onClick={() => setTerm("")} radius={999} style={{ padding: 4 }} title={t.actionCancel}>
              <Icon glyph="close" size={16} color="var(--fg-secondary)" />
            </Tappable>
          )}
        </div>
      </div>

      {/* Main content body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {!query ? (
          <EmptyState
            glyph="search"
            title={t.search}
            message={t.emptySearchBody}
          />
        ) : loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spinner />
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: 48, color: "var(--warning)" }}>
            {error}
          </div>
        ) : results && results.length === 0 ? (
          <EmptyState
            glyph="search"
            title={t.emptySearchTitle}
            message={t.emptySearchBody}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 640, margin: "0 auto", width: "100%" }}>
            {results?.map((node) => {
              const folder = isFolder(node);
              const category = categoryOfNode(node);

              return (
                <Tappable
                  key={node.id}
                  onClick={() => (folder ? onOpenFolder(node) : onPreview(node))}
                  radius={14}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "9px 10px",
                    margin: "2px 0",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--stroke)",
                    borderRadius: "var(--r-tile)",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: "var(--r-card)",
                      background: "var(--bg-sunken)",
                      border: "1px solid var(--stroke)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "none",
                      overflow: "hidden",
                    }}
                  >
                    <FileTileIcon
                      category={category}
                      size={24}
                      folderColor={node.color}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t-body-md" style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {node.name}
                    </div>
                    <div className="t-body-sm" style={{ color: "var(--fg-secondary)", marginTop: 2 }}>
                      {folder ? "—" : bytes(node.size_bytes)}  ·  {relative(node.updated_at)}
                    </div>
                  </div>
                  {node.starred && <Icon glyph="star-filled" size={16} color="#E8935C" />}
                </Tappable>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
