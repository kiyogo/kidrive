"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type Glyph } from "@/components/Icon";
import { EmptyState, ErrorState, Spinner, Tappable, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { bytes, dateTime } from "@/lib/format";
import { useL10n } from "@/lib/l10n";
import { categoryOf, isFolder, type NodeModel } from "@/lib/models";
import { forget, isKept, keep, readKept } from "@/lib/offline";

/**
 * Immersive full-screen media viewer matching Flutter's PhotoViewerPage and VideoView.
 * Strict flat aesthetic: no drop shadows, 1px borders, smooth scrim transitions.
 */
export function Preview({
  node,
  nodes,
  onClose,
  onNavigate,
}: {
  node: NodeModel;
  nodes?: NodeModel[];
  onClose: () => void;
  onNavigate?: (n: NodeModel) => void;
}) {
  const t = useL10n();
  const toast = useToast();
  const category = categoryOf(node);

  const [chrome, setChrome] = useState(true);
  const [local, setLocal] = useState<string>("");
  const [starred, setStarred] = useState<boolean>(Boolean(node.starred));
  const [kept, setKept] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Video playback states
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const currentIndex = nodes ? nodes.findIndex((n) => n.id === node.id) : -1;
  const total = nodes ? nodes.length : 1;

  useEffect(() => {
    setStarred(Boolean(node.starred));
    setKept(isKept(node.id));
  }, [node]);

  // Load offline blob if available
  useEffect(() => {
    let url = "";
    void (async () => {
      const blob = await readKept(node.id);
      if (blob) {
        url = URL.createObjectURL(blob);
        setLocal(url);
      } else {
        setLocal("");
      }
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [node.id]);

  const src = local || api.media(Api.download(node.id));
  const isMarkdown = /\.(md|markdown)$/i.test(node.name);
  const textual = category === "code" || category === "document" || isTextual(node.mime_type);
  const online = useOnline();
  const unreachable = !online && !local;

  const handlePrev = useCallback(() => {
    if (nodes && currentIndex > 0 && onNavigate) {
      onNavigate(nodes[currentIndex - 1]);
    }
  }, [nodes, currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (nodes && currentIndex >= 0 && currentIndex < nodes.length - 1 && onNavigate) {
      onNavigate(nodes[currentIndex + 1]);
    }
  }, [nodes, currentIndex, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") handlePrev();
      else if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, handlePrev, handleNext]);

  // Touch swipe support
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (diff > 50) handlePrev();
    else if (diff < -50) handleNext();
    touchStartX.current = null;
  };

  const handleToggleStar = async () => {
    try {
      const next = !starred;
      setStarred(next);
      if (next) await api.post(Api.star(node.id), {});
      else await api.del(Api.star(node.id));
      toast(next ? t.starred : t.actionDone, "success");
    } catch {
      setStarred(!starred);
    }
  };

  const handleToggleOffline = async () => {
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
  };

  const handleShare = async () => {
    try {
      const shareUrl = window.location.origin + `/preview/${node.id}`;
      if (navigator.share) {
        await navigator.share({ title: node.name, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast(t.actionCopied, "success");
      }
    } catch {
      /* canceled */
    }
  };

  // Video controls helpers
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      void videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      void document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: "none",
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ----------------- TOP SCRIM ----------------- */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          padding: "max(12px, env(safe-area-inset-top)) 16px 24px",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          opacity: chrome ? 1 : 0,
          pointerEvents: chrome ? "auto" : "none",
          transition: "opacity 0.2s ease",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          title={t.actionBack}
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            border: "none",
            color: "#FFFFFF",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Icon glyph="chevron-left" size={22} color="#FFFFFF" />
        </button>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#FFFFFF",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {node.name}
          </span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginTop: 2 }}>
            {nodes && total > 1
              ? `${currentIndex + 1} trên ${total}`
              : bytes(node.size_bytes)}
          </span>
        </div>

        <a
          href={src}
          download={node.name}
          title={t.download}
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            display: "grid",
            placeItems: "center",
            color: "#FFFFFF",
            textDecoration: "none",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Icon glyph="download" size={20} color="#FFFFFF" />
        </a>

        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title={t.moreActions}
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              border: "none",
              color: "#FFFFFF",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Icon glyph="more" size={20} color="#FFFFFF" />
          </button>

          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                top: 50,
                right: 0,
                width: 220,
                background: "var(--bg-elevated)",
                border: "1px solid var(--stroke)",
                borderRadius: 14,
                padding: "6px 0",
                zIndex: 60,
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  void handleToggleStar();
                  setMenuOpen(false);
                }}
                style={menuItemStyle}
              >
                <Icon glyph={starred ? "star-filled" : "star"} size={18} color={starred ? "#E8935C" : "currentColor"} />
                <span>{t.starred}</span>
              </button>
              <a
                href={src}
                download={node.name}
                onClick={() => setMenuOpen(false)}
                style={{ ...menuItemStyle, textDecoration: "none" }}
              >
                <Icon glyph="download" size={18} />
                <span>{t.download}</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  void handleShare();
                  setMenuOpen(false);
                }}
                style={menuItemStyle}
              >
                <Icon glyph="share" size={18} />
                <span>{t.actionShare}</span>
              </button>
              <div style={{ height: 1, background: "var(--stroke)", margin: "4px 0" }} />
              <button
                type="button"
                onClick={async () => {
                  setMenuOpen(false);
                  try {
                    await api.del(Api.node(node.id));
                    toast(t.confirmTrashTitle, "success");
                    onClose();
                  } catch (e) {
                    toast(e instanceof Error ? e.message : t.errorUnexpectedTitle, "error");
                  }
                }}
                style={{ ...menuItemStyle, color: "var(--warning)" }}
              >
                <Icon glyph="trash" size={18} color="var(--warning)" />
                <span>{t.trash}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ----------------- MEDIA CANVAS ----------------- */}
      <div
        onClick={() => {
          setMenuOpen(false);
          setChrome((c) => !c);
        }}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          cursor: "pointer",
        }}
      >
        {unreachable ? (
          <EmptyState glyph="offline" title={node.name} message={t.offlineNeedsConnection} />
        ) : category === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={node.name}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display: "block",
            }}
          />
        ) : category === "video" ? (
          <div
            style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
          >
            <video
              ref={videoRef}
              src={src}
              playsInline
              autoPlay
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={() => {
                if (videoRef.current) {
                  setCurrentTime(videoRef.current.currentTime);
                  setDuration(videoRef.current.duration || 0);
                  if (videoRef.current.buffered.length > 0) {
                    setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
                  }
                }
              }}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          </div>
        ) : category === "audio" ? (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 480, padding: 24, textAlign: "center" }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "rgba(76, 198, 198, 0.16)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 16px",
              }}
            >
              <Icon glyph="audio" size={36} color="#4CC6C6" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 20 }}>
              {node.name}
            </div>
            <audio src={src} controls autoPlay style={{ width: "100%" }} />
          </div>
        ) : category === "pdf" ? (
          <iframe
            src={src}
            title={node.name}
            style={{ width: "100%", height: "100%", border: 0 }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : textual ? (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              height: "100%",
              maxWidth: 960,
              padding: "80px 24px",
              overflowY: "auto",
            }}
          >
            <TextView node={node} markdown={isMarkdown} lineNumbers={category === "code"} />
          </div>
        ) : (
          <EmptyState
            glyph="file"
            title={t.previewCannotPreview}
            message={t.previewDownloadToOpen}
            actionLabel={t.download}
            onAction={() => window.open(src, "_blank")}
          />
        )}

        {/* Previous / Next Desktop Controls */}
        {nodes && currentIndex > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            title={t.previewPreviousPage}
            style={{
              position: "absolute",
              left: 16,
              top: "50%",
              transform: "translateY(-50%)",
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.18)",
              border: "none",
              color: "#FFFFFF",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              opacity: chrome ? 1 : 0,
              pointerEvents: chrome ? "auto" : "none",
              transition: "opacity 0.2s ease",
            }}
          >
            <Icon glyph="chevron-left" size={24} color="#FFFFFF" />
          </button>
        )}

        {nodes && currentIndex >= 0 && currentIndex < nodes.length - 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            title={t.previewNextPage}
            style={{
              position: "absolute",
              right: 16,
              top: "50%",
              transform: "translateY(-50%)",
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.18)",
              border: "none",
              color: "#FFFFFF",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              opacity: chrome ? 1 : 0,
              pointerEvents: chrome ? "auto" : "none",
              transition: "opacity 0.2s ease",
            }}
          >
            <Icon glyph="chevron-right" size={24} color="#FFFFFF" />
          </button>
        )}
      </div>

      {/* ----------------- BOTTOM SCRIM (PHOTO / MEDIA) ----------------- */}
      {category === "video" ? (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
            padding: "24px 20px max(16px, env(safe-area-inset-bottom))",
            opacity: chrome ? 1 : 0,
            pointerEvents: chrome ? "auto" : "none",
            transition: "opacity 0.2s ease",
          }}
        >
          {/* Scrubber slider */}
          <div
            style={{ position: "relative", height: 16, display: "flex", alignItems: "center", cursor: "pointer" }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = (e.clientX - rect.left) / rect.width;
              if (videoRef.current && duration > 0) {
                videoRef.current.currentTime = pos * duration;
              }
            }}
          >
            {/* Background track */}
            <div style={{ position: "absolute", left: 0, right: 0, height: 4, background: "rgba(255,255,255,0.25)", borderRadius: 2 }} />
            {/* Buffer track */}
            <div
              style={{
                position: "absolute",
                left: 0,
                width: `${duration ? (buffered / duration) * 100 : 0}%`,
                height: 4,
                background: "rgba(255,255,255,0.45)",
                borderRadius: 2,
              }}
            />
            {/* Played track */}
            <div
              style={{
                position: "absolute",
                left: 0,
                width: `${duration ? (currentTime / duration) * 100 : 0}%`,
                height: 4,
                background: "#4C8DFF",
                borderRadius: 2,
              }}
            />
          </div>

          {/* Controls Bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
            <button
              type="button"
              onClick={togglePlay}
              title={playing ? t.actionPause : t.actionPlay}
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "transparent",
                border: "none",
                color: "#FFFFFF",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <Icon glyph={playing ? "pause" : "play"} size={22} color="#FFFFFF" />
            </button>

            <span style={{ fontSize: 13, fontWeight: 600, color: "#FFFFFF" }}>
              {formatClock(currentTime)}
            </span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
              / {formatClock(duration)}
            </span>

            <span style={{ flex: 1 }} />

            <span style={{ fontSize: 13, fontWeight: 600, color: "#FFFFFF" }}>
              -{formatClock(Math.max(0, duration - currentTime))}
            </span>

            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? t.actionExitFullscreen : t.actionFullscreen}
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "transparent",
                border: "none",
                color: "#FFFFFF",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <Icon glyph="expand" size={18} color="#FFFFFF" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
            padding: "16px 20px max(14px, env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            opacity: chrome ? 1 : 0,
            pointerEvents: chrome ? "auto" : "none",
            transition: "opacity 0.2s ease",
          }}
        >
          {/* Capture Date timestamp */}
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginBottom: 12 }}>
            {node.taken_at
              ? dateTime(node.taken_at)
              : node.created_at
              ? dateTime(node.created_at)
              : bytes(node.size_bytes)}
          </div>

          {/* Horizontally touch/mouse scrollable action row */}
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-around",
              gap: 8,
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              whiteSpace: "nowrap",
              touchAction: "pan-x",
            }}
          >
            <ActionButton
              glyph="share"
              label={t.actionShare}
              onClick={handleShare}
            />
            <ActionButton
              glyph="download"
              label={t.download}
              onClick={() => {
                const a = document.createElement("a");
                a.href = src;
                a.download = node.name;
                a.click();
              }}
            />
            {!isFolder(node) && (
              <ActionButton
                glyph="offline"
                label={kept ? t.offlineRemoveDownload : t.offlineMakeAvailable}
                active={kept}
                onClick={handleToggleOffline}
              />
            )}
            <ActionButton
              glyph={starred ? "star-filled" : "star"}
              label={t.starred}
              active={starred}
              onClick={handleToggleStar}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  glyph,
  label,
  active = false,
  onClick,
}: {
  glyph: Glyph;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: "8px 12px",
        borderRadius: "var(--r-tile)",
        color: active ? "#4C8DFF" : "#FFFFFF",
        flexShrink: 0,
      }}
    >
      <Icon glyph={glyph} size={21} color={active ? "#4C8DFF" : "#FFFFFF"} />
      <span style={{ fontSize: 11, fontWeight: 500, color: active ? "#4C8DFF" : "#FFFFFF" }}>
        {label}
      </span>
    </button>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "10px 16px",
  background: "transparent",
  border: "none",
  color: "var(--fg-primary)",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  textAlign: "start",
};

function formatClock(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

function isTextual(mime: string): boolean {
  const m = (mime || "").toLowerCase();
  return (
    m.startsWith("text/") ||
    m.includes("json") ||
    m.includes("xml") ||
    m.includes("yaml") ||
    m.includes("javascript") ||
    m.includes("typescript") ||
    m.includes("x-sh") ||
    m.includes("x-python") ||
    m.includes("csv")
  );
}

const MAX_PREVIEW_BYTES = 512 * 1024;

function TextView({
  node,
  markdown,
  lineNumbers,
}: {
  node: NodeModel;
  markdown: boolean;
  lineNumbers: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const resp = await fetch(api.media(Api.download(node.id)), {
          headers: { Range: `bytes=0-${MAX_PREVIEW_BYTES}` },
        });
        if (!resp.ok && resp.status !== 206) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const buf = await resp.arrayBuffer();
        if (ignore) return;
        const decoded = new TextDecoder("utf-8", { fatal: false }).decode(buf);
        setText(decoded);
        setTruncated(node.size_bytes > MAX_PREVIEW_BYTES);
      } catch (e) {
        if (!ignore) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [node.id, node.size_bytes]);

  if (error) return <ErrorState message={error} />;
  if (text === null) return <Spinner />;

  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: "var(--font-mono, monospace)",
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--fg-primary)",
        margin: 0,
      }}
    >
      {text}
    </pre>
  );
}
