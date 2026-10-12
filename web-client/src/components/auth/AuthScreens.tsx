"use client";

import { useState } from "react";
import { Mark } from "@/components/Mark";
import { Button, Spinner, TextField, Tappable, useToast, useDeviceClass } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Icon } from "@/components/Icon";
import { normaliseServer } from "@/lib/api";
import { useL10n, type Locale } from "@/lib/l10n";
import { HIDE_TWO_FACTOR } from "@/lib/flags";
import { useSession } from "@/lib/session";

/*
  Ported screen by screen from localdrive/lib/features/onboarding/pages and
  features/auth/pages, with the strings taken from lib/l10n/app_en.arb rather
  than written again here. Where the two disagree the Flutter client is right
  and this file is the bug.
*/

/** LdScaffold: an optional back button, actions on the trailing side, and a
 *  body centred inside contentMaxWidth. */
function Scaffold({
  children,
  onBack,
  actions,
}: {
  children: React.ReactNode;
  onBack?: () => void;
  actions?: React.ReactNode;
}) {
  const t = useL10n();
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "max(12px, env(safe-area-inset-top)) 12px 4px",
          minHeight: 56,
        }}
      >
        {onBack ? (
          <Tappable onClick={onBack} radius={999} style={{ padding: 10 }} title={t.actionBack}>
            <Icon glyph="chevron-left" size={22} />
          </Tappable>
        ) : (
          <span style={{ width: 8 }} />
        )}
        <span style={{ flex: 1 }} />
        {actions}
      </header>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 20px 32px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "var(--content-max)" }}>{children}</div>
      </div>
    </div>
  );
}

/** LdLanguageToggle(compact: true): the globe and the current language. */
export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useSession();
  const next: Record<Locale, Locale> = { vi: "en", en: "ar", ar: "vi" };
  const labels: Record<Locale, string> = { vi: "Tiếng Việt", en: "English", ar: "العربية" };
  return (
    <Tappable
      onClick={() => setLocale(next[locale] ?? "vi")}
      radius={999}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: compact ? "6px 12px" : "8px 14px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--stroke)",
        borderRadius: "var(--r-pill)",
      }}
    >
      <Icon glyph="globe" size={16} color="var(--fg-secondary)" />
      <span className="t-label-sm" style={{ color: "var(--fg-primary)", fontWeight: 500 }}>
        {labels[locale] ?? "Tiếng Việt"}
      </span>
    </Tappable>
  );
}

export type OnboardingStep = "welcome" | "connect" | "language" | "account";

/**
 * The desktop frame for onboarding matching OnboardingDesktopShell in Flutter.
 */
export function OnboardingDesktopShell({
  step,
  title,
  subtitle,
  children,
  onBack,
}: {
  step: OnboardingStep;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  const t = useL10n();

  const steps: { id: OnboardingStep; label: string; index: number }[] = [
    { id: "welcome", label: t.welcomeTitle, index: 1 },
    { id: "connect", label: t.connectTitle, index: 2 },
    { id: "language", label: t.languageTitle, index: 3 },
    { id: "account", label: t.signInTitle, index: 4 },
  ];

  const stepOrder: Record<OnboardingStep, number> = {
    welcome: 1,
    connect: 2,
    language: 3,
    account: 4,
  };

  const currentIdx = stepOrder[step];
  const markStage =
    step === "welcome"
      ? "closed"
      : step === "connect"
      ? "connected"
      : step === "language"
      ? "syncing"
      : "complete";

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        backgroundColor: "var(--bg-primary)",
      }}
    >
      {/* the rail: brand, then the full path through first run */}
      <div
        style={{
          width: 340,
          flexShrink: 0,
          backgroundColor: "var(--bg-sunken)",
          borderRight: "1px solid var(--stroke)",
          padding: "40px 36px",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Mark size={40} stage={markStage} />
          <span
            className="t-title-md"
            style={{ fontWeight: 600, color: "var(--fg-primary)", fontSize: 17 }}
          >
            {t.appName}
          </span>
        </div>

        <div style={{ height: 48 }} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          {steps.map((s) => {
            const isDone = s.index < currentIdx;
            const isCurrent = s.index === currentIdx;
            const active = isDone || isCurrent;
            const borderColor = isCurrent
              ? "var(--accent)"
              : isDone
              ? "rgba(76, 141, 255, 0.45)"
              : "var(--stroke)";

            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  marginBottom: 22,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    backgroundColor: isCurrent ? "var(--accent)" : "transparent",
                    border: `1.5px solid ${borderColor}`,
                    flexShrink: 0,
                    transition: "all var(--d-hover) var(--ease)",
                  }}
                >
                  {isDone ? (
                    <Icon glyph="check" size={14} color="var(--accent)" />
                  ) : (
                    <span
                      className="t-label-sm"
                      style={{
                        color: isCurrent ? "#ffffff" : "var(--fg-muted)",
                        fontSize: 12,
                        fontWeight: 600,
                        lineHeight: 1,
                      }}
                    >
                      {s.index}
                    </span>
                  )}
                </div>
                <span
                  className="t-body-md"
                  style={{
                    color: active ? "var(--fg-primary)" : "var(--fg-muted)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontSize: 14,
                  }}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <ThemeToggle compact />
          </div>
          <div>
            <LanguageToggle compact />
          </div>
        </div>
      </div>

      {/* the step itself */}
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          minHeight: "100dvh",
          overflowY: "auto",
        }}
      >
        {onBack && (
          <div style={{ position: "absolute", top: 24, left: 24, zIndex: 10 }}>
            <Tappable
              onClick={onBack}
              radius={999}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                color: "var(--accent)",
              }}
            >
              <Icon glyph="chevron-left" size={18} />
              <span className="t-label-lg">{t.actionBack}</span>
            </Tappable>
          </div>
        )}

        <div
          style={{
            position: "absolute",
            top: 24,
            right: 24,
            zIndex: 10,
          }}
        >
          <ThemeToggle compact />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 64px",
            boxSizing: "border-box",
          }}
        >
          <div style={{ width: "100%", maxWidth: 480 }}>
            <h1
              className="t-display"
              style={{
                margin: 0,
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--fg-primary)",
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className="t-body-lg"
                style={{
                  margin: "12px 0 0",
                  color: "var(--fg-secondary)",
                  fontSize: 16,
                  lineHeight: 1.5,
                }}
              >
                {subtitle}
              </p>
            )}
            <div style={{ marginTop: 36 }}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- welcome */

export function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  const t = useL10n();
  const { isDesktop } = useDeviceClass();

  if (isDesktop) {
    return (
      <OnboardingDesktopShell
        step="welcome"
        title={t.welcomeTitle}
        subtitle={t.welcomeBody}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ marginTop: 2 }}>
              <Icon glyph="server" size={20} color="var(--accent)" />
            </div>
            <p className="t-body-md" style={{ margin: 0, color: "var(--fg-secondary)", lineHeight: 1.5 }}>
              {t.welcomePointHardware}
            </p>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ marginTop: 2 }}>
              <Icon glyph="lock" size={20} color="var(--accent)" />
            </div>
            <p className="t-body-md" style={{ margin: 0, color: "var(--fg-secondary)", lineHeight: 1.5 }}>
              {t.welcomePointKeys}
            </p>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ marginTop: 2 }}>
              <Icon glyph="device" size={20} color="var(--accent)" />
            </div>
            <p className="t-body-md" style={{ margin: 0, color: "var(--fg-secondary)", lineHeight: 1.5 }}>
              {t.welcomePointDevices}
            </p>
          </div>
          <div style={{ marginTop: 24, alignSelf: "flex-start" }}>
            <Button label={t.welcomeStart} onClick={onContinue} expand={false} />
          </div>
        </div>
      </OnboardingDesktopShell>
    );
  }

  return (
    <Scaffold actions={<LanguageToggle />}>
      <div className="ld-enter" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Mark size={96} />
        <h1 className="t-display" style={{ margin: "28px 0 10px" }}>
          {t.welcomeTitle}
        </h1>
        <p className="t-body-lg" style={{ color: "var(--fg-secondary)", margin: 0, maxWidth: 460 }}>
          {t.welcomeBody}
        </p>
        <div style={{ width: "100%", marginTop: 32 }}>
          <Button label={t.welcomeStart} onClick={onContinue} />
        </div>
      </div>
    </Scaffold>
  );
}

/* -------------------------------------------------------------- language */

export function LanguageScreen({ onDone, onBack }: { onDone: () => void; onBack?: () => void }) {
  const t = useL10n();
  const { locale, setLocale } = useSession();
  const { isDesktop } = useDeviceClass();
  const options: { id: Locale; label: string; sample: string }[] = [
    { id: "en", label: "English", sample: "Your files, on your machine" },
    { id: "vi", label: "Tiếng Việt", sample: "Tệp của bạn, trên máy của bạn" },
    { id: "ar", label: "العربية", sample: "ملفاتك، على جهازك" },
  ];

  if (isDesktop) {
    return (
      <OnboardingDesktopShell
        step="language"
        title={t.languageTitle}
        onBack={onBack}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {options.map((o) => {
            const active = locale === o.id;
            return (
              <Tappable
                key={o.id}
                onClick={() => setLocale(o.id)}
                radius={16}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "20px 16px",
                  border: `1px solid ${active ? "var(--accent)" : "var(--stroke)"}`,
                  background: active ? "rgba(76,141,255,0.10)" : "var(--bg-elevated)",
                }}
              >
                <span className="t-title-sm" style={{ fontWeight: 600 }}>{o.label}</span>
                <span className="t-body-xs" style={{ color: "var(--fg-muted)" }}>{o.sample}</span>
              </Tappable>
            );
          })}
        </div>
        <div style={{ marginTop: 32, alignSelf: "flex-start" }}>
          <Button label={t.actionContinue} onClick={onDone} expand={false} />
        </div>
      </OnboardingDesktopShell>
    );
  }

  return (
    <Scaffold onBack={onBack}>
      <div className="ld-enter" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Mark size={72} />
        <h1 className="t-headline" style={{ margin: "26px 0 24px", textAlign: "center" }}>
          {t.languageTitle}
        </h1>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
          {options.map((o) => {
            const active = locale === o.id;
            return (
              <Tappable
                key={o.id}
                onClick={() => setLocale(o.id)}
                radius={16}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "18px 20px",
                  width: "100%",
                  border: `1px solid ${active ? "var(--accent)" : "var(--stroke)"}`,
                  background: active ? "rgba(76,141,255,0.10)" : "var(--bg-elevated)",
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    border: `2px solid ${active ? "var(--accent)" : "var(--fg-muted)"}`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {active && <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--accent)" }} />}
                </span>
                <span className="t-title-sm" dir={o.id === "ar" ? "rtl" : "ltr"}>
                  {o.label}
                </span>
              </Tappable>
            );
          })}
        </div>
        <div style={{ width: "100%", marginTop: 28 }}>
          <Button label={t.actionContinue} onClick={onDone} />
        </div>
      </div>
    </Scaffold>
  );
}

/* --------------------------------------------------------------- connect */

/**
 * DiscoveryRadar.
 *
 * The Flutter clients find servers over mDNS and draw them on a radar. A page
 * in a browser has no mDNS and cannot get one, so the radar is drawn in its
 * resting state and says so, rather than sweeping forever for something it can
 * never find. Typing the address is the supported path here.
 */
function DiscoveryRadar() {
  return (
    <div
      style={{
        position: "relative",
        height: 200,
        display: "grid",
        placeItems: "center",
        marginBottom: 4,
      }}
    >
      {[1, 0.68, 0.36].map((scale) => (
        <span
          key={scale}
          style={{
            position: "absolute",
            width: 180 * scale,
            height: 180 * scale,
            borderRadius: 999,
            border: "1px solid var(--stroke)",
          }}
        />
      ))}
      <span
        style={{
          position: "relative",
          width: 52,
          height: 52,
          borderRadius: 999,
          background: "var(--bg-elevated)",
          border: "1px solid var(--stroke)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <Icon glyph="server" size={22} color="var(--fg-secondary)" />
      </span>
      <span
        className="t-body-sm"
        style={{ position: "absolute", bottom: 4, color: "var(--fg-muted)", textAlign: "center" }}
      >
        A browser cannot search the network. Type the address below.
      </span>
    </div>
  );
}

export function ConnectScreen({ onBack }: { onBack?: () => void }) {
  const t = useL10n();
  const { connect } = useSession();
  const { isDesktop } = useDeviceClass();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const go = async () => {
    const url = normaliseServer(address);
    if (!url) {
      setError("That does not look like an address.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await connect(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.couldNotReachServer);
    } finally {
      setBusy(false);
    }
  };

  if (isDesktop) {
    return (
      <OnboardingDesktopShell
        step="connect"
        title={t.connectTitle}
        subtitle={t.connectBody}
        onBack={onBack}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <TextField
            value={address}
            onChange={setAddress}
            label={t.enterAddressManually}
            hint={t.addressHint}
            glyph="server"
            error={error}
            autoFocus
            onEnter={go}
            dir="ltr"
          />
          <div style={{ alignSelf: "flex-start" }}>
            <Button label={t.connectAction} onClick={go} busy={busy} expand={false} />
          </div>
        </div>
      </OnboardingDesktopShell>
    );
  }

  return (
    <Scaffold onBack={onBack} actions={<LanguageToggle />}>
      <div className="ld-enter">
        <h1 className="t-headline" style={{ margin: 0, textAlign: "center" }}>
          Connect to a server
        </h1>
        <p className="t-body-md" style={{ color: "var(--fg-secondary)", textAlign: "center", margin: "10px 0 24px" }}>
          Pick one found on your network, or type its address.
        </p>

        <DiscoveryRadar />

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <Tappable radius={10} style={{ padding: "8px 12px" }} onClick={() => undefined}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--accent)" }}>
              <Icon glyph="refresh" size={17} />
              <span className="t-label-lg">{t.scanAgain}</span>
            </span>
          </Tappable>
        </div>

        <TextField
          value={address}
          onChange={setAddress}
          label={t.enterAddressManually}
          hint={t.addressHint}
          glyph="server"
          error={error}
          autoFocus
          onEnter={go}
          dir="ltr"
        />
        <div style={{ height: 20 }} />
        <Button label={t.connectAction} onClick={go} busy={busy} />
      </div>
    </Scaffold>
  );
}

/* --------------------------------------------------------------- sign in */

export function SignInScreen({
  createMode = false,
  inviteCode: initialInviteCode = "",
  onToggleMode,
}: {
  createMode?: boolean;
  inviteCode?: string;
  onToggleMode?: (createMode: boolean) => void;
} = {}) {
  const t = useL10n();
  const { signIn, register, server, forgetServer } = useSession();
  const { isDesktop } = useDeviceClass();
  const toast = useToast();
  const [creating, setCreating] = useState(createMode || Boolean(initialInviteCode));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [totp, setTotp] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isLocalhost = !server || server.includes("localhost") || server.includes("127.0.0.1");
  const name = isLocalhost ? t.appName : server.replace(/^https?:\/\//, "");

  const go = async () => {
    if (!username.trim() || !password) {
      setError("Type a username and a password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (creating) {
        await register(username.trim(), password, inviteCode.trim() || undefined);
      } else {
        await signIn(username.trim(), password, needsTotp ? totp.trim() : undefined);
      }
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/files");
      }
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (!HIDE_TWO_FACTOR && (err.code === "totp_required" || err.code === "totp_invalid")) {
        setNeedsTotp(true);
        setError(err.code === "totp_invalid" ? t.errorUnexpectedTitle : "");
        if (err.code !== "totp_invalid") toast(t.twoFactorHint);
      } else {
        setError(err.message ?? t.errorUnexpectedTitle);
      }
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => {
    const next = !creating;
    setCreating(next);
    setError("");
    onToggleMode?.(next);
  };

  if (isDesktop) {
    return (
      <OnboardingDesktopShell
        step="account"
        title={creating ? t.createAccountTitle : t.signInTitle}
        subtitle={creating ? t.createAccountBody : undefined}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* which server this is, and how to leave it */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              backgroundColor: "var(--bg-elevated)",
              borderRadius: "var(--r-card)",
              border: "1px solid var(--stroke)",
              marginBottom: 28,
            }}
          >
            <Icon glyph="server" size={18} color="var(--accent)" />
            <span
              className="t-body-md"
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--fg-primary)",
                fontSize: 14,
              }}
            >
              {name}
            </span>
            <Tappable
              onClick={forgetServer}
              radius={999}
              style={{
                padding: "4px 8px",
              }}
            >
              <span
                className="t-label-md"
                style={{ color: "var(--accent)", fontWeight: 600, fontSize: 14 }}
              >
                {t.settingsSwitchNode}
              </span>
            </Tappable>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {creating && (
              <TextField
                value={inviteCode}
                onChange={setInviteCode}
                label={t.inviteCodeLabel}
                hint={t.inviteCodeHint}
                glyph="lock"
                onEnter={go}
                dir="ltr"
              />
            )}
            <TextField
              value={username}
              onChange={setUsername}
              label={t.usernameLabel}
              hint={t.usernameHint}
              glyph="user"
              autoFocus
              onEnter={go}
              dir="ltr"
            />
            <TextField
              value={password}
              onChange={setPassword}
              label={t.passwordLabel}
              hint={creating ? t.passwordHintNew : t.passwordHintExisting}
              type="password"
              glyph="lock"
              error={needsTotp ? undefined : error}
              onEnter={go}
              dir="ltr"
            />
            {!creating && !HIDE_TWO_FACTOR && needsTotp && (
              <TextField
                value={totp}
                onChange={setTotp}
                label={t.twoFactorCode}
                hint={t.twoFactorHint}
                glyph="lock"
                error={error}
                autoFocus
                onEnter={go}
                dir="ltr"
              />
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 28 }}>
            <Button
              label={creating ? t.createAccount : t.signIn}
              onClick={go}
              busy={busy}
              expand={false}
            />
            {(creating || Boolean(inviteCode)) && (
              <Tappable
                onClick={toggle}
                radius={999}
                style={{
                  padding: "8px 12px",
                }}
              >
                <span
                  className="t-label-lg"
                  style={{ color: "var(--accent)", fontWeight: 600, fontSize: 14 }}
                >
                  {creating ? t.alreadyHaveAccount : t.noAccountYet}
                </span>
              </Tappable>
            )}
          </div>
        </div>
      </OnboardingDesktopShell>
    );
  }

  return (
    <Scaffold actions={<LanguageToggle />}>
      <div className="ld-enter" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Mark size={72} />
        <h1 className="t-headline" style={{ margin: "26px 0 8px", textAlign: "center" }}>
          {creating ? t.createAccountTitle : t.signInTitle}
        </h1>
        <p className="t-body-md" style={{ color: "var(--fg-secondary)", margin: "0 0 26px", textAlign: "center" }}>
          {creating ? t.createAccountBody : t.signInBody({ serverName: name })}
        </p>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
          <TextField value={username} onChange={setUsername} label={t.usernameLabel} hint={t.usernameHint} glyph="user" autoFocus onEnter={go} dir="ltr" />
          <TextField value={password} onChange={setPassword} label={t.passwordLabel} hint={creating ? t.passwordHintNew : t.passwordHintExisting} type="password" glyph="lock" onEnter={go} dir="ltr" />
          {creating && (
            <TextField value={inviteCode} onChange={setInviteCode} label={t.inviteCodeLabel} hint={t.inviteCodeHint} glyph="lock" onEnter={go} dir="ltr" />
          )}
          {!creating && !HIDE_TWO_FACTOR && needsTotp && (
            <TextField value={totp} onChange={setTotp} label={t.twoFactorCode} hint={t.twoFactorHint} glyph="lock" autoFocus onEnter={go} dir="ltr" />
          )}
          {error && (
            <div className="t-body-sm" style={{ color: "var(--warning)" }}>
              {error}
            </div>
          )}
          <Button label={creating ? t.createAccount : t.signIn} onClick={go} busy={busy} />
          
          <Tappable onClick={toggle} radius={10} style={{ padding: 8, alignSelf: "center" }}>
            <span className="t-label-lg" style={{ color: "var(--accent)" }}>
              {creating ? t.signIn : t.createAccount}
            </span>
          </Tappable>

          <Tappable onClick={forgetServer} radius={10} style={{ padding: 6, alignSelf: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--fg-secondary)" }}>
              <Icon glyph="server" size={17} />
              <span className="t-label-lg">{t.settingsSwitchNode}</span>
            </span>
          </Tappable>
        </div>
      </div>
    </Scaffold>
  );
}

/* ----------------------------------------------------------------- setup */

export function SetupScreen() {
  const t = useL10n();
  const { setupFirstAdmin } = useSession();
  const { isDesktop } = useDeviceClass();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [serverName, setServerName] = useState("Local Drive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const go = async () => {
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await setupFirstAdmin({ username: username.trim(), password, serverName: serverName.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  };

  if (isDesktop) {
    return (
      <OnboardingDesktopShell
        step="account"
        title={t.setupTitle}
        subtitle={t.setupBody}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <TextField value={serverName} onChange={setServerName} label={t.serverNameLabel} glyph="server" dir="ltr" />
          <TextField value={username} onChange={setUsername} label={t.usernameLabel} hint={t.usernameHint} glyph="user" dir="ltr" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <TextField value={password} onChange={setPassword} label={t.passwordLabel} type="password" glyph="lock" dir="ltr" />
            <TextField value={confirm} onChange={setConfirm} label={t.confirmPasswordHint} type="password" glyph="lock" onEnter={go} dir="ltr" />
          </div>
          {error && (
            <div className="t-body-sm" style={{ color: "var(--warning)" }}>
              {error}
            </div>
          )}
          <div style={{ marginTop: 12, alignSelf: "flex-start" }}>
            <Button label={t.createAccount} onClick={go} busy={busy} expand={false} />
          </div>
        </div>
      </OnboardingDesktopShell>
    );
  }

  return (
    <Scaffold actions={<LanguageToggle />}>
      <div className="ld-enter" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Mark size={64} />
        <h1 className="t-headline" style={{ margin: "24px 0 8px", textAlign: "center" }}>
          Make your account
        </h1>
        <p className="t-body-md" style={{ color: "var(--fg-secondary)", margin: "0 0 24px", textAlign: "center" }}>
          This server has nobody on it yet. The first account becomes the administrator.
        </p>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
          <TextField value={serverName} onChange={setServerName} label={t.serverNameLabel} glyph="server" dir="ltr" />
          <TextField value={username} onChange={setUsername} label={t.usernameLabel} hint={t.usernameHint} glyph="user" dir="ltr" />
          <TextField value={password} onChange={setPassword} label={t.passwordLabel} type="password" glyph="lock" dir="ltr" />
          <TextField value={confirm} onChange={setConfirm} label={t.confirmPasswordHint} type="password" glyph="lock" onEnter={go} dir="ltr" />
          {error && (
            <div className="t-body-sm" style={{ color: "var(--warning)" }}>
              {error}
            </div>
          )}
          <Button label={t.createAccount} onClick={go} busy={busy} />
        </div>
      </div>
    </Scaffold>
  );
}

/* ------------------------------------------------------- pending device  */

export function PendingApprovalScreen() {
  const t = useL10n();
  const { cancelPending } = useSession();
  return (
    <Scaffold>
      <div className="ld-enter" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <Mark size={72} stage="connected" />
        <h1 className="t-headline" style={{ margin: "26px 0 8px" }}>
          Waiting to be let in
        </h1>
        <p className="t-body-md" style={{ color: "var(--fg-secondary)", margin: "0 0 24px", maxWidth: 420 }}>
          This is a new device, so somebody already signed in has to approve it.
        </p>
        <Spinner size={28} />
        <div style={{ width: "100%", marginTop: 28 }}>
          <Button label={t.actionCancel} variant="quiet" onClick={cancelPending} />
        </div>
      </div>
    </Scaffold>
  );
}

export function BootScreen() {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
      <Mark size={72} stage="syncing" />
      <Spinner />
    </div>
  );
}
