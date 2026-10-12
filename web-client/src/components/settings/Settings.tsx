"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon, type Glyph } from "@/components/Icon";
import {
  Avatar,
  Button,
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
import type { DeviceModel, LibraryModel, UserModel } from "@/lib/models";
import { useL10n, type Strings } from "@/lib/l10n";
import { HIDE_TWO_FACTOR } from "@/lib/flags";
import { useSession } from "@/lib/session";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import { useTheme } from "@/lib/theme";

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
  | "users"
  | "server"
  | "about";

/** Declared once, in the app's order. Users and server are admin only. */
const sections: { id: SectionId; key: keyof Strings; glyph: Glyph; adminOnly?: boolean }[] = [
  { id: "account", key: "settingsAccount", glyph: "person" },
  { id: "appearance", key: "settingsAppearance", glyph: "eye" },
  { id: "devices", key: "devices", glyph: "device" },
  { id: "language", key: "settingsLanguage", glyph: "language" },
  { id: "two-factor", key: "settingsTwoFactor", glyph: "lock" },
  { id: "downloads", key: "offlineDownloadsTitle", glyph: "offlineReady" },
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
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (initialSection && initialSection !== "root") {
      setDesktopSection(initialSection as SectionId);
      setMobileSection(initialSection as SectionId);
    }
  }, [initialSection]);

  const selectSection = (id: SectionId) => {
    setDesktopSection(id);
    onSelectSection?.(id);
  };

  const visibleSections = sections
    .filter((s) => !s.adminOnly || isAdmin)
    .filter((s) => s.id !== "two-factor" || !HIDE_TWO_FACTOR);

  if (!isDesktop) {
    if (mobileSection !== "root") {
      return <Detail section={mobileSection} onBack={() => setMobileSection("root")} />;
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
                onClick={() => setMobileSection(s.id)}
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflowX: "hidden" }}>
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
            width: 220,
            flex: "0 0 220px",
            minWidth: 220,
            maxWidth: 220,
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

        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", overflowX: "hidden", padding: 24 }}>
          <div style={{ maxWidth: 640 }}>
            <Detail section={desktopSection} embedded />
          </div>
        </main>
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
    case "language":
      return <LanguageSection onBack={onBack} embedded={embedded} />;
    case "downloads":
      return <DownloadsSection onBack={onBack} embedded={embedded} />;
    case "two-factor":
      return <TwoFactorSection onBack={onBack} embedded={embedded} />;
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

  if (!user) return null;

  const change = async () => {
    if (next !== confirm) {
      setError(t.passwordsDoNotMatch);
      return;
    }
    if (next.length < 10) {
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
          <div className="t-title-sm" style={{ fontWeight: 600 }}>{user.display_name || user.username}</div>
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

function UsersSection({ onBack, embedded }: { onBack?: () => void; embedded?: boolean }) {
  const t = useL10n();
  const toast = useToast();
  const [items, setItems] = useState<UserModel[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteLabel, setInviteLabel] = useState("");
  const [createdInvite, setCreatedInvite] = useState<{ code: string; link: string } | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserModel | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ users: UserModel[] }>(Api.adminUsers);
      setItems(data?.users ?? []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteLabel.trim()) return;
    try {
      const res = await api.post<{ code: string; link: string }>(Api.invites, { label: inviteLabel.trim() });
      setCreatedInvite(res);
      setInviteLabel("");
      void load();
    } catch (err) {
      toast(err instanceof Error ? err.message : t.errorUnexpectedTitle, "error");
    }
  };

  const handleResetPassword = async (user: UserModel) => {
    try {
      await api.post(`${Api.adminUsers}/${user.id}/reset-password`, {});
      toast(t.usersResetPassword, "success");
      setSelectedUser(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : t.errorUnexpectedTitle, "error");
    }
  };

  const handleToggleRole = async (user: UserModel) => {
    try {
      const nextRole = user.role === "admin" ? "member" : "admin";
      await api.patch(`${Api.adminUsers}/${user.id}`, { role: nextRole });
      toast(nextRole === "admin" ? t.usersMakeAdmin : t.usersMakeMember, "success");
      setSelectedUser(null);
      void load();
    } catch (err) {
      toast(err instanceof Error ? err.message : t.errorUnexpectedTitle, "error");
    }
  };

  return (
    <Page title={t.settingsUsers} onBack={onBack} embedded={embedded}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 className="t-title-sm" style={{ margin: 0, fontWeight: 600 }}>{t.settingsUsers}</h2>
        <Button
          label={t.usersInviteSomeone}
          glyph="qr"
          compact
          expand={false}
          onClick={() => {
            setCreatedInvite(null);
            setInviting(true);
          }}
        />
      </div>

      {items === null ? (
        <ListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState glyph="people" title={t.emptyUsersTitle} message={t.emptyUsersBody} compact />
      ) : (
        <SettingGroup>
          {items.map((u, i) => {
            const desc = [
              u.role === "admin" ? t.roleAdmin : t.roleMember,
              u.quota_bytes > 0
                ? t.storageUsedOf({ used: bytes(u.quota_bytes_used), total: bytes(u.quota_bytes) })
                : t.sidebarStorageUsed({ used: bytes(u.quota_bytes_used) }),
            ].join("  ·  ");

            return (
              <SettingRow
                key={u.id}
                showDivider={i > 0}
                label={u.display_name || u.username}
                description={desc}
                trailing={<Avatar name={u.display_name || u.username} seed={u.avatar_seed} size={34} />}
                onTap={() => setSelectedUser(u)}
              />
            );
          })}
        </SettingGroup>
      )}

      {/* Invite Sheet */}
      <Sheet
        open={inviting}
        onClose={() => setInviting(false)}
        title={createdInvite ? t.invite : t.usersInviteSomeone}
        subtitle={createdInvite ? t.usersInviteCreated : undefined}
      >
        {createdInvite ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                padding: "16px",
                background: "var(--bg-primary)",
                border: "1px solid var(--stroke)",
                borderRadius: "var(--r-field)",
                fontFamily: "var(--font-mono)",
                fontSize: 18,
                fontWeight: 600,
                textAlign: "center",
                letterSpacing: 2,
              }}
            >
              {createdInvite.code}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Button
                label={t.actionCopyCode}
                variant="secondary"
                compact
                onClick={async () => {
                  await navigator.clipboard.writeText(createdInvite.code);
                  toast(t.actionCopied, "success");
                }}
              />
              <Button
                label={t.actionCopyLink}
                compact
                onClick={async () => {
                  const link = window.location.origin + createdInvite.link;
                  await navigator.clipboard.writeText(link);
                  toast(t.actionCopied, "success");
                }}
              />
            </div>
            <Button label={t.actionDone} variant="secondary" onClick={() => setInviting(false)} />
          </div>
        ) : (
          <form onSubmit={handleCreateInvite} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <TextField
              value={inviteLabel}
              onChange={setInviteLabel}
              hint={t.usersInviteHint}
              autoFocus
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button label={t.actionCancel} variant="secondary" compact onClick={() => setInviting(false)} />
              <Button label={t.invite} compact type="submit" />
            </div>
          </form>
        )}
      </Sheet>

      {/* User Manage Context Sheet */}
      <Sheet
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title={selectedUser?.display_name || selectedUser?.username || ""}
      >
        {selectedUser && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SettingRow
              glyph="lock"
              label={t.usersResetPassword}
              onTap={() => handleResetPassword(selectedUser)}
            />
            <SettingRow
              showDivider
              glyph="person"
              label={selectedUser.role === "admin" ? t.usersMakeMember : t.usersMakeAdmin}
              onTap={() => handleToggleRole(selectedUser)}
            />
          </div>
        )}
      </Sheet>
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
      await api.patch(Api.settings, patch);
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
          />
          <Button
            label={t.actionSave}
            onClick={async () => {
              await apply({ server_name: name.trim() });
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
        <AboutRow showDivider label={t.updateCheck} value={t.updateManualOnly} />
      </SettingGroup>

      <SettingGroup title="Project">
        <AboutRow label="Name" value="Local Drive" />
        <AboutRow showDivider label="Type" value="Self-hosted Private Cloud" />
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

export function StorageScreen() {
  const t = useL10n();
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const { isDesktop } = useDeviceClass();
  const [data, setData] = useState<{
    libraries: LibraryModel[];
    total_used: number;
    total_free: number;
    total_bytes: number;
  } | null>(null);
  const [drives, setDrives] = useState<{ drives: unknown[]; helper_available: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{
        libraries: LibraryModel[];
        total_used?: number;
        total_free?: number;
        total_bytes?: number;
      }>(Api.libraries);
      setData({
        libraries: res?.libraries ?? [],
        total_used: res?.total_used ?? 0,
        total_free: res?.total_free ?? 0,
        total_bytes: res?.total_bytes ?? 0,
      });
    } catch {
      setData({ libraries: [], total_used: 0, total_free: 0, total_bytes: 0 });
    }

    if (isAdmin) {
      try {
        const dRes = await api.get<{ drives: unknown[]; helper_available: boolean }>(`${Api.prefix}/drives`);
        setDrives(dRes ?? { drives: [], helper_available: false });
      } catch {
        setDrives({ drives: [], helper_available: false });
      }
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <div style={{ padding: 24 }}>
        <ListSkeleton rows={3} />
      </div>
    );
  }

  const used = isAdmin || !user ? data.total_used : user.quota_bytes_used;
  const total = isAdmin || !user ? data.total_bytes : (user.quota_bytes || data.total_bytes);
  const caption = isAdmin || !user ? t.storageTotal : t.storageYours;
  const usedPercent = total > 0 ? (used / total) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", overflowX: "hidden" }}>
      {/* 64px header matching DesktopScaffold */}
      {isDesktop ? (
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
            {t.storage}
          </h1>
          <Tappable onClick={() => void load()} radius={999} style={{ padding: 8 }} title={t.actionRefresh}>
            <Icon glyph="refresh" size={18} />
          </Tappable>
        </header>
      ) : null}

      <div style={{ padding: isDesktop ? 13 : "max(12px, env(safe-area-inset-top)) 16px 24px", maxWidth: isDesktop ? undefined : 640 }}>
        {/* StorageTotalCard */}
        <div
          style={{
            padding: 20,
            background: "var(--bg-elevated)",
            borderRadius: "var(--r-card)",
            border: "1px solid var(--stroke)",
            marginBottom: 13,
          }}
        >
          <div className="t-label-sm" style={{ color: "var(--fg-secondary)", marginBottom: 10 }}>
            {caption}
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, lineHeight: "38px", color: "var(--fg-primary)", marginBottom: 16 }}>
            {bytes(used)}
          </div>
          {/* LdUsageBar */}
          <div style={{ height: 8, borderRadius: 999, background: "var(--bg-sunken)", overflow: "hidden", marginBottom: 8 }}>
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, Math.max(0, usedPercent))}%`,
                background: "var(--accent)",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="t-body-sm" style={{ color: "var(--fg-secondary)" }}>
              {t.storageUsedOf({ used: bytes(used), total: bytes(total) })}
            </span>
            <span className="t-body-sm" style={{ color: "var(--fg-secondary)" }}>
              {t.libraryFreeSpace({ free: bytes(data.total_free) })}
            </span>
          </div>
        </div>

        {/* 2 columns on desktop: libraries on left (flex 3), detected drives on right (flex 2) */}
        <div style={{ display: "flex", flexDirection: isDesktop ? "row" : "column", gap: isDesktop ? 24 : 14, alignItems: "flex-start" }}>
          {/* Left: Library Cards */}
          <div style={{ flex: isDesktop ? 3 : undefined, width: "100%", minWidth: 0 }}>
            {data.libraries.map((l) => {
              const isOnline = l.online ?? (l.status === undefined || l.status === "online");
              const libUsed = isAdmin ? (l.bytes_used ?? 0) : 0;
              const libTotal = (l.stats_known ?? true) ? (l.total_bytes ?? 0) : 0;
              const libFree = (l.stats_known ?? true) ? (l.free_bytes ?? 0) : 0;
              const libPercent = libTotal > 0 ? (libUsed / libTotal) * 100 : 0;

              return (
                <div
                  key={l.id}
                  style={{
                    padding: 18,
                    background: "var(--bg-elevated)",
                    borderRadius: "var(--r-card)",
                    border: `1px solid ${isOnline ? "var(--stroke)" : "var(--warning)"}`,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Icon glyph="storage" size={20} color={isOnline ? "var(--fg-primary)" : "var(--warning)"} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="t-title-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.name}
                      </div>
                      {!isOnline && (
                        <div className="t-body-sm" style={{ color: "var(--warning)", marginTop: 2 }}>
                          {t.storageOffline}
                        </div>
                      )}
                    </div>
                    {l.is_default && (
                      <span
                        style={{
                          padding: "4px 9px",
                          borderRadius: 9,
                          background: "rgba(76, 141, 255, 0.12)",
                          color: "var(--accent)",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {t.storageDefault}
                      </span>
                    )}
                  </div>

                  {/* LdUsageBar inside library card */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ height: 6, borderRadius: 999, background: "var(--bg-sunken)", overflow: "hidden", marginBottom: 8 }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(100, Math.max(0, libPercent))}%`,
                          background: "var(--accent)",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="t-body-sm" style={{ color: "var(--fg-secondary)" }}>
                        {isAdmin && libUsed > 0 ? bytes(libUsed) : ""}
                      </span>
                      <span className="t-body-sm" style={{ color: "var(--fg-secondary)" }}>
                        {(l.stats_known ?? true) ? t.libraryFreeSpace({ free: bytes(libFree) }) : t.storageOffline}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Detected Drives (matching Flutter DetectedDrives) */}
          {isAdmin && isDesktop && (
            <div style={{ flex: 2, width: "100%", minWidth: 0 }}>
              <div style={{ padding: "4px 8px 12px", fontSize: 12, fontWeight: 600, color: "var(--fg-secondary)", letterSpacing: 0.3 }}>
                {t.storageDetectedDrives}
              </div>
              <div
                style={{
                  padding: "40px 20px",
                  background: "transparent",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                <div style={{ marginBottom: 16 }}>
                  <LayeredBadge glyph="storage" size={72} />
                </div>
                <div className="t-title-sm" style={{ fontWeight: 600, marginBottom: 8 }}>
                  {t.storageDetectedDrives}
                </div>
                <div className="t-body-sm" style={{ color: "var(--fg-secondary)", maxWidth: 300, lineHeight: 1.5 }}>
                  {t.storageHelperUnavailable}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- activity */

export function ActivityScreen() {
  const t = useL10n();
  const [items, setItems] = useState<{ id: string; action: string; created_at: number; username?: string }[] | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api.get<{ entries?: unknown[]; activity?: unknown[] }>(Api.activity);
        const list = (data?.entries ?? data?.activity ?? []) as typeof items;
        setItems(list ?? []);
      } catch {
        setItems([]);
      }
    })();
  }, []);

  return (
    <Page title={t.activity}>
      {items === null ? (
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
        </div>
      )}
    </Page>
  );
}

/* -------------------------------------------------------------- transfers */

export { Page as SettingsPage };
