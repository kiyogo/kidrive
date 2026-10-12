"use client";

import { useRef, useState, type ReactNode } from "react";
import { useL10n, type Strings } from "@/lib/l10n";
import { Icon, type Glyph } from "./Icon";
import { Sheet, Tappable, useDeviceClass } from "./ui";
import { bytes, percent } from "@/lib/format";
import { useSession } from "@/lib/session";

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
  onCreateFolder,
  children,
}: {
  section: Section;
  onNavigate: (s: Section) => void;
  /** given the picked files. The input lives here rather than in the files
   *  browser, because the sidebar and the phone's plus button have to reach it
   *  from Settings, Gallery and everywhere else too. */
  onUpload: (files: FileList | null) => void;
  onCreateFolder?: () => void;
  children: ReactNode;
}) {
  const t = useL10n();
  const { isDesktop } = useDeviceClass();
  const { user } = useSession();
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [desktopCreateOpen, setDesktopCreateOpen] = useState(false);
  const shellFileInput = useRef<HTMLInputElement>(null);
  const pick = () => shellFileInput.current?.click();

  if (!isDesktop) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
        <input ref={shellFileInput} type="file" multiple hidden onChange={(e) => { onUpload(e.target.files); e.target.value = ""; }} />
        <div style={{ flex: 1, minHeight: 0, paddingBottom: 92 }}>{children}</div>
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
          {compact.slice(0, 2).map((item) => (
            <BottomItem key={item.id} item={item} active={section === item.id} onClick={() => onNavigate(item.id)} />
          ))}
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
            }}
            title={t.navCreate}
          >
            <Icon glyph="plus" size={24} color="#FFFFFF" strokeWidth={2.2} />
          </Tappable>
          {compact.slice(2).map((item) => (
            <BottomItem key={item.id} item={item} active={section === item.id} onClick={() => onNavigate(item.id)} />
          ))}
        </nav>

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
          </div>
        </Sheet>
      </div>
    );
  }

  return (
    <div style={{ height: "100dvh", maxHeight: "100dvh", width: "100%", maxWidth: "100vw", display: "flex", overflow: "hidden" }}>
      <input ref={shellFileInput} type="file" multiple hidden onChange={(e) => { onUpload(e.target.files); e.target.value = ""; }} />
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
        <div style={{ padding: "0 20px 20px 20px", position: "relative" }}>
          <Tappable
            onClick={() => setDesktopCreateOpen((o) => !o)}
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

          {desktopCreateOpen && (
            <>
              <div
                onClick={() => setDesktopCreateOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 90,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 20,
                  right: 20,
                  top: 44,
                  zIndex: 100,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--stroke)",
                  borderRadius: "var(--r-tile)",
                  boxShadow: "var(--nav-shadow)",
                  padding: "6px 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <Tappable
                  onClick={() => {
                    setDesktopCreateOpen(false);
                    onCreateFolder?.();
                  }}
                  radius={10}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "11px 14px",
                    color: "var(--fg-primary)",
                  }}
                >
                  <Icon glyph="folder" size={19} color="var(--fg-primary)" />
                  <span className="t-body-lg" style={{ fontWeight: 400, flex: 1 }}>
                    {t.newFolder}
                  </span>
                </Tappable>
                <Tappable
                  onClick={() => {
                    setDesktopCreateOpen(false);
                    pick();
                  }}
                  radius={10}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "11px 14px",
                    color: "var(--fg-primary)",
                  }}
                >
                  <Icon glyph="upload" size={19} color="var(--fg-primary)" />
                  <span className="t-body-lg" style={{ fontWeight: 400, flex: 1 }}>
                    {t.uploadFile}
                  </span>
                </Tappable>
              </div>
            </>
          )}
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
          <div style={{ padding: "12px 16px 0 16px" }}>
            <QuotaBar used={user.quota_bytes_used} total={user.quota_bytes} />
          </div>
        )}
      </aside>

      <main style={{ flex: 1, minWidth: 0, height: "100dvh", overflowY: "auto", overflowX: "hidden" }}>{children}</main>
    </div>
  );
}

function BottomItem({
  item,
  active,
  onClick,
}: {
  item: { id: Section; key: keyof Strings; glyph: Glyph };
  active: boolean;
  onClick: () => void;
}) {
  const t = useL10n();
  const color = active ? "var(--accent)" : "var(--fg-secondary)";
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
        {String(t[item.key])}
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

  return (
    <div style={{ padding: "12px 10px", whiteSpace: "nowrap" }}>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--bg-elevated)",
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            height: "100%",
            width: unlimited ? "12%" : `${pct}%`,
            background: pct > 90 ? "var(--warning)" : "var(--accent)",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          whiteSpace: "nowrap",
          fontSize: 12,
          color: "var(--fg-secondary)",
          gap: 6,
        }}
      >
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {t.sidebarStorageUsed({ used: bytes(used) })}
        </span>
        {!unlimited && (
          <span style={{ color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {t.sidebarStorageFree({ free: bytes(remaining) })}
          </span>
        )}
      </div>
    </div>
  );
}
