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
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubberHover, setScrubberHover] = useState(false);
  const idleTimer = useRef<NodeJS.Timeout | null>(null);

  // 60 FPS smooth interpolation loop matching YouTube's exact progress bar behavior
  useEffect(() => {
    let animId: number;
    const loop = () => {
      if (videoRef.current && !videoRef.current.paused && !isScrubbing) {
        setCurrentTime(videoRef.current.currentTime);
        const dur = videoRef.current.duration;
        if (dur && !isNaN(dur) && dur > 0) {
          setDuration(dur);
        }
        if (videoRef.current.buffered.length > 0) {
          setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
        }
      }
      animId = requestAnimationFrame(loop);
    };

    if (playing) {
      animId = requestAnimationFrame(loop);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [playing, isScrubbing]);

  const seekFromPointer = useCallback(
    (clientX: number, target: HTMLDivElement) => {
      const rect = target.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      if (videoRef.current && duration > 0) {
        const targetTime = pos * duration;
        videoRef.current.currentTime = targetTime;
        setCurrentTime(targetTime);
      }
    },
    [duration],
  );

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
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
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
            style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
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

        {nodes && currentIndex < total - 1 && (
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
            background: "linear-gradient(to top, rgba(0,0,0,0.90) 0%, transparent 100%)",
            padding: "28px 16px max(16px, env(safe-area-inset-bottom))",
            opacity: chrome ? 1 : 0,
            pointerEvents: chrome ? "auto" : "none",
            transition: "opacity 0.2s ease",
          }}
        >
          {/* Scrubber slider matching Flutter MediaScrubber and YouTube 60 FPS smoothness */}
          <div
            style={{
              position: "relative",
              height: 24,
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              touchAction: "none",
            }}
            onPointerEnter={() => setScrubberHover(true)}
            onPointerLeave={() => setScrubberHover(false)}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setIsScrubbing(true);
              seekFromPointer(e.clientX, e.currentTarget);
            }}
            onPointerMove={(e) => {
              if (isScrubbing) {
                seekFromPointer(e.clientX, e.currentTarget);
              }
            }}
            onPointerUp={(e) => {
              if (isScrubbing) {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {}
                setIsScrubbing(false);
              }
            }}
          >
            {/* Background track */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                height: scrubberHover || isScrubbing ? 6 : 4,
                background: "rgba(255,255,255,0.25)",
                borderRadius: 3,
                transition: "height 0.15s ease",
              }}
            />
            {/* Buffer track */}
            <div
              style={{
                position: "absolute",
                left: 0,
                width: `${duration ? (buffered / duration) * 100 : 0}%`,
                height: scrubberHover || isScrubbing ? 6 : 4,
                background: "rgba(255,255,255,0.45)",
                borderRadius: 3,
                transition: "height 0.15s ease",
              }}
            />
            {/* Played track (60 FPS smooth matching YouTube) */}
            <div
              style={{
                position: "absolute",
                left: 0,
                width: `${duration ? (currentTime / duration) * 100 : 0}%`,
                height: scrubberHover || isScrubbing ? 6 : 4,
                background: "#4C8DFF",
                borderRadius: 3,
                transition: "height 0.15s ease",
              }}
            />
            {/* Scrubber thumb */}
            {(scrubberHover || isScrubbing) && (
              <div
                style={{
                  position: "absolute",
                  left: `${duration ? (currentTime / duration) * 100 : 0}%`,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: "#4C8DFF",
                  boxShadow: "0 0 4px rgba(0,0,0,0.4)",
                  transform: "translateX(-50%)",
                  pointerEvents: "none",
                }}
              />
            )}
          </div>

          {/* Controls Bar matching Flutter _Bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
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
              <Icon glyph={playing ? "pause" : "play"} size={20} color="#FFFFFF" />
            </button>

            {/* Elapsed / Total time matching Flutter exactly */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#FFFFFF" }}>
                {formatClock(currentTime)}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#FFFFFF" }}>
                {"  /  " + formatClock(duration)}
              </span>
            </div>

            <span style={{ flex: 1 }} />

            {/* Time left matching Flutter exactly */}
            <span style={{ fontSize: 13, fontWeight: 600, color: "#FFFFFF" }}>
              {"-" + formatClock(Math.max(0, duration - currentTime))}
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
              <Icon glyph={isFullscreen ? "fullscreenExit" : "fullscreen"} size={20} color="#FFFFFF" />
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
              glyph="shared"
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
                glyph={kept ? "offlineReady" : "offline"}
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

/**
 * Interactive image viewer supporting zoom and pan matching Flutter's PhotoViewGallery / ZoomOnScroll.
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
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);

  // Reset zoom on src change
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [src]);

  // Double click / double tap
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (scale > 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        setScale(2.5);
        return;
      }
      const clickX = e.clientX - rect.left - rect.width / 2;
      const clickY = e.clientY - rect.top - rect.height / 2;
      setScale(2.5);
      setPosition({ x: -clickX * 1.5, y: -clickY * 1.5 });
    }
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setScale((prev) => {
      const next = Math.min(Math.max(1, prev * zoomFactor), 5);
      if (next === 1) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  };

  // Mouse/touch dragging
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scale <= 1) return;
    e.stopPropagation();
    isDragging.current = true;
    didDrag.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    startPos.current = { ...position };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.hypot(dx, dy) > 3) {
      didDrag.current = true;
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
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleClick = () => {
    if (didDrag.current) return;
    onTap();
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        cursor: scale > 1 ? (isDragging.current ? "grabbing" : "grab") : "default",
        touchAction: scale > 1 ? "none" : "pan-y",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
          transition: isDragging.current ? "none" : "transform 0.15s ease-out",
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
