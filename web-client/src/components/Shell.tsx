"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import { useL10n, type Strings } from "@/lib/l10n";
import { Icon, type Glyph } from "./Icon";
import { Banner, CanvasOverlayScrollbar, Menu, Sheet, Tappable, useDeviceClass, showToast } from "./ui";
import { bytes, percent } from "@/lib/format";
import { useSession } from "@/lib/session";
import { wsClient, type ConnectionState } from "@/lib/websocket";
import { checkStorageReadiness } from "@/lib/uploads";

export type Section =
  | "files"
  | "image"
  | "videos"
  | "shared"
  | "recent"
  | "starred"
  | "trash"
  | "storage"
  | "settings"
  | "search"
  | "transfers"
  | "activity";

/* The destinations name their string rather than carrying one, because a
   module level constant is built once and would freeze whichever language
   happened to be current then. */
const primary: { id: Section; key: keyof Strings; glyph: Glyph }[] = [
  { id: "files", key: "myFiles", glyph: "home" },
  { id: "image", key: "gallery", glyph: "image" },
  { id: "videos", key: "videos", glyph: "video" },
  { id: "shared", key: "sharedWithMe", glyph: "shared" },
  { id: "recent", key: "recent", glyph: "recent" },
  { id: "starred", key: "starred", glyph: "star" },
  { id: "trash", key: "trash", glyph: "trash" },
  { id: "storage", key: "storage", glyph: "storage" },
  { id: "settings", key: "settings", glyph: "settings" },
];

/** What the bottom bar shows on a phone, where eight destinations do not fit. */
const compact: { id: Section; key: keyof Strings; glyph: Glyph }[] = [
  { id: "files", key: "navHome", glyph: "home" },
  { id: "image", key: "gallery", glyph: "image" },
  { id: "shared", key: "navShared", glyph: "shared" },
  { id: "settings", key: "navSettings", glyph: "settings" },
];

export function Shell({
  section,
  onNavigate,
  onUpload,
  onUploadFolder,
  onDropDataTransfer,
  onCreateFolder,
  children,
}: {
  section: Section;
  onNavigate: (s: Section) => void;
  /** given the picked files. The input lives here rather than in the files
   *  browser, because the sidebar and the phone's plus button have to reach it
   *  from Settings, Gallery and everywhere else too. */
  onUpload: (files: FileList | null) => void;
  onUploadFolder?: (files: FileList | null) => void;
  onDropDataTransfer?: (dt: DataTransfer) => void;
  onCreateFolder?: () => void;
  children: ReactNode;
}) {
  const t = useL10n();
  const { isDesktop } = useDeviceClass();
  const { user } = useSession();
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    wsClient.getState(),
  );

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    const unbind = wsClient.onStateChange(setConnectionState);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("keydown", handleKey);
      unbind();
    };
  }, []);

  const isDisconnected = offline || connectionState === "disconnected";

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [createMenuAnchor, setCreateMenuAnchor] = useState<{ left: number; right: number; top: number; bottom: number } | null>(null);
  const [pathname, setPathname] = useState(
    typeof window !== "undefined" ? window.location.pathname : ""
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update);
    const interval = setInterval(update, 400);
    return () => {
      window.removeEventListener("popstate", update);
      clearInterval(interval);
    };
  }, []);

  const isFormSubpage = pathname.includes("/add") || pathname.includes("/edit");
  const isMoreActive = ["videos", "recent", "starred", "trash", "storage", "settings", "search"].includes(section);
  const shellFileInput = useRef<HTMLInputElement>(null);
  const shellFolderInput = useRef<HTMLInputElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    const isFileInputTarget = (e: DragEvent | PointerEvent) => {
      const target = e.target as HTMLElement | null;
      return target && target.closest("input, textarea, [contenteditable='true'], [role='dialog'], .ld-dialog");
    };

    const handleDragEnter = (e: DragEvent) => {
      if (isFileInputTarget(e)) return;
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      dragCounter.current++;
      setIsWindowDragging(true);
    };

    const handleDragOver = (e: DragEvent) => {
      if (isFileInputTarget(e)) return;
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };

    const handleDragLeave = (e: DragEvent) => {
      if (isFileInputTarget(e)) return;
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setIsWindowDragging(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      dragCounter.current = 0;
      setIsWindowDragging(false);
      if (isFileInputTarget(e)) return;
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      if (onDropDataTransfer) {
        onDropDataTransfer(e.dataTransfer);
      }
    };

    const handlePointerDown = () => {
      if (dragCounter.current > 0 || isWindowDragging) {
        dragCounter.current = 0;
        setIsWindowDragging(false);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onDropDataTransfer]);

  const dragOverlay = isWindowDragging ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        border: "3px dashed var(--accent, #3b82f6)",
        gap: 16,
      }}
    >
      <Icon glyph="upload" size={54} color="var(--accent, #3b82f6)" />
      <span style={{ color: "#ffffff", fontSize: 20, fontWeight: 700, pointerEvents: "none" }}>
        Thả tệp vào đây để tải lên
      </span>
    </div>
  ) : null;

  useEffect(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
  }, [section, pathname]);

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    if (user && user.role !== "admin") {
      const readiness = await checkStorageReadiness();
      if (!readiness.ready) {
        showToast(readiness.message, "error");
        return;
      }
    }
    if (user && user.quota_bytes > 0) {
      const totalSize = Array.from(files).reduce((acc, f) => acc + (f.size || 0), 0);
      if (user.quota_bytes_used >= user.quota_bytes || user.quota_bytes_used + totalSize > user.quota_bytes) {
        showToast("Dung lượng lưu trữ đã đầy, không thể tải tệp lên", "error");
        return;
      }
    }
    onUpload(files);
  };

  const handleUploadFolder = async (files: FileList | null) => {
    if (!files || !files.length) return;
    if (user && user.role !== "admin") {
      const readiness = await checkStorageReadiness();
      if (!readiness.ready) {
        showToast(readiness.message, "error");
        return;
      }
    }
    if (user && user.quota_bytes > 0) {
      const totalSize = Array.from(files).reduce((acc, f) => acc + (f.size || 0), 0);
      if (user.quota_bytes_used >= user.quota_bytes || user.quota_bytes_used + totalSize > user.quota_bytes) {
        showToast("Dung lượng lưu trữ đã đầy, không thể tải tệp lên", "error");
        return;
      }
    }
    if (onUploadFolder) onUploadFolder(files);
    else onUpload(files);
  };

  const pick = async () => {
    if (user && user.role !== "admin") {
      const readiness = await checkStorageReadiness();
      if (!readiness.ready) {
        showToast(readiness.message, "error");
        return;
      }
    }
    if (user && user.quota_bytes > 0 && user.quota_bytes_used >= user.quota_bytes) {
      showToast("Dung lượng lưu trữ đã đầy, không thể tải tệp lên", "error");
      return;
    }
    shellFileInput.current?.click();
  };

  const pickFolder = async () => {
    if (user && user.role !== "admin") {
      const readiness = await checkStorageReadiness();
      if (!readiness.ready) {
        showToast(readiness.message, "error");
        return;
      }
    }
    if (user && user.quota_bytes > 0 && user.quota_bytes_used >= user.quota_bytes) {
      showToast("Dung lượng lưu trữ đã đầy, không thể tải tệp lên", "error");
      return;
    }
    shellFolderInput.current?.click();
  };

  if (!isDesktop) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
        <input ref={shellFileInput} type="file" multiple hidden onChange={(e) => { handleUploadFiles(e.target.files); e.target.value = ""; }} />
        <input
          ref={(el) => {
            (shellFolderInput as any).current = el;
            if (el) {
              el.setAttribute("webkitdirectory", "");
              el.setAttribute("directory", "");
              (el as any).webkitdirectory = true;
              (el as any).directory = true;
            }
          }}
          type="file"
          multiple
          hidden
          {...({ webkitdirectory: "", directory: "" } as any)}
          onChange={(e) => {
            handleUploadFolder(e.target.files);
            e.target.value = "";
          }}
        />
        {isDisconnected && (
          <Banner
            glyph="offline"
            message={t.errorOfflineTitle}
            tint="var(--fg-secondary)"
          />
        )}
        <div style={{ flex: 1, minHeight: 0, paddingBottom: isFormSubpage ? 20 : 92 }}>{children}</div>
        {!isFormSubpage && (
          <nav
            style={{
              position: "fixed",
              insetInline: 16,
              bottom: "calc(12px + env(safe-area-inset-bottom))",
              height: 68,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-around",
              background: "var(--bg-elevated)",
              border: "1.2px solid var(--stroke)",
              borderRadius: 34,
              boxShadow: "var(--nav-shadow)",
              zIndex: 500,
              padding: "0 6px",
            }}
          >
            <BottomItem
              item={{ id: "files", key: "navHome", glyph: "home" }}
              active={section === "files"}
              onClick={() => onNavigate("files")}
            />
            <BottomItem
              item={{ id: "image", key: "gallery", glyph: "image" }}
              active={section === "image"}
              onClick={() => onNavigate("image")}
            />
            <Tappable
              onClick={() => setCreateSheetOpen(true)}
              radius={999}
              style={{
                width: 50,
                height: 50,
                background: "var(--accent)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(76, 141, 255, 0.38)",
                flexShrink: 0,
              }}
              title={t.navCreate}
            >
              <Icon glyph="plus" size={24} color="#FFFFFF" strokeWidth={2.2} />
            </Tappable>
            <BottomItem
              item={{ id: "shared", key: "navShared", glyph: "shared" }}
              active={section === "shared"}
              onClick={() => onNavigate("shared")}
            />
            <BottomItem
              item={{ id: "menu", label: "Menu", glyph: "grid" }}
              active={isMoreActive}
              onClick={() => setNavDrawerOpen(true)}
            />
          </nav>
        )}

        <Sheet open={createSheetOpen} onClose={() => setCreateSheetOpen(false)} title={t.navCreate}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {onCreateFolder && (
              <Tappable
                onClick={() => {
                  setCreateSheetOpen(false);
                  onCreateFolder();
                }}
                radius={12}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px 18px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--stroke)",
                }}
              >
                <Icon glyph="folder" size={20} color="var(--accent)" />
                <span className="t-body-md" style={{ fontWeight: 600 }}>
                  {t.newFolder}
                </span>
              </Tappable>
            )}
            <Tappable
              onClick={() => {
                setCreateSheetOpen(false);
                pick();
              }}
              radius={12}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 18px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--stroke)",
              }}
            >
              <Icon glyph="upload" size={20} color="var(--accent)" />
              <span className="t-body-md" style={{ fontWeight: 600 }}>
                {t.uploadFile}
              </span>
            </Tappable>
            <Tappable
              onClick={() => {
                setCreateSheetOpen(false);
                pickFolder();
              }}
              radius={12}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 18px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--stroke)",
              }}
            >
              <Icon glyph="folder" size={20} color="var(--accent)" />
              <span className="t-body-md" style={{ fontWeight: 600 }}>
                {t.uploadFolder}
              </span>
            </Tappable>
          </div>
        </Sheet>

        <Sheet open={navDrawerOpen} onClose={() => setNavDrawerOpen(false)} title="Menu & Điều hướng">
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "75vh", overflowY: "auto", paddingBottom: 16 }}>
            {/* Quick search button */}
            <Tappable
              onClick={() => {
                setNavDrawerOpen(false);
                onNavigate("search");
              }}
              radius={12}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                background: "var(--bg-sunken)",
                border: "1px solid var(--stroke)",
                color: "var(--fg-secondary)",
              }}
            >
              <Icon glyph="search" size={18} color="var(--fg-secondary)" />
              <span className="t-body-md" style={{ flex: 1, color: "var(--fg-muted)" }}>
                {t.search}...
              </span>
            </Tappable>

            {/* Grid of 9 destinations */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {primary.map((item) => {
                const isSelected = section === item.id;
                return (
                  <Tappable
                    key={item.id}
                    onClick={() => {
                      setNavDrawerOpen(false);
                      onNavigate(item.id);
                    }}
                    radius={12}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: isSelected ? "rgba(76, 141, 255, 0.12)" : "var(--bg-elevated)",
                      border: `1px solid ${isSelected ? "var(--accent)" : "var(--stroke)"}`,
                      color: isSelected ? "var(--accent)" : "var(--fg-primary)",
                    }}
                  >
                    <Icon glyph={item.glyph} size={20} color={isSelected ? "var(--accent)" : "var(--fg-secondary)"} />
                    <span className="t-body-md" style={{ fontWeight: isSelected ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {String(t[item.key])}
                    </span>
                  </Tappable>
                );
              })}
            </div>

            {/* Admin shortcuts if user is admin */}
            {user?.role === "admin" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Quản trị hệ thống
                  </span>
                  <div style={{ flex: 1, height: 1, background: "var(--stroke)" }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  <Tappable
                    onClick={() => {
                      setNavDrawerOpen(false);
                      onNavigate("settings");
                      if (typeof window !== "undefined") {
                        window.history.pushState(null, "", "/settings/users");
                        window.dispatchEvent(new PopStateEvent("popstate"));
                      }
                    }}
                    radius={12}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--stroke)",
                    }}
                  >
                    <Icon glyph="people" size={20} color="var(--accent)" />
                    <span className="t-body-md" style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.settingsUsers}
                    </span>
                  </Tappable>

                  <Tappable
                    onClick={() => {
                      setNavDrawerOpen(false);
                      onNavigate("settings");
                      if (typeof window !== "undefined") {
                        window.history.pushState(null, "", "/settings/shares");
                        window.dispatchEvent(new PopStateEvent("popstate"));
                      }
                    }}
                    radius={12}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--stroke)",
                    }}
                  >
                    <Icon glyph="share" size={20} color="var(--accent)" />
                    <span className="t-body-md" style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Chia sẻ mạng
                    </span>
                  </Tappable>

                  <Tappable
                    onClick={() => {
                      setNavDrawerOpen(false);
                      onNavigate("settings");
                      if (typeof window !== "undefined") {
                        window.history.pushState(null, "", "/settings/pools");
                        window.dispatchEvent(new PopStateEvent("popstate"));
                      }
                    }}
                    radius={12}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--stroke)",
                    }}
                  >
                    <Icon glyph="storage" size={20} color="var(--accent)" />
                    <span className="t-body-md" style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.settingsStoragePools}
                    </span>
                  </Tappable>

                  <Tappable
                    onClick={() => {
                      setNavDrawerOpen(false);
                      onNavigate("settings");
                      if (typeof window !== "undefined") {
                        window.history.pushState(null, "", "/settings/datasets");
                        window.dispatchEvent(new PopStateEvent("popstate"));
                      }
                    }}
                    radius={12}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--stroke)",
                    }}
                  >
                    <Icon glyph="folder" size={20} color="var(--accent)" />
                    <span className="t-body-md" style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.settingsDatasets}
                    </span>
                  </Tappable>
                </div>
              </>
            )}

            {/* Mobile bottom padding */}
          </div>
        </Sheet>
        {dragOverlay}
      </div>
    );
  }

  return (
    <div style={{ height: "100dvh", maxHeight: "100dvh", width: "100%", maxWidth: "100vw", display: "flex", overflow: "hidden" }}>
      <input ref={shellFileInput} type="file" multiple hidden onChange={(e) => { handleUploadFiles(e.target.files); e.target.value = ""; }} />
      <input
        ref={(el) => {
          (shellFolderInput as any).current = el;
          if (el) {
            el.setAttribute("webkitdirectory", "");
            el.setAttribute("directory", "");
            (el as any).webkitdirectory = true;
            (el as any).directory = true;
          }
        }}
        type="file"
        multiple
        hidden
        {...({ webkitdirectory: "", directory: "" } as any)}
        onChange={(e) => {
          handleUploadFolder(e.target.files);
          e.target.value = "";
        }}
      />
      <aside
        style={{
          width: 248,
          flex: "0 0 248px",
          minWidth: 248,
          maxWidth: 248,
          borderInlineEnd: "1px solid var(--stroke)",
          padding: "24px 0 20px 0",
          display: "flex",
          flexDirection: "column",
          height: "100dvh",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "0 20px 20px 20px" }}>
          <Tappable
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setCreateMenuAnchor((prev) =>
                prev ? null : { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
              );
            }}
            radius={24}
            style={{
              height: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "var(--accent)",
              color: "#FFFFFF",
              width: "100%",
            }}
          >
            <Icon glyph="upload" size={18} color="#FFFFFF" />
            <span className="t-label-lg" style={{ color: "#FFFFFF" }}>{t.upload}</span>
          </Tappable>

          <Menu
            open={Boolean(createMenuAnchor)}
            anchorRect={createMenuAnchor}
            onClose={() => setCreateMenuAnchor(null)}
            items={[
              ...(onCreateFolder
                ? [
                    {
                      label: t.newFolder,
                      glyph: "folder" as const,
                      onClick: () => {
                        setCreateMenuAnchor(null);
                        onCreateFolder();
                      },
                    },
                  ]
                : []),
              {
                label: t.uploadFile,
                glyph: "upload" as const,
                onClick: () => {
                  setCreateMenuAnchor(null);
                  pick();
                },
              },
              {
                label: t.uploadFolder,
                glyph: "folder" as const,
                onClick: () => {
                  setCreateMenuAnchor(null);
                  pickFolder();
                },
              },
            ]}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {primary.map((item) => {
            const active = section === item.id;
            return (
              <Tappable
                key={item.id}
                onClick={() => onNavigate(item.id)}
                radius={14}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 14px",
                  background: active ? "rgba(76,141,255,0.12)" : "transparent",
                  color: "var(--fg-primary)",
                }}
              >
                <Icon glyph={item.glyph} size={19} color={active ? "var(--accent)" : "var(--fg-secondary)"} />
                <span
                  className="t-body-lg"
                  style={{
                    fontWeight: 400,
                    flex: 1,
                    color: "var(--fg-primary)",
                  }}
                >
                  {String(t[item.key])}
                </span>
              </Tappable>
            );
          })}
        </div>

        {user && (
          <QuotaBar used={user.quota_bytes_used || 0} total={user.quota_bytes || 0} />
        )}
      </aside>

      <main
        style={{
          flex: 1,
          minWidth: 0,
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {isDisconnected && (
          <Banner
            glyph="offline"
            message={t.errorOfflineTitle}
            tint="var(--fg-secondary)"
          />
        )}
        <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div
            ref={contentScrollRef}
            id="main-scroll-container"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: isDesktop && section === "settings" ? "hidden" : "auto",
              overflowX: "hidden",
            }}
          >
            {children}
          </div>
          {!(isDesktop && section === "settings") && <CanvasOverlayScrollbar targetRef={contentScrollRef} />}
        </div>
      </main>
      {dragOverlay}
    </div>
  );
}

function BottomItem({
  item,
  active,
  onClick,
}: {
  item: { id: string; key?: keyof Strings; label?: string; glyph: Glyph };
  active: boolean;
  onClick: () => void;
}) {
  const t = useL10n();
  const color = active ? "var(--accent)" : "var(--fg-secondary)";
  const labelText = item.label || (item.key ? String(t[item.key]) : "");
  return (
    <Tappable
      onClick={onClick}
      radius={24}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: "6px 8px",
        color,
        minWidth: 56,
        flex: 1,
      }}
    >
      <Icon glyph={item.glyph} size={22} color={color} strokeWidth={active ? 2.1 : 1.9} />
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 500,
          color,
          letterSpacing: 0.1,
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 68,
        }}
      >
        {labelText}
      </span>
    </Tappable>
  );
}

/** Quota, or just what has been used when the account has no limit. */
function QuotaBar({ used, total }: { used: number; total: number }) {
  const t = useL10n();
  const unlimited = !total || total <= 0;
  const pct = percent(used, total);
  const remaining = Math.max(0, total - used);
  const isOverQuota = !unlimited && used > total;

  return (
    <div
      onClick={() => {
        window.history.pushState(null, "", "/storage");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }}
      title="Xem chi tiết bộ nhớ tài khoản"
      style={{
        padding: "4px 14px 6px",
        whiteSpace: "nowrap",
        cursor: "pointer",
        background: "transparent",
        border: "none",
        margin: "4px 12px 10px",
        transition: "all 0.2s ease",
      }}
    >
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--border-subtle, #e2e8f0)",
          overflow: "hidden",
          marginBottom: 6,
        }}
      >
        <div
          style={{
            height: "100%",
            width: isOverQuota ? "100%" : unlimited ? (used > 0 ? "25%" : "0%") : `${Math.min(100, Math.max(0, pct))}%`,
            background: isOverQuota ? "#ef4444" : pct > 90 ? "var(--warning)" : "var(--accent, #2563EB)",
            borderRadius: 999,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          whiteSpace: "nowrap",
          fontSize: 11,
          color: isOverQuota ? "#ef4444" : "var(--fg-secondary)",
          gap: 6,
        }}
      >
        <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
          {t.sidebarStorageUsed({ used: bytes(used) })}
        </span>
        {!unlimited && (
          <span style={{ color: isOverQuota ? "#ef4444" : "var(--fg-muted)", whiteSpace: "nowrap" }}>
            {isOverQuota ? "0 B" : t.sidebarStorageFree({ free: bytes(remaining) })}
          </span>
        )}
      </div>
    </div>
  );
}