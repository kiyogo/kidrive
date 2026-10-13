"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type Glyph } from "@/components/Icon";
import { EmptyState, ErrorState, Spinner, Tappable, useDeviceClass, useToast } from "@/components/ui";
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
  const { isMobile } = useDeviceClass();
  const category = categoryOf(node);

  const [chrome, setChrome] = useState(true);
  const [local, setLocal] = useState<string>("");
  const [starred, setStarred] = useState<boolean>(Boolean(node.starred));
  const [kept, setKept] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Video playback states
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const idleTimer = useRef<NodeJS.Timeout | null>(null);
  const actionScrollRef = useRef<HTMLDivElement | null>(null);

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
      else if (e.key === " " && category === "video") {
        e.preventDefault();
        togglePlay();
      } else if ((e.key === "f" || e.key === "F" || e.key === "F11") && category === "video") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, handlePrev, handleNext, category]);

  // Touch swipe support for gallery
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
    wakeVideoControls();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      void document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  const wakeVideoControls = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setChrome(true);
    if (playing) {
      idleTimer.current = setTimeout(() => {
        setChrome(false);
      }, 1500);
    }
  };

  return (
    <div
      data-theme="dark"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: "none",
        color: "#FFFFFF",
      }}
      onTouchStart={category === "image" ? handleTouchStart : undefined}
      onTouchEnd={category === "image" ? handleTouchEnd : undefined}
      onMouseMove={category === "video" ? wakeVideoControls : undefined}
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
        }}
      >
        <button
          type="button"
          onClick={onClose}
          title={t.actionBack}
          style={{
            width: category === "video" ? 38 : 42,
            height: category === "video" ? 38 : 42,
            borderRadius: "50%",
            background: category === "video" ? "transparent" : "rgba(30, 30, 30, 0.85)",
            border: category === "video" ? "none" : "1px solid rgba(255, 255, 255, 0.15)",
            color: "#FFFFFF",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = category === "video" ? "rgba(255, 255, 255, 0.20)" : "rgba(50, 50, 50, 0.95)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = category === "video" ? "transparent" : "rgba(30, 30, 30, 0.85)";
          }}
        >
          <Icon glyph="chevron-left" size={20} color="#FFFFFF" />
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
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginTop: 2, whiteSpace: "nowrap" }}>
            {category === "image"
              ? t.galleryPositionOf({
                  position: String(currentIndex >= 0 ? currentIndex + 1 : 1),
                  total: String(total),
                })
              : bytes(node.size_bytes)}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {category !== "image" && (
            <a
              href={src}
              download={node.name}
              title={t.download}
              style={{
                width: category === "video" ? 38 : 42,
                height: category === "video" ? 38 : 42,
                borderRadius: "50%",
                background: category === "video" ? "transparent" : "rgba(30, 30, 30, 0.85)",
                border: category === "video" ? "none" : "1px solid rgba(255, 255, 255, 0.15)",
                display: "grid",
                placeItems: "center",
                color: "#FFFFFF",
                textDecoration: "none",
                cursor: "pointer",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = category === "video" ? "rgba(255, 255, 255, 0.20)" : "rgba(50, 50, 50, 0.95)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = category === "video" ? "transparent" : "rgba(30, 30, 30, 0.85)";
              }}
            >
              <Icon glyph="download" size={20} color="#FFFFFF" />
            </a>
          )}

          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              title={t.moreActions}
              style={{
                width: category === "video" ? 38 : 42,
                height: category === "video" ? 38 : 42,
                borderRadius: "50%",
                background: category === "video" ? "transparent" : "rgba(30, 30, 30, 0.85)",
                border: category === "video" ? "none" : "1px solid rgba(255, 255, 255, 0.15)",
                color: "#FFFFFF",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = category === "video" ? "rgba(255, 255, 255, 0.20)" : "rgba(50, 50, 50, 0.95)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = category === "video" ? "transparent" : "rgba(30, 30, 30, 0.85)";
              }}
            >
              <Icon glyph="more" size={20} color="#FFFFFF" />
            </button>

            {menuOpen && (
              <>
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 55,
                    background: "transparent",
                  }}
                  onClick={() => setMenuOpen(false)}
                />
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
                    boxShadow: "none",
                  }}
                >
                  <Tappable
                    radius={10}
                    onClick={() => {
                      void handleToggleStar();
                      setMenuOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      width: "100%",
                      padding: "11px 14px",
                      color: "var(--fg-primary)",
                      boxSizing: "border-box",
                    }}
                  >
                    <Icon glyph={starred ? "star-filled" : "star"} size={19} color={starred ? "#4C8DFF" : "var(--fg-primary)"} />
                    <span className="t-body-lg" style={{ color: "var(--fg-primary)", flex: 1, textAlign: "left", lineHeight: "22px" }}>
                      {t.starred}
                    </span>
                  </Tappable>
                  <Tappable
                    radius={10}
                    onClick={() => {
                      setMenuOpen(false);
                      window.open(src, "_blank");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      width: "100%",
                      padding: "11px 14px",
                      color: "var(--fg-primary)",
                      boxSizing: "border-box",
                    }}
                  >
                    <Icon glyph="download" size={19} color="var(--fg-primary)" />
                    <span className="t-body-lg" style={{ color: "var(--fg-primary)", flex: 1, textAlign: "left", lineHeight: "22px" }}>
                      {t.download}
                    </span>
                  </Tappable>
                  <Tappable
                    radius={10}
                    onClick={() => {
                      void handleShare();
                      setMenuOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      width: "100%",
                      padding: "11px 14px",
                      color: "var(--fg-primary)",
                      boxSizing: "border-box",
                    }}
                  >
                    <Icon glyph="share" size={19} color="var(--fg-primary)" />
                    <span className="t-body-lg" style={{ color: "var(--fg-primary)", flex: 1, textAlign: "left", lineHeight: "22px" }}>
                      {t.actionShare}
                    </span>
                  </Tappable>
                  <Tappable
                    radius={10}
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
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      width: "100%",
                      padding: "11px 14px",
                      color: "var(--warning)",
                      boxSizing: "border-box",
                    }}
                  >
                    <Icon glyph="trash" size={19} color="var(--warning)" />
                    <span className="t-body-lg" style={{ color: "var(--warning)", flex: 1, textAlign: "left", lineHeight: "22px" }}>
                      {t.trash}
                    </span>
                  </Tappable>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ----------------- MEDIA CANVAS ----------------- */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: "#000000",
        }}
      >
        {unreachable ? (
          <EmptyState glyph="offline" title={node.name} message={t.offlineNeedsConnection} />
        ) : category === "image" ? (
          <InteractiveImage
            src={src}
            alt={node.name}
            onTap={() => {
              setMenuOpen(false);
              setChrome((c) => !c);
            }}
          />
        ) : category === "video" ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#000000",
            }}
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
          >
            <video
              ref={videoRef}
              src={src}
              playsInline
              autoPlay
              onPlay={() => {
                setPlaying(true);
                wakeVideoControls();
              }}
              onPause={() => {
                setPlaying(false);
                wakeVideoControls();
              }}
              style={{
                width: "100%",
                height: "100%",
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
              }}
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
              <Icon glyph="music" size={36} color="#4CC6C6" />
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

        {/* Previous / Next Desktop Controls (only for photo gallery matching Flutter) */}
        {category === "image" && !isMobile && nodes && currentIndex > 0 && (
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
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "rgba(30, 30, 30, 0.85)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#FFFFFF",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              opacity: chrome ? 1 : 0,
              pointerEvents: chrome ? "auto" : "none",
              zIndex: 40,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(50, 50, 50, 0.95)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(30, 30, 30, 0.85)";
            }}
          >
            <Icon glyph="chevron-left" size={20} color="#FFFFFF" />
          </button>
        )}

        {category === "image" && !isMobile && nodes && currentIndex < total - 1 && (
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
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "rgba(30, 30, 30, 0.85)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#FFFFFF",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              opacity: chrome ? 1 : 0,
              pointerEvents: chrome ? "auto" : "none",
              zIndex: 40,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(50, 50, 50, 0.95)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(30, 30, 30, 0.85)";
            }}
          >
            <Icon glyph="chevron-right" size={20} color="#FFFFFF" />
          </button>
        )}
      </div>

      {/* ----------------- BOTTOM SCRIM (PHOTO / MEDIA) ----------------- */}
      {category === "video" ? (
        <VideoScrubberBar
          videoRef={videoRef}
          playing={playing}
          onTogglePlay={togglePlay}
          onToggleFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
          chrome={chrome}
          wakeControls={wakeVideoControls}
        />
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
            padding: "14px 20px max(10px, env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            opacity: chrome ? 1 : 0,
            pointerEvents: chrome ? "auto" : "none",
            transition: "opacity 0.2s ease",
          }}
        >
          {/* Capture Date timestamp matching Flutter LdFormat */}
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", marginBottom: 12 }}>
            {node.taken_at
              ? dateTime(node.taken_at)
              : node.created_at
              ? dateTime(node.created_at)
              : bytes(node.size_bytes)}
          </div>

          {/* Horizontally touch/mouse scrollable action row matching Flutter SingleChildScrollView */}
          <ActionRow
            actionScrollRef={actionScrollRef}
            src={src}
            node={node}
            kept={kept}
            starred={starred}
            t={t}
            handleShare={handleShare}
            handleToggleOffline={handleToggleOffline}
            handleToggleStar={handleToggleStar}
          />
        </div>
      )}
    </div>
  );
}

function VideoScrubberBar({
  videoRef,
  playing,
  onTogglePlay,
  onToggleFullscreen,
  isFullscreen,
  chrome,
  wakeControls,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playing: boolean;
  onTogglePlay: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  chrome: boolean;
  wakeControls: () => void;
}) {
  const t = useL10n();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const playedBarRef = useRef<HTMLDivElement | null>(null);
  const bufferBarRef = useRef<HTMLDivElement | null>(null);
  const hoverBarRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const elapsedRef = useRef<HTMLSpanElement | null>(null);
  const totalRef = useRef<HTMLSpanElement | null>(null);
  const leftRef = useRef<HTMLSpanElement | null>(null);

  const [active, setActive] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const isDraggingRef = useRef(false);

  // 60 FPS smooth animation loop matching YouTube and Flutter MediaScrubber
  useEffect(() => {
    let animId: number;
    const loop = () => {
      const v = videoRef.current;
      if (v && !v.paused && !isDraggingRef.current) {
        const cur = v.currentTime || 0;
        const dur = v.duration || 0;
        const pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
        if (playedBarRef.current) playedBarRef.current.style.width = `${pct}%`;
        if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
        if (elapsedRef.current) elapsedRef.current.textContent = formatClock(cur);
        if (totalRef.current) totalRef.current.textContent = `  /  ${formatClock(dur)}`;
        if (leftRef.current) leftRef.current.textContent = `-${formatClock(Math.max(0, dur - cur))}`;
        if (v.buffered.length > 0 && bufferBarRef.current && dur > 0) {
          const bufEnd = v.buffered.end(v.buffered.length - 1);
          bufferBarRef.current.style.width = `${Math.min(100, (bufEnd / dur) * 100)}%`;
        }
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [videoRef]);

  // Sync static values on metadata loaded or pause
  const syncStatic = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const cur = v.currentTime || 0;
    const dur = v.duration || 0;
    const pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
    if (playedBarRef.current) playedBarRef.current.style.width = `${pct}%`;
    if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
    if (elapsedRef.current) elapsedRef.current.textContent = formatClock(cur);
    if (totalRef.current) totalRef.current.textContent = `  /  ${formatClock(dur)}`;
    if (leftRef.current) leftRef.current.textContent = `-${formatClock(Math.max(0, dur - cur))}`;
    if (v.buffered.length > 0 && bufferBarRef.current && dur > 0) {
      const bufEnd = v.buffered.end(v.buffered.length - 1);
      bufferBarRef.current.style.width = `${Math.min(100, (bufEnd / dur) * 100)}%`;
    }
  }, [videoRef]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => syncStatic();
    const onPause = () => syncStatic();
    const onProgress = () => {
      if (v.buffered.length > 0 && bufferBarRef.current && v.duration > 0) {
        const bufEnd = v.buffered.end(v.buffered.length - 1);
        bufferBarRef.current.style.width = `${Math.min(100, (bufEnd / v.duration) * 100)}%`;
      }
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", onMeta);
    v.addEventListener("pause", onPause);
    v.addEventListener("progress", onProgress);
    syncStatic();
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", onMeta);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("progress", onProgress);
    };
  }, [videoRef, syncStatic]);

  const seek = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      const v = videoRef.current;
      if (!el || !v || !v.duration) return;
      const rect = el.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetTime = fraction * v.duration;
      v.currentTime = targetTime;
      const pct = fraction * 100;
      if (playedBarRef.current) playedBarRef.current.style.width = `${pct}%`;
      if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
      if (elapsedRef.current) elapsedRef.current.textContent = formatClock(targetTime);
      if (leftRef.current) leftRef.current.textContent = `-${formatClock(Math.max(0, v.duration - targetTime))}`;
    },
    [videoRef],
  );

  const updateHover = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el || !hoverBarRef.current) return;
    const rect = el.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    hoverBarRef.current.style.width = `${fraction * 100}%`;
  }, []);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        background: "linear-gradient(to top, rgba(0,0,0,0.90) 0%, transparent 100%)",
        padding: "28px 16px max(16px, env(safe-area-inset-bottom))",
        opacity: chrome ? 1 : 0,
        pointerEvents: chrome ? "auto" : "none",
        transition: "opacity 0.2s ease",
      }}
    >
      {/* Scrubber slider matching Flutter MediaScrubber and YouTube */}
      <div
        ref={trackRef}
        style={{
          position: "relative",
          height: 24,
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          touchAction: "none",
        }}
        onPointerEnter={(e) => {
          setActive(true);
          updateHover(e.clientX);
        }}
        onPointerLeave={() => {
          if (!isDraggingRef.current) {
            setActive(false);
            if (hoverBarRef.current) hoverBarRef.current.style.width = "0%";
          }
        }}
        onPointerMove={(e) => {
          wakeControls();
          updateHover(e.clientX);
          if (isDraggingRef.current) {
            seek(e.clientX);
          }
        }}
        onPointerDown={(e) => {
          wakeControls();
          e.currentTarget.setPointerCapture(e.pointerId);
          isDraggingRef.current = true;
          setIsScrubbing(true);
          seek(e.clientX);
        }}
        onPointerUp={(e) => {
          if (isDraggingRef.current) {
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {}
            isDraggingRef.current = false;
            setIsScrubbing(false);
            seek(e.clientX);
          }
        }}
      >
        {/* Background track */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: active || isScrubbing ? 6 : 3.5,
            background: "rgba(255,255,255,0.25)",
            borderRadius: 3,
            transition: "height 0.15s ease",
          }}
        />
        {/* Buffer track */}
        <div
          ref={bufferBarRef}
          style={{
            position: "absolute",
            left: 0,
            width: "0%",
            height: active || isScrubbing ? 6 : 3.5,
            background: "rgba(255,255,255,0.45)",
            borderRadius: 3,
            transition: "height 0.15s ease",
          }}
        />
        {/* Hover ghost track (YouTube parity) */}
        <div
          ref={hoverBarRef}
          style={{
            position: "absolute",
            left: 0,
            width: "0%",
            height: active || isScrubbing ? 6 : 3.5,
            background: "rgba(255,255,255,0.22)",
            borderRadius: 3,
            transition: "height 0.15s ease",
          }}
        />
        {/* Played track */}
        <div
          ref={playedBarRef}
          style={{
            position: "absolute",
            left: 0,
            width: "0%",
            height: active || isScrubbing ? 6 : 3.5,
            background: "#4C8DFF",
            borderRadius: 3,
            transition: "height 0.15s ease",
          }}
        />
        {/* Scrubber thumb */}
        <div
          ref={thumbRef}
          style={{
            position: "absolute",
            left: "0%",
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#4C8DFF",
            transform: `translateX(-50%) scale(${active || isScrubbing ? 1 : 0})`,
            transition: "transform 0.14s ease",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Controls Bar matching Flutter _Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
        <button
          type="button"
          onClick={onTogglePlay}
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
          <Icon glyph={playing ? "pause" : "play"} size={20} color="#FFFFFF" />
        </button>

        {/* Elapsed / Total time matching Flutter exactly */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span ref={elapsedRef} style={{ fontSize: 13, fontWeight: 600, color: "#FFFFFF" }}>
            0:00
          </span>
          <span ref={totalRef} style={{ fontSize: 13, fontWeight: 500, color: "#FFFFFF" }}>
            {"  /  0:00"}
          </span>
        </div>

        <span style={{ flex: 1 }} />

        {/* Time left matching Flutter exactly */}
        <span ref={leftRef} style={{ fontSize: 13, fontWeight: 600, color: "#FFFFFF" }}>
          -0:00
        </span>

        {/* Volume control */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={() => {
              if (videoRef.current) {
                const next = !muted;
                setMuted(next);
                videoRef.current.muted = next;
              }
            }}
            title={muted ? t.actionUnmute : t.actionMute}
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
            <Icon glyph={muted ? "volume-off" : "volume"} size={20} color="#FFFFFF" />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const val = Number(e.target.value);
              setVolume(val);
              setMuted(val === 0);
              if (videoRef.current) {
                videoRef.current.volume = val / 100;
                videoRef.current.muted = val === 0;
              }
            }}
            style={{
              width: 60,
              height: 4,
              accentColor: "#4C8DFF",
              cursor: "pointer",
            }}
          />
        </div>

        {/* Fullscreen button */}
        <button
          type="button"
          onClick={onToggleFullscreen}
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
          <Icon glyph={isFullscreen ? "fullscreenExit" : "fullscreen"} size={20} color="#FFFFFF" />
        </button>
      </div>
    </div>
  );
}

function ActionRow({
  actionScrollRef,
  src,
  node,
  kept,
  starred,
  t,
  handleShare,
  handleToggleOffline,
  handleToggleStar,
}: {
  actionScrollRef: React.RefObject<HTMLDivElement | null>;
  src: string;
  node: NodeModel;
  kept: boolean;
  starred: boolean;
  t: ReturnType<typeof useL10n>;
  handleShare: () => void;
  handleToggleOffline: () => void;
  handleToggleStar: () => void;
}) {
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollStart = useRef(0);
  const didDrag = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") {
      isDragging.current = true;
      didDrag.current = false;
      startX.current = e.clientX;
      scrollStart.current = actionScrollRef.current?.scrollLeft || 0;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging.current && actionScrollRef.current) {
      const dx = e.clientX - startX.current;
      if (Math.abs(dx) > 3) didDrag.current = true;
      actionScrollRef.current.scrollLeft = scrollStart.current - dx;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging.current) {
      isDragging.current = false;
      try {
        const el = e.currentTarget as HTMLElement;
        if (el?.hasPointerCapture?.(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      } catch {}
    }
  };

  return (
    <div
      ref={actionScrollRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        width: "100%",
        maxWidth: 480,
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
        touchAction: "pan-x",
        cursor: "grab",
        userSelect: "none",
      }}
    >
      <div
        style={{
          minWidth: "100%",
          width: "max-content",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-evenly",
          gap: 8,
          padding: "0 12px",
        }}
      >
        <ActionButton
          glyph="shared"
          label={t.actionShare}
          onClick={() => {
            if (!didDrag.current) handleShare();
          }}
        />
        <ActionButton
          glyph="download"
          label={t.download}
          onClick={() => {
            if (!didDrag.current) {
              const a = document.createElement("a");
              a.href = src;
              a.download = node.name;
              a.click();
            }
          }}
        />
        <ActionButton
          glyph={starred ? "star-filled" : "star"}
          label={t.starred}
          active={starred}
          onClick={() => {
            if (!didDrag.current) handleToggleStar();
          }}
        />
      </div>
    </div>
  );
}

/**
 * Interactive image viewer supporting pinch zoom, double-tap zoom, wheel zoom towards cursor,
 * and pan matching Flutter's PhotoViewGallery / ZoomOnScroll.
 */
function InteractiveImage({
  src,
  alt,
  onTap,
}: {
  src: string;
  alt: string;
  onTap: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Pointer/touch tracking refs
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const didMove = useRef(false);

  // Multi-touch pinch tracking
  const pinchStartDist = useRef(0);
  const pinchStartScale = useRef(1);
  const isPinching = useRef(false);

  // Tap tracking for single vs double tap
  const lastTapTime = useRef(0);
  const lastTapPos = useRef({ x: 0, y: 0 });
  const singleTapTimer = useRef<NodeJS.Timeout | null>(null);

  // Reset zoom when image src changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [src]);

  // Clean up single tap timer on unmount
  useEffect(() => {
    return () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, []);

  // Mouse wheel zoom towards mouse position (matching Flutter's ZoomOnScroll)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const factor = e.deltaY > 0 ? 0.88 : 1 / 0.88;
    setScale((prevScale) => {
      const nextScale = Math.min(Math.max(1, prevScale * factor), 8);
      if (nextScale === 1) {
        setPosition({ x: 0, y: 0 });
        return 1;
      }
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;
        setPosition((prevPos) => ({
          x: mouseX - (mouseX - prevPos.x) * (nextScale / prevScale),
          y: mouseY - (mouseY - prevPos.y) * (nextScale / prevScale),
        }));
      }
      return nextScale;
    });
  };

  // Perform double-tap or double-click zoom toggle
  const triggerZoomAt = (clientX: number, clientY: number) => {
    if (scale > 1.05) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      const rect = containerRef.current?.getBoundingClientRect();
      const targetScale = 2.5;
      if (!rect) {
        setScale(targetScale);
        return;
      }
      const clickX = clientX - rect.left - rect.width / 2;
      const clickY = clientY - rect.top - rect.height / 2;
      setScale(targetScale);
      setPosition({
        x: -clickX * (targetScale - 1),
        y: -clickY * (targetScale - 1),
      });
    }
  };

  // Double click for mouse users
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    triggerZoomAt(e.clientX, e.clientY);
  };

  // Touch handlers for mobile pinch & tap
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      isPinching.current = true;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      pinchStartDist.current = dist;
      pinchStartScale.current = scale;
    } else if (e.touches.length === 1) {
      isPinching.current = false;
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      startPos.current = { ...position };
      didMove.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && isPinching.current && pinchStartDist.current > 0) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const ratio = dist / pinchStartDist.current;
      const newScale = Math.min(Math.max(0.5, pinchStartScale.current * ratio), 8);
      setScale(newScale);
      didMove.current = true;
    } else if (e.touches.length === 1 && scale > 1) {
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;
      if (Math.hypot(dx, dy) > 5) {
        didMove.current = true;
      }
      setPosition({
        x: startPos.current.x + dx,
        y: startPos.current.y + dy,
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isPinching.current && e.touches.length < 2) {
      isPinching.current = false;
      if (scale < 1) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
      return;
    }

    if (e.changedTouches.length === 1 && !didMove.current) {
      const touch = e.changedTouches[0];
      const now = Date.now();
      const dist = Math.hypot(
        touch.clientX - lastTapPos.current.x,
        touch.clientY - lastTapPos.current.y,
      );

      if (now - lastTapTime.current < 280 && dist < 30) {
        // Double tap!
        if (singleTapTimer.current) {
          clearTimeout(singleTapTimer.current);
          singleTapTimer.current = null;
        }
        lastTapTime.current = 0;
        triggerZoomAt(touch.clientX, touch.clientY);
      } else {
        // First tap: delay to see if a second tap comes
        lastTapTime.current = now;
        lastTapPos.current = { x: touch.clientX, y: touch.clientY };
        if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
        singleTapTimer.current = setTimeout(() => {
          onTap();
        }, 260);
      }
    }
  };

  // Mouse pointer pan/drag when zoomed
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" || scale <= 1) return;
    e.stopPropagation();
    isDragging.current = true;
    didMove.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    startPos.current = { ...position };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.hypot(dx, dy) > 3) {
      didMove.current = true;
    }
    setPosition({
      x: startPos.current.x + dx,
      y: startPos.current.y + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging.current) {
      isDragging.current = false;
      try {
        const el = e.currentTarget as HTMLElement;
        if (el?.hasPointerCapture?.(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      } catch {}
    }
  };

  const handleMouseClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (didMove.current) return;
    if (e.detail <= 1) {
      onTap();
    }
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleMouseClick}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        cursor: scale > 1 ? (isDragging.current ? "grabbing" : "grab") : "default",
        touchAction: "none",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
          transition: isDragging.current || isPinching.current ? "none" : "transform 0.15s ease-out",
          userSelect: "none",
          pointerEvents: "auto",
        }}
      />
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
      <span style={{ fontSize: 11.5, fontWeight: 500, color: active ? "#4C8DFF" : "#FFFFFF", whiteSpace: "nowrap" }}>
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
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  textAlign: "start",
  whiteSpace: "nowrap",
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
