"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type Glyph } from "@/components/Icon";
import {
  Avatar,
  Button,
  CanvasOverlayScrollbar,
  ConfirmDialog,
  EmptyState,
  LayeredBadge,
  ListSkeleton,
  RadioRow,
  SettingGroup,
  SettingRow,
  Sheet,
  Switch,
  Tappable,
  TextField,
  useDeviceClass,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { bytes, dateTime, percent, relative } from "@/lib/format";
import type { DeviceModel, DriveModel, LibraryModel, UserModel } from "@/lib/models";
import { useL10n, type Strings } from "@/lib/l10n";
import { HIDE_TWO_FACTOR } from "@/lib/flags";
import { useSession } from "@/lib/session";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import { useTheme } from "@/lib/theme";
import { NetworkSharesSection } from "./NetworkSharesSection";
import { DisksSection } from "./DisksSection";
import { DatasetsSection } from "./DatasetsSection";
import { UsersSection } from "./UsersSection";
import { DashboardSection } from "./DashboardSection";
import { SecuritySection } from "./SecuritySection";
import { useInfiniteList } from "@/lib/useInfiniteList";

/*
  Settings, ported from features/settings. One list of sections, each opening
  its own page, in the order the app lists them. That order is declared once
  below rather than repeated here, because a comment listing it is a second
  copy that goes wrong the first time a section moves.
*/

type SectionId =
  | "root"
  | "account"
  | "appearance"
  | "devices"
  | "language"
  | "two-factor"
  | "downloads"
  | "dashboard"
  | "security"
  | "shares"
  | "network-shares"
  | "pools"
  | "disks"
  | "datasets"
  | "users"
  | "server"
  | "about";

/** Declared once, in the app's order. Users, server, network shares, disks, and datasets are admin only. */
const sections: { id: SectionId; key: keyof Strings; glyph: Glyph; adminOnly?: boolean }[] = [
  { id: "account", key: "settingsAccount", glyph: "person" },
  { id: "appearance", key: "settingsAppearance", glyph: "eye" },
  { id: "devices", key: "devices", glyph: "device" },
  { id: "language", key: "settingsLanguage", glyph: "language" },
  { id: "two-factor", key: "settingsTwoFactor", glyph: "lock" },
  { id: "downloads", key: "offlineDownloadsTitle", glyph: "offlineReady" },
  { id: "dashboard", key: "settingsDashboard", glyph: "grid", adminOnly: true },
  { id: "security", key: "settingsSecurity", glyph: "lock", adminOnly: true },
  { id: "shares", key: "settingsNetworkShares", glyph: "share", adminOnly: true },
  { id: "pools", key: "settingsStoragePools", glyph: "storage", adminOnly: true },
  { id: "datasets", key: "settingsDatasets", glyph: "folder", adminOnly: true },
  { id: "users", key: "settingsUsers", glyph: "people", adminOnly: true },
  { id: "server", key: "settingsServer", glyph: "server", adminOnly: true },
  { id: "about", key: "settingsAbout", glyph: "info" },
];

export function SettingsScreen({
  initialSection,
  onSelectSection,
}: {
  initialSection?: string;
  onSelectSection?: (id: string) => void;
} = {}) {
  const t = useL10n();
  const { user, signOut, locale } = useSession();
  const { theme } = useTheme();
  const { isDesktop } = useDeviceClass();
  const [mobileSection, setMobileSection] = useState<SectionId>(
    (initialSection as SectionId) || "root",
  );
  const [desktopSection, setDesktopSection] = useState<SectionId>(
    (initialSection as SectionId) || "account",
  );
  const [navKey, setNavKey] = useState(0);
  const isAdmin = user?.role === "admin";

  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (initialSection && initialSection !== "root") {
      setDesktopSection(initialSection as SectionId);
      setMobileSection(initialSection as SectionId);
      setNavKey((k) => k + 1);
    }
  }, [initialSection]);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [desktopSection]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePopState = () => {
      const pathname = window.location.pathname;
      if (pathname === "/settings" || pathname === "/settings/") {
        setMobileSection("root");
      } else {
        const seg = pathname.replace(/^\/settings\/?/, "").split("/")[0];
        if (seg && sections.some((s) => s.id === seg)) {
          setMobileSection(seg as SectionId);
          setDesktopSection(seg as SectionId);
        }
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const selectSection = (id: SectionId) => {
    setDesktopSection(id);
    setMobileSection(id);
    setNavKey((k) => k + 1);
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", `/settings/${id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    onSelectSection?.(id);
  };

  const visibleSections = sections
    .filter((s) => !s.adminOnly || isAdmin)
    .filter((s) => s.id !== "two-factor" || !HIDE_TWO_FACTOR);

  if (!isDesktop) {
    if (mobileSection !== "root") {
      return (
        <Detail
          key={`${mobileSection}-${navKey}`}
          section={mobileSection}
          onBack={() => {
            setMobileSection("root");
            if (typeof window !== "undefined") {
              window.history.pushState(null, "", "/settings");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }
          }}
        />
      );
    }

    return (
      <Page title={t.settings}>
        {user && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: 18,
              background: "var(--bg-elevated)",
              border: "1px solid var(--stroke)",
              borderRadius: "var(--r-card)",
              marginBottom: 20,
            }}
          >
            <Avatar name={user.display_name || user.username} seed={user.avatar_seed} size={48} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="t-title-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.display_name || user.username}
              </div>
              <div className="t-body-sm" style={{ color: "var(--fg-secondary)" }}>
                {user.email || user.username} · {user.role === "admin" ? t.roleAdmin : t.roleMember}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleSections.map((s) => {
            const value =
              s.id === "appearance"
                ? theme === "system"
                  ? t.themeSystem
                  : theme === "light"
                    ? t.themeLight
                    : t.themeDark
                : s.id === "language"
                  ? locale === "vi"
                    ? "Tiếng Việt"
                    : locale === "en"
                      ? "English"
                      : "العربية"
                  : undefined;
            return (
              <Row
                key={s.id}
                glyph={s.glyph}
                label={t[s.key] as string}
                value={value}
                onClick={() => selectSection(s.id)}
              />
            );
          })}
        </div>

        <div style={{ marginTop: 24 }}>
          <Button label={t.settingsSignOut} variant="danger" glyph="logout" onClick={() => void signOut()} />
        </div>
      </Page>
    );
  }

  // Desktop view: LdDesktopScaffold with 64px header and LdMasterDetail
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: "100%", minHeight: 0, width: "100%", overflow: "hidden" }}>
      <header
        style={{
          height: 64,
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--stroke)",
          background: "var(--bg-primary)",
          flex: "none",
        }}
      >
        <h1 className="t-title-lg" style={{ margin: 0 }}>
          {t.settings}
        </h1>
        <Button
          label={t.settingsSignOut}
          glyph="logout"
          variant="secondary"
          compact
          expand={false}
          onClick={() => void signOut()}
        />
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
        <aside
          style={{
            width: 240,
            flex: "0 0 240px",
            minWidth: 240,
            maxWidth: 240,
            flexShrink: 0,
            padding: 13,
            borderRight: "1px solid var(--stroke)",
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {visibleSections.map((s) => {
            const isSelected = desktopSection === s.id;
            return (
              <Tappable
                key={s.id}
                onClick={() => selectSection(s.id)}
                radius={14}
                style={{
                  padding: "10px 12px",
                  background: isSelected ? "rgba(76, 141, 255, 0.12)" : "transparent",
                  borderRadius: "var(--r-tile)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  color: isSelected ? "var(--fg-primary)" : "var(--fg-secondary)",
                  fontWeight: 400,
                  cursor: "pointer",
                }}
              >
                <Icon
                  glyph={s.glyph}
                  size={18}
                  color={isSelected ? "var(--accent)" : "var(--fg-secondary)"}
                />
                <span className="t-body-md" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t[s.key] as string}
                </span>
              </Tappable>
            );
          })}
        </aside>

        <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <main ref={mainRef} style={{ flex: 1, minWidth: 0, overflowY: "auto", overflowX: "hidden", padding: 24 }}>
            <div
              style={{
                width: "100%",
                maxWidth: desktopSection === "shares" || desktopSection === "network-shares" || desktopSection === "pools" || desktopSection === "disks" || desktopSection === "datasets" || desktopSection === "users" ? "100%" : 640,
              }}
            >
              <Detail key={`${desktopSection}-${navKey}`} section={desktopSection} embedded />
            </div>
          </main>
          <CanvasOverlayScrollbar targetRef={mainRef} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

function Page({
  title,
  onBack,
  embedded,
  children,
}: {
  title: string;
  onBack?: () => void;
  embedded?: boolean;
  children: React.ReactNode;
}) {
  const t = useL10n();
  const { isDesktop } = useDeviceClass();

  if (embedded && isDesktop) {
    return <div style={{ maxWidth: 640 }}>{children}</div>;
  }

  return (
    <div style={{ minHeight: isDesktop ? undefined : "100dvh" }}>
      {isDesktop ? (
        <header
          style={{
            height: 64,
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid var(--stroke)",
            background: "var(--bg-primary)",
            marginBottom: 20,
          }}
        >
          <h1 className="t-title-lg" style={{ margin: 0 }}>
            {title}
          </h1>
        </header>
      ) : (
        <header
          style={{
            position: "sticky",
            top: 0,
            background: "var(--bg-primary)",
            zIndex: 60,
            padding: "max(8px, env(safe-area-inset-top)) 16px 8px",
          }}
        >
          <div
            style={{
              maxWidth: 760,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {onBack && (
              <Tappable onClick={onBack} radius={999} style={{ padding: 8 }} title={t.actionBack}>
                <Icon glyph="chevron-left" size={20} />
              </Tappable>
            )}
            <h1 className="t-title-lg" style={{ margin: 0 }}>
              {title}
            </h1>
          </div>
        </header>
      )}
      <div style={{ padding: isDesktop ? "0 16px 80px" : "8px 16px 120px", maxWidth: 760, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function Row({
  glyph,
  label,
  value,
  onClick,
  danger,
}: {
  glyph: Glyph;
  label: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <Tappable
      onClick={onClick}
      radius={14}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        padding: "14px 16px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--stroke)",
        color: danger ? "var(--warning)" : "var(--fg-primary)",
      }}
    >
      <Icon glyph={glyph} size={19} color={danger ? "var(--warning)" : "var(--fg-secondary)"} />
      <span className="t-body-lg" style={{ flex: 1 }}>
        {label}
      </span>
      {value && (
        <span className="t-body-md" style={{ color: "var(--fg-secondary)" }}>
          {value}
        </span>
      )}
      {onClick && <Icon glyph="chevron-right" size={17} color="var(--fg-muted)" />}
    </Tappable>
  );
}

/* ---------------------------------------------------------------- details */

function Detail({
  section,
  onBack,
  embedded,
}: {
  section: SectionId;
  onBack?: () => void;
  embedded?: boolean;
}) {
  const t = useL10n();
  switch (section) {
    case "account":
      return <AccountSection onBack={onBack} embedded={embedded} />;
    case "appearance":
      return <AppearanceSection onBack={onBack} embedded={embedded} />;
    case "devices":
      return <DevicesSection onBack={onBack} embedded={embedded} />;
    case "users":
      return <UsersSection onBack={onBack} embedded={embedded} />;
    case "server":
      return <ServerSection onBack={onBack} embedded={embedded} />;
    case "shares":
    case "network-shares":
      return <NetworkSharesSection onBack={onBack} embedded={embedded} />;
    case "pools":
    case "disks":
      return <DisksSection onBack={onBack} embedded={embedded} />;
    case "datasets":
      return <DatasetsSection onBack={onBack} embedded={embedded} />;
    case "language":
      return <LanguageSection onBack={onBack} embedded={embedded} />;
    case "downloads":
      return <DownloadsSection onBack={onBack} embedded={embedded} />;
    case "two-factor":
      return <TwoFactorSection onBack={onBack} embedded={embedded} />;
    case "dashboard":
      return (
        <Page title={t.settingsDashboard} onBack={onBack} embedded={embedded}>
          <DashboardSection onBack={onBack} embedded={embedded} />
        </Page>
      );
    case "security":
      return (
        <Page title={t.settingsSecurity} onBack={onBack} embedded={embedded}>
          <SecuritySection onBack={onBack} embedded={embedded} />
        </Page>
      );
    default:
      return <AboutSection onBack={onBack} embedded={embedded} />;
  }
}

function TwoFactorSection({ onBack, embedded }: { onBack?: () => void; embedded?: boolean }) {
  const { refreshUser } = useSession();
  return (
    <TwoFactorSetup
      required={false}
      onDone={() => {
        void refreshUser();
        onBack?.();
      }}
      onBack={onBack}
      embedded={embedded}
    />
  );
}

function AccountSection({ onBack, embedded }: { onBack?: () => void; embedded?: boolean }) {
  const t = useL10n();
  const { user, refreshUser, signOut } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [nameOpen, setNameOpen] = useState(false);
  const [nameVal, setNameVal] = useState(user?.display_name || user?.username || "");
  const [nameError, setNameError] = useState("");

  if (!user) return null;

  const change = async () => {
    if (next !== confirm) {
      setError(t.passwordsDoNotMatch);
      return;
    }
    if (next.length < 6) {
      setError(t.passwordTooShort);
      return;
    }
    try {
      await api.patch(Api.mePassword, { current_password: current, new_password: next });
      toast(t.passwordChanged, "success");
      setOpen(false);
      setCurrent("");
      setNext("");
      setConfirm("");
      setError("");
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errorUnexpectedTitle);
    }
  };

  const saveName = async () => {
    if (!nameVal.trim()) {
      setNameError("Vui lòng nhập tên hiển thị.");
      return;
    }
    try {
      await api.patch(Api.meProfile, { display_name: nameVal.trim() });
      toast("Đã đổi tên hiển thị", "success");
      setNameOpen(false);
      setNameError("");
      await refreshUser();
    } catch (e) {
      setNameError(e instanceof Error ? e.message : t.errorUnexpectedTitle);
    }
  };

  return (
    <Page title={t.settingsAccount} onBack={onBack} embedded={embedded}>
      {/* Account Card */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: 18,
          background: "var(--bg-elevated)",
          border: "1px solid var(--stroke)",
          borderRadius: "var(--r-card)",
          marginBottom: 24,
        }}
      >
        <Avatar name={user.display_name || user.username} seed={user.avatar_seed} size={48} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="t-title-sm" style={{ fontWeight: 600 }}>{user.display_name || user.username}</div>
            <Tappable
              onClick={() => {
                setNameVal(user.display_name || user.username);
                setNameOpen(true);
              }}
              radius={999}
              style={{ padding: 4 }}
              title="Đổi tên hiển thị"
            >
              <Icon glyph="edit" size={16} color="var(--accent)" />
            </Tappable>
          </div>
          <div className="t-body-sm" style={{ color: "var(--fg-secondary)", marginTop: 2 }}>
            {user.role === "admin" ? t.roleAdmin : t.roleMember}
          </div>
          {user.quota_bytes > 0 && (
            <>
              <div style={{ height: 5, borderRadius: 999, background: "var(--bg-sunken)", margin: "10px 0 6px", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${percent(user.quota_bytes_used, user.quota_bytes)}%`,
                    background: "var(--accent)",
                  }}
                />
              </div>
              <div className="t-label-sm" style={{ color: "var(--fg-secondary)" }}>
                {t.storageUsedOf({ used: bytes(user.quota_bytes_used), total: bytes(user.quota_bytes) })}
              </div>
            </>
          )}
        </div>
      </div>

      <SettingGroup title={t.storage}>
        <SettingRow
          label={t.storage}
          glyph="drive"
          onTap={() => { window.location.href = "/storage"; }}
        />
        <SettingRow
          showDivider
          label={t.trash}
          glyph="trash"
          onTap={() => { window.location.href = "/trash"; }}
        />
        <SettingRow
          showDivider
          label={t.activity}
          glyph="activity"
          onTap={() => { window.location.href = "/activity"; }}
        />
      </SettingGroup>

      <SettingGroup title={t.settingsAccount}>
        <SettingRow
          label="Đổi tên hiển thị"
          glyph="user"
          onTap={() => {
            setNameVal(user.display_name || user.username);
            setNameOpen(true);
          }}
        />
        <SettingRow
          showDivider
          label={t.newPassword}
          glyph="lock"
          onTap={() => setOpen(true)}
        />
      </SettingGroup>

      <SettingGroup title={t.settingsAbout}>
        <SettingRow
          label={t.settingsSwitchNode}
          glyph="server"
          onTap={() => {
            void signOut();
          }}
        />
      </SettingGroup>

      {/* Sheet đổi tên hiển thị */}
      <Sheet open={nameOpen} onClose={() => setNameOpen(false)} title="Đổi tên hiển thị">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TextField
            value={nameVal}
            onChange={setNameVal}
            label="Tên hiển thị mới"
            glyph="user"
            autoFocus
            onEnter={() => void saveName()}
          />
          {nameError && (
            <span className="t-body-sm" style={{ color: "var(--warning)" }}>
              {nameError}
            </span>
          )}
          <Button label={t.actionSave} onClick={() => void saveName()} />
        </div>
      </Sheet>

      {/* Sheet đổi mật khẩu */}
      <Sheet open={open} onClose={() => setOpen(false)} title={t.newPassword}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TextField
            value={current}
            onChange={setCurrent}
            label={t.currentPassword}
            hint={t.passwordHintExisting}
            type="password"
            glyph="lock"
          />
          <TextField
            value={next}
            onChange={setNext}
            label={t.newPassword}
            hint={t.passwordHintNew}
            type="password"
            glyph="lock"
          />
          <TextField
            value={confirm}
            onChange={setConfirm}
            label={t.confirmPasswordLabel}
            hint={t.confirmPasswordHint}
            type="password"
            glyph="lock"
          />
          {error && (
            <span className="t-body-sm" style={{ color: "var(--warning)" }}>
              {error}
            </span>
          )}
          <Button label={t.actionSave} onClick={() => void change()} />
        </div>
      </Sheet>
    </Page>
  );
}

function DevicesSection({ onBack, embedded }: { onBack?: () => void; embedded?: boolean }) {
  const t = useL10n();
  const [items, setItems] = useState<DeviceModel[] | null>(null);
  const toast = useToast();

  const load = async () => {
    try {
      const data = await api.get<{ sessions: DeviceModel[] }>(Api.sessions);
      setItems(data?.sessions ?? []);
    } catch {
      setItems([]);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const pending = items?.filter((d) => d.status === "pending") ?? [];
  const active = items?.filter((d) => d.status !== "pending") ?? [];

  return (
    <Page title={t.devices} onBack={onBack} embedded={embedded}>
      {items === null ? (
        <ListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState glyph="device" title={t.emptyDevicesTitle} message={t.settingsRequireApprovalNote} />
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  padding: "4px 8px 4px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--fg-secondary)",
                }}
              >
                {t.devicesPendingSection}
              </div>
              <SettingGroup>
                {pending.map((d, i) => (
                  <SettingRow
                    key={d.id}
                    showDivider={i > 0}
                    glyph="device"
                    label={d.device_name}
                    description={`${d.platform} ${d.ip || ""}`}
                    trailing={
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <Button
                          label={t.approve}
                          compact
                          expand={false}
                          onClick={async () => {
                            await api.post(`${Api.devices}/${d.id}/approve`, {});
                            toast(t.devicesApprovedToast, "success");
                            void load();
                          }}
                        />
                        <Button
                          label={t.deny}
                          variant="secondary"
                          compact
                          expand={false}
                          onClick={async () => {
                            await api.post(`${Api.devices}/${d.id}/deny`, {});
                            toast(t.devicesDeniedToast, "error");
                            void load();
                          }}
                        />
                      </div>
                    }
                  />
                ))}
              </SettingGroup>
            </div>
          )}

          <SettingGroup>
            {active.map((d, i) => (
              <SettingRow
                key={d.id}
                showDivider={i > 0}
                glyph="device"
                label={d.device_name}
                description={
                  d.current
                    ? undefined
                    : `${d.platform} · ${t.devicesLastSeen({ when: relative(d.last_seen_at) })}`
                }
                trailing={
                  d.current ? (
                    <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 500 }}>
                      {t.devicesThisDevice}
                    </span>
                  ) : (
                    <Button
                      label={t.devicesRevoke}
                      variant="secondary"
                      compact
                      expand={false}
                      onClick={async () => {
                        await api.del(Api.session(d.id));
                        toast(t.devicesRevoke, "success");
                        void load();
                      }}
                    />
                  )
                }
              />
            ))}
          </SettingGroup>
        </>
      )}
    </Page>
  );
}

type ServerSettings = {
  server_name?: string;
  require_device_approval?: boolean;
  enable_lan_discovery?: boolean;
  allow_self_registration?: boolean;
};

function ServerSection({ onBack, embedded }: { onBack?: () => void; embedded?: boolean }) {
  const t = useL10n();
  const toast = useToast();
  const [current, setCurrent] = useState<ServerSettings | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setCurrent(await api.get<ServerSettings>(Api.settings));
      } catch {
        setCurrent({});
      }
    })();
  }, []);

  const apply = async (patch: ServerSettings) => {
    const previous = current;
    setCurrent({ ...current, ...patch });
    try {
      const updated = await api.patch<ServerSettings>(Api.settings, patch);
      if (updated) {
        setCurrent((prev) => ({ ...prev, ...updated }));
      }
    } catch (e) {
      setCurrent(previous);
      toast(e instanceof Error ? e.message : t.errorUnexpectedTitle, "error");
    }
  };

  if (!current) {
    return (
      <Page title={t.settingsServer} onBack={onBack} embedded={embedded}>
        <ListSkeleton rows={4} />
      </Page>
    );
  }

  return (
    <Page title={t.settingsServer} onBack={onBack} embedded={embedded}>
      <SettingGroup title={t.settingsServer}>
        <SettingRow
          label={t.settingsRequireApproval}
          description={t.settingsRequireApprovalNote}
          glyph="device"
          onTap={() => void apply({ require_device_approval: !(current.require_device_approval ?? false) })}
          trailing={
            <Switch
              value={current.require_device_approval ?? false}
              onChange={(v) => void apply({ require_device_approval: v })}
            />
          }
        />
        <SettingRow
          showDivider
          label={t.settingsLanDiscovery}
          description={t.settingsLanDiscoveryNote}
          glyph="wifi"
          onTap={() => void apply({ enable_lan_discovery: !(current.enable_lan_discovery ?? false) })}
          trailing={
            <Switch
              value={current.enable_lan_discovery ?? false}
              onChange={(v) => void apply({ enable_lan_discovery: v })}
            />
          }
        />
        <SettingRow
          showDivider
          label={t.settingsSelfRegistration}
          description={t.settingsSelfRegistrationNote}
          glyph="people"
          onTap={() => void apply({ allow_self_registration: !(current.allow_self_registration ?? false) })}
          trailing={
            <Switch
              value={current.allow_self_registration ?? false}
              onChange={(v) => void apply({ allow_self_registration: v })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title={t.settingsAbout}>
        <SettingRow
          label={t.serverNameLabel}
          description={current.server_name || "Chưa đặt tên"}
          glyph="server"
          onTap={() => {
            setName(current.server_name ?? "");
            setRenaming(true);
          }}
        />
      </SettingGroup>

      <Sheet open={renaming} onClose={() => setRenaming(false)} title={t.serverNameLabel}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TextField
            value={name}
            onChange={setName}
            label={t.serverNameLabel}
            hint={t.serverNameHint}
            glyph="server"
            autoFocus
            onEnter={async () => {
              const trimmed = name.trim();
              if (!trimmed) return;
              await apply({ server_name: trimmed });
              setRenaming(false);
            }}
          />
          <Button
            label={t.actionSave}
            disabled={!name.trim()}
            onClick={async () => {
              const trimmed = name.trim();
              if (!trimmed) return;
              await apply({ server_name: trimmed });
              setRenaming(false);
            }}
          />
        </div>
      </Sheet>
    </Page>
  );
}

function AppearanceSection({ onBack, embedded }: { onBack?: () => void; embedded?: boolean }) {
  const t = useL10n();
  const { theme, setTheme } = useTheme();
  return (
    <Page title={t.settingsAppearance} onBack={onBack} embedded={embedded}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <RadioRow
          label={t.themeSystem}
          subtitle={t.themeSubtitle}
          selected={theme === "system"}
          onTap={() => setTheme("system")}
        />
        <RadioRow
          label={t.themeLight}
          selected={theme === "light"}
          onTap={() => setTheme("light")}
        />
        <RadioRow
          label={t.themeDark}
          selected={theme === "dark"}
          onTap={() => setTheme("dark")}
        />
      </div>
    </Page>
  );
}

function LanguageSection({ onBack, embedded }: { onBack?: () => void; embedded?: boolean }) {
  const t = useL10n();
  const { locale, setLocale } = useSession();
  return (
    <Page title={t.settingsLanguage} onBack={onBack} embedded={embedded}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <RadioRow
          label={t.languageEnglish}
          selected={locale === "en"}
          onTap={() => setLocale("en")}
        />
        <RadioRow
          label={t.languageVietnamese}
          selected={locale === "vi"}
          onTap={() => setLocale("vi")}
        />
        <RadioRow
          label={t.languageArabic}
          selected={locale === "ar"}
          onTap={() => setLocale("ar")}
        />
      </div>
    </Page>
  );
}

function AboutRow({
  label,
  value,
  glyph,
  onTap,
  showDivider = false,
}: {
  label: string;
  value?: string;
  glyph?: Glyph;
  onTap?: () => void;
  showDivider?: boolean;
}) {
  return (
    <>
      {showDivider && (
        <div style={{ height: 1, background: "var(--stroke)", margin: "0 -14px" }} />
      )}
      <Tappable
        onClick={onTap}
        radius={12}
        style={{
          width: "100%",
          padding: "14px 4px",
          display: "flex",
          alignItems: "center",
          boxSizing: "border-box",
          cursor: onTap ? "pointer" : "default",
        }}
      >
        {glyph && (
          <div style={{ flex: "none", display: "flex", alignItems: "center", marginInlineEnd: 12 }}>
            <Icon glyph={glyph} size={18} color="var(--fg-secondary)" />
          </div>
        )}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            fontWeight: 400,
            color: "var(--fg-primary)",
            textAlign: "left",
          }}
        >
          {label}
        </div>
        {value && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 14,
              color: "var(--fg-secondary)",
              textAlign: "right",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              paddingLeft: 16,
            }}
          >
            {value}
          </div>
        )}
        {onTap && (
          <div style={{ flex: "none", marginInlineStart: 8, color: "var(--fg-muted)" }}>
            <Icon glyph="chevron-right" size={16} />
          </div>
        )}
      </Tappable>
    </>
  );
}

function AboutSection({ onBack, embedded }: { onBack?: () => void; embedded?: boolean }) {
  const t = useL10n();
  const version = "0.0.1 (1)";
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    hasUpdate: boolean;
    latestVersion?: string;
    notes?: string;
    url?: string;
  } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");

  const handleCheckUpdate = async () => {
    setChecking(true);
    setUpdateMsg("");
    try {
      const res = await api.get<{
        has_update: boolean;
        latest_version?: string;
        notes?: string;
        url?: string;
      }>("/api/v1/admin/system/update/check");
      if (res && res.has_update) {
        setUpdateInfo({
          hasUpdate: true,
          latestVersion: res.latest_version,
          notes: res.notes,
          url: res.url,
        });
      } else {
        setUpdateInfo({ hasUpdate: false });
      }
    } catch {
      setUpdateInfo({ hasUpdate: false });
    } finally {
      setChecking(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!confirm("Xác nhận cập nhật hệ thống lên phiên bản mới?")) return;
    setUpdating(true);
    setUpdateMsg("Đang tải và cập nhật phiên bản mới, vui lòng chờ...");
    try {
      await api.post("/api/v1/admin/system/update/apply", {});
      setUpdateMsg("Đang khởi động lại máy chủ. Hệ thống sẽ làm mới sau giây lát...");
      setTimeout(() => {
        window.location.reload();
      }, 6000);
    } catch (e: any) {
      setUpdating(false);
      setUpdateMsg("Lỗi khi cập nhật: " + (e?.message || "Không thể kết nối"));
    }
  };

  return (
    <Page title={t.settingsAbout} onBack={onBack} embedded={embedded}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32, marginTop: 8 }}>
        <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
          <rect width="48" height="48" rx="12" fill="var(--accent)" />
          <path
            d="M24 14C19.58 14 16 17.58 16 22C16 22.34 16.03 22.68 16.08 23.01C13.73 23.51 12 25.56 12 28C12 30.76 14.24 33 17 33H31C34.31 33 37 30.31 37 27C37 23.85 34.56 21.28 31.47 21.03C30.73 17.06 27.72 14 24 14Z"
            fill="#FFFFFF"
          />
        </svg>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--fg-primary)", marginTop: 16 }}>
          Local Drive
        </div>
        <div style={{ fontSize: 13, color: "var(--fg-secondary)", marginTop: 4 }}>
          {version}
        </div>
      </div>

      <SettingGroup title={t.versionSection}>
        <AboutRow label={t.versionInstalled} value={version} />
        <AboutRow
          showDivider
          label="Kiểm tra phiên bản"
          value={checking ? "Đang kiểm tra..." : "Kiểm tra ngay"}
          onTap={checking || updating ? undefined : handleCheckUpdate}
        />
        {updateInfo?.hasUpdate && (
          <div style={{ padding: "12px 16px", background: "rgba(34, 197, 94, 0.1)", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ color: "#22c55e", fontWeight: 600, fontSize: 13 }}>
              Đã có phiên bản mới: v{updateInfo.latestVersion}
            </div>
            {updateInfo.notes && (
              <div style={{ fontSize: 12, color: "var(--fg-secondary)", whiteSpace: "pre-wrap" }}>
                {updateInfo.notes}
              </div>
            )}
            <button
              disabled={updating}
              onClick={handleApplyUpdate}
              style={{
                background: "#22c55e",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: updating ? "not-allowed" : "pointer",
                marginTop: 4,
                width: "fit-content",
              }}
            >
              {updating ? "Đang xử lý..." : "Cập nhật ngay"}
            </button>
            {updateMsg && (
              <div style={{ fontSize: 12, color: "var(--fg-primary)", marginTop: 4 }}>
                {updateMsg}
              </div>
            )}
          </div>
        )}
        {updateInfo && !updateInfo.hasUpdate && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--fg-secondary)" }}>
            ✓ Hệ thống đang chạy phiên bản mới nhất.
          </div>
        )}
      </SettingGroup>

      <SettingGroup title="Project">
        <AboutRow label="Name" value="Local Drive" />
        <AboutRow showDivider label="Type" value="Self-hosted Private Cloud" />
      </SettingGroup>

      <SettingGroup title="Ứng dụng cài đặt">
        <AboutRow
          label="Cài đặt trên Windows"
          value="LocalDrive-Setup.exe"
          onTap={() => window.open("/LocalDrive-Setup.exe", "_blank")}
        />
        <AboutRow
          showDivider
          label="Ứng dụng Android"
          value="LocalDrive.apk"
          onTap={() => window.open("/LocalDrive.apk", "_blank")}
        />
        <AboutRow
          showDivider
          label="Gói cài đặt Linux"
          value="LocalDrive-linux-package.tar.gz"
          onTap={() => window.open("/LocalDrive-linux-package.tar.gz", "_blank")}
        />
        <AboutRow
          showDivider
          label="Lệnh cài nhanh Linux"
          value="install.sh"
          onTap={() => window.open("/install.sh", "_blank")}
        />
      </SettingGroup>

      <SettingGroup title="Legal">
        <AboutRow label="Licence" value="MIT" />
        <AboutRow showDivider label="Open source licences" onTap={() => {}} />
      </SettingGroup>

      <div
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "var(--r-card)",
          border: "1px solid var(--stroke)",
          padding: 16,
          marginBottom: 32,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-primary)", marginBottom: 6 }}>
          Local Drive
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--fg-secondary)" }}>
          Local Drive is a self-hosted private cloud storage system. Built for a network you control rather than the public internet.
        </div>
      </div>
    </Page>
  );
}

/* --------------------------------------------------------------- downloads */

/**
 * Downloads on this device, matching Flutter Web Client's _WebOfflineSection.
 */
function DownloadsSection({ onBack, embedded }: { onBack?: () => void; embedded?: boolean }) {
  const t = useL10n();
  const toast = useToast();
  const [enabled, setEnabled] = useState(true);
  const [usageBytes, setUsageBytes] = useState(160 * 1024 * 1024);
  const [cachedCount, setCachedCount] = useState(0);
  const [quotaBytes, setQuotaBytes] = useState(102 * 1024 * 1024 * 1024);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        if (est.usage) setUsageBytes(est.usage);
        if (est.quota) setQuotaBytes(est.quota);
      }).catch(() => {});
    }
  }, []);

  const clearCache = async () => {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      for (const k of keys) await caches.delete(k);
    }
    setUsageBytes(0);
    setCachedCount(0);
    setConfirming(false);
    toast(t.offlineCacheCleared, "success");
  };

  return (
    <Page title={t.offlineDownloadsTitle} onBack={onBack} embedded={embedded}>
      <SettingGroup title={t.offlineDownloadsTitle}>
        <SettingRow
          label={t.offlineWebEnableTitle}
          description={t.offlineWebEnableSubtitle}
          glyph="offlineReady"
          trailing={<Switch value={enabled} onChange={setEnabled} />}
          onTap={() => setEnabled(!enabled)}
        />
      </SettingGroup>

      <div
        style={{
          opacity: enabled ? 1.0 : 0.4,
          pointerEvents: enabled ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
      >
        {/* 1. Dung lượng */}
        <SettingGroup title={t.offlineStorageTitle}>
          <div style={{ padding: "4px 4px 10px" }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--fg-primary)", lineHeight: 1.2 }}>
              {bytes(usageBytes)}
            </div>
            <div style={{ fontSize: 13, color: "var(--fg-secondary)", marginTop: 4 }}>
              {t.offlineStorageCachedCount({ count: cachedCount })}
            </div>
            {quotaBytes > 0 && (
              <>
                <div
                  style={{
                    height: 5,
                    borderRadius: 999,
                    background: "var(--bg-sunken)",
                    margin: "14px 0 8px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${percent(usageBytes, quotaBytes)}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-secondary)" }}>
                  {t.offlineStorageUsed({ usage: bytes(usageBytes), quota: bytes(quotaBytes) })}
                </div>
              </>
            )}
            <div style={{ marginTop: 14 }}>
              <Button
                label={t.offlineClearCache}
                glyph="trash"
                variant="danger"
                compact
                expand={false}
                onClick={() => setConfirming(true)}
              />
            </div>
          </div>
        </SettingGroup>

        {/* 2. Cách đồng bộ hóa */}
        <SettingGroup title={t.offlineSyncTitle}>
          <SettingRow
            glyph="drive"
            label={t.offlineSyncSmartCacheTitle}
            description={t.offlineSyncSmartCacheBody}
          />
          <SettingRow
            showDivider
            glyph="offlineReady"
            label={t.offlineSyncBrowsingTitle}
            description={t.offlineSyncBrowsingBody}
          />
          <SettingRow
            showDivider
            glyph="server"
            label={t.offlineSyncReconnectTitle}
            description={t.offlineSyncReconnectBody}
          />
          <SettingRow
            showDivider
            glyph="device"
            label={t.offlineSyncPwaTitle}
            description={t.offlineSyncPwaBody}
          />
        </SettingGroup>

        {/* 3. Bảo mật */}
        <SettingGroup title={t.offlineSecurityTitle}>
          <SettingRow
            glyph="lock"
            label={t.offlineSecuritySandboxTitle}
            description={t.offlineSecuritySandboxBody}
          />
          <SettingRow
            showDivider
            glyph="logout"
            label={t.offlineSecurityWipeTitle}
            description={t.offlineSecurityWipeBody}
          />
          <SettingRow
            showDivider
            glyph="info"
            label={t.offlineSecuritySharedTitle}
            description={t.offlineSecuritySharedBody}
          />
        </SettingGroup>
      </div>

      <ConfirmDialog
        open={confirming}
        title={t.offlineClearCache}
        message={t.offlineClearCacheConfirm}
        confirmLabel={t.actionRemove}
        cancelLabel={t.actionCancel}
        destructive
        onConfirm={() => void clearCache()}
        onCancel={() => setConfirming(false)}
      />
    </Page>
  );
}

/* ---------------------------------------------------------------- storage */

interface CategoryStat {
  bytes: number;
  count: number;
}

interface AccountStorageData {
  quota_bytes: number;
  used_bytes: number;
  free_bytes: number;
  usage_percent: number;
  categories: {
    images: CategoryStat;
    videos: CategoryStat;
    documents: CategoryStat;
    audio: CategoryStat;
    other: CategoryStat;
    trash: CategoryStat;
  };
}

export function StorageScreen() {
  const t = useL10n();
  const { user } = useSession();
  const { isDesktop } = useDeviceClass();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AccountStorageData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<AccountStorageData>(Api.storageAccount);
      if (res && typeof res.quota_bytes === "number") {
        setData(res);
      } else {
        throw new Error("Invalid response");
      }
    } catch {
      // Fallback from session user
      const quota = user?.quota_bytes && user.quota_bytes > 0 ? user.quota_bytes : 0;
      const used = user?.quota_bytes_used ?? 0;
      const free = quota > 0 ? Math.max(0, quota - used) : -1;
      setData({
        quota_bytes: quota,
        used_bytes: used,
        free_bytes: free,
        usage_percent: quota > 0 ? (used / quota) * 100 : 0,
        categories: {
          images: { bytes: 0, count: 0 },
          videos: { bytes: 0, count: 0 },
          documents: { bytes: 0, count: 0 },
          audio: { bytes: 0, count: 0 },
          other: { bytes: 0, count: 0 },
          trash: { bytes: 0, count: 0 },
        },
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div style={{ padding: 24 }}>
        <ListSkeleton rows={3} />
      </div>
    );
  }

  const quota = data?.quota_bytes ?? (user?.quota_bytes ?? 0);
  const isUnlimited = !quota || quota <= 0;
  const used = data?.used_bytes ?? 0;
  const free = isUnlimited ? -1 : (data?.free_bytes ?? Math.max(0, quota - used));
  const percentUsed = !isUnlimited && quota > 0 ? Math.min(100, Math.max(0, (used / quota) * 100)) : 0;
  const isWarn = percentUsed >= 95;

  const categories = data?.categories ?? {
    images: { bytes: 0, count: 0 },
    videos: { bytes: 0, count: 0 },
    documents: { bytes: 0, count: 0 },
    audio: { bytes: 0, count: 0 },
    other: { bytes: 0, count: 0 },
    trash: { bytes: 0, count: 0 },
  };

  const categoryItems: Array<{
    id: string;
    label: string;
    glyph: Glyph;
    bytes: number;
    count: number;
    color: string;
    bg: string;
  }> = [
    {
      id: "images",
      label: "Hình ảnh",
      glyph: "image",
      bytes: categories.images?.bytes ?? 0,
      count: categories.images?.count ?? 0,
      color: "#3B82F6",
      bg: "rgba(59, 130, 246, 0.12)",
    },
    {
      id: "videos",
      label: "Video",
      glyph: "video",
      bytes: categories.videos?.bytes ?? 0,
      count: categories.videos?.count ?? 0,
      color: "#8B5CF6",
      bg: "rgba(139, 92, 246, 0.12)",
    },
    {
      id: "documents",
      label: "Tài liệu",
      glyph: "file",
      bytes: categories.documents?.bytes ?? 0,
      count: categories.documents?.count ?? 0,
      color: "#F59E0B",
      bg: "rgba(245, 158, 11, 0.12)",
    },
    {
      id: "audio",
      label: "Âm thanh",
      glyph: "audio",
      bytes: categories.audio?.bytes ?? 0,
      count: categories.audio?.count ?? 0,
      color: "#10B981",
      bg: "rgba(16, 185, 129, 0.12)",
    },
    {
      id: "other",
      label: "Tệp khác",
      glyph: "folder",
      bytes: categories.other?.bytes ?? 0,
      count: categories.other?.count ?? 0,
      color: "#64748B",
      bg: "rgba(100, 116, 139, 0.12)",
    },
    {
      id: "trash",
      label: "Thùng rác",
      glyph: "trash",
      bytes: categories.trash?.bytes ?? 0,
      count: categories.trash?.count ?? 0,
      color: "#EF4444",
      bg: "rgba(239, 68, 68, 0.12)",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", overflowX: "hidden" }}>
      {/* Header */}
      {isDesktop ? (
        <header
          style={{
            height: 64,
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--stroke)",
            background: "var(--bg-primary)",
            flex: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon glyph="storage" size={22} color="var(--accent)" />
            <h1 className="t-title-lg" style={{ margin: 0 }}>
              {t.storage}
            </h1>
          </div>
          <Tappable onClick={() => void load()} radius={999} style={{ padding: 8 }} title={t.actionRefresh}>
            <Icon glyph="refresh" size={18} />
          </Tappable>
        </header>
      ) : null}

      <div style={{ padding: isDesktop ? "24px 32px" : "16px", maxWidth: 960, width: "100%", margin: "0 auto" }}>
        {/* Hero Account Storage Card */}
        <div
          style={{
            padding: 24,
            background: "var(--bg-elevated)",
            borderRadius: "var(--r-card)",
            border: "1px solid var(--stroke)",
            marginBottom: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  color: "var(--accent)",
                  background: "rgba(76, 141, 255, 0.12)",
                  padding: "4px 10px",
                  borderRadius: 999,
                }}
              >
                Bộ nhớ tài khoản
              </span>
            </div>
            <span style={{ fontSize: 13, color: "var(--fg-secondary)", fontWeight: 500 }}>
              {isUnlimited ? "Gói Không giới hạn" : `Gói tiêu chuẩn ${bytes(quota)}`}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1, color: "var(--fg-primary)" }}>
              {bytes(used)}
            </span>
            <span style={{ fontSize: 16, color: "var(--fg-secondary)", fontWeight: 500 }}>
              / {isUnlimited ? "Không giới hạn" : bytes(quota)}
            </span>
          </div>

          {/* Smooth modern progress bar */}
          <div
            style={{
              height: 10,
              borderRadius: 999,
              background: "var(--bg-sunken)",
              overflow: "hidden",
              marginBottom: 12,
              display: "flex",
              width: "100%",
            }}
          >
            <div
              style={{
                height: "100%",
                width: isUnlimited ? (used > 0 ? "100%" : "0%") : `${percentUsed}%`,
                minWidth: used > 0 ? 4 : 0,
                background: isWarn ? "var(--warning)" : "var(--accent)",
                borderRadius: 999,
                transition: "width 0.4s ease",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span className="t-body-sm" style={{ color: "var(--fg-secondary)", fontWeight: 500 }}>
              Đã dùng {bytes(used)}
            </span>
            <span className="t-body-sm" style={{ color: "var(--fg-secondary)", fontWeight: 500 }}>
              Còn {isUnlimited ? "Không giới hạn" : bytes(free)}
            </span>
          </div>
        </div>

        {/* Category Breakdown Section */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ padding: "0 4px 12px", fontSize: 13, fontWeight: 600, color: "var(--fg-secondary)", letterSpacing: 0.2 }}>
            Chi tiết lưu trữ theo loại tệp
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isDesktop ? "repeat(3, 1fr)" : "repeat(2, 1fr)",
              gap: 12,
            }}
          >
            {categoryItems.map((cat) => (
              <div
                key={cat.id}
                style={{
                  padding: "16px 18px",
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--r-card)",
                  border: "1px solid var(--stroke)",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: cat.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon glyph={cat.glyph} size={22} color={cat.color} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-primary)", marginBottom: 2 }}>
                    {cat.label}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {bytes(cat.bytes)}, {cat.count} tệp
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Account Plan Details Card */}
        <div
          style={{
            padding: 20,
            background: "var(--bg-elevated)",
            borderRadius: "var(--r-card)",
            border: "1px solid var(--stroke)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name={user?.display_name || user?.username || "Admin"} seed={user?.avatar_seed} size={44} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-primary)" }}>
                {user?.display_name || user?.username || "Tài khoản"}
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-secondary)", marginTop: 2 }}>
                @{user?.username || "admin"}, {user?.role === "admin" ? "Quản trị viên" : "Thành viên"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#10B981",
              }}
            />
            <span style={{ fontSize: 13, color: "var(--fg-secondary)", fontWeight: 500 }}>
              Đồng bộ hóa đám mây an toàn
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- activity */

interface ActivityRow {
  id: string;
  action: string;
  created_at: number;
  username?: string;
}

export function ActivityScreen() {
  const t = useL10n();
  const {
    items,
    loading,
    Sentinel,
  } = useInfiniteList<ActivityRow>({
    pageSize: 30,
    getItemKey: (a) => a.id,
    fetchPage: async ({ offset, limit, signal }) => {
      try {
        const res = await api.get<{
          activity?: ActivityRow[];
          entries?: ActivityRow[];
          has_more?: boolean;
          next_cursor?: number;
        }>(
          Api.activity,
          {
            limit,
            before: offset > 0 ? offset : undefined,
            all: true,
          },
          { signal }
        );
        const list = (res?.activity ?? res?.entries ?? []) as ActivityRow[];
        const lastItem = list.length > 0 ? list[list.length - 1] : null;
        return {
          items: list,
          hasMore: Boolean(res?.has_more ?? (list.length >= limit)),
          nextOffset: res?.next_cursor || (lastItem ? lastItem.created_at : 0),
        };
      } catch {
        return { items: [], hasMore: false };
      }
    },
  });

  return (
    <Page title={t.activity}>
      {loading && items.length === 0 ? (
        <ListSkeleton rows={6} />
      ) : items.length === 0 ? (
        <EmptyState glyph="activity" title={t.emptyActivityTitle} message={t.activity} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 16px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--stroke)",
                borderRadius: "var(--r-card)",
              }}
            >
              <Icon glyph="activity" size={18} color="var(--fg-secondary)" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-body-md" style={{ display: "block" }}>
                  {a.action.replace(/[._]/g, " ")}
                </span>
                <span className="t-body-sm" style={{ color: "var(--fg-secondary)" }}>
                  {a.username ? `${a.username} · ` : ""}
                  {dateTime(a.created_at)}
                </span>
              </span>
            </div>
          ))}
          <Sentinel />
        </div>
      )}
    </Page>
  );
}

/* -------------------------------------------------------------- transfers */

export { Page as SettingsPage };
