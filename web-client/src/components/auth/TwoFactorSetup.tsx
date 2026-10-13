"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Icon } from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Button,
  EmptyState,
  ErrorState,
  Spinner,
  Tappable,
  TextField,
  useDeviceClass,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { useL10n } from "@/lib/l10n";
import { useSession } from "@/lib/session";

type Enrollment = {
  secret: string;
  otpauth_url: string;
  recovery_codes?: string[];
};

/**
 * Turning on two-factor, ported 100% from auth/pages/two_factor_setup_page.dart.
 *
 * The QR is shown first because that is the path almost everybody takes: open
 * the authenticator, point it at the screen, done. The secret is underneath
 * for anyone typing it into a password manager or setting up a device that
 * cannot see this screen.
 *
 * Nothing is enabled until a real code from the app is accepted.
 */
export function TwoFactorSetup({
  required = false,
  onDone,
  onBack,
  embedded = false,
}: {
  required?: boolean;
  onDone: () => void;
  onBack?: () => void;
  embedded?: boolean;
}) {
  const t = useL10n();
  const toast = useToast();
  const { user, signOut } = useSession();
  const { isMobile } = useDeviceClass();

  const [data, setData] = useState<Enrollment | null>(null);
  const [qr, setQr] = useState("");
  const [byHand, setByHand] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);

  const alreadyOn = user?.totp_enabled ?? false;

  const begin = useCallback(async () => {
    if (alreadyOn) return;
    setLoadError("");
    try {
      const started = await api.post<Enrollment>(Api.totpBegin, {});
      setData(started);
      if (started?.otpauth_url) {
        setQr(
          await QRCode.toDataURL(started.otpauth_url, {
            width: 200,
            margin: 1,
            color: { dark: "#000000", light: "#FFFFFF" },
          }),
        );
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t.errorUnexpectedTitle);
    }
  }, [alreadyOn, t]);

  useEffect(() => {
    void begin();
  }, [begin]);

  const confirm = async () => {
    if (code.trim().length < 6) {
      setError(t.twoFactorCodeHint);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post(Api.totpVerify, { code: code.trim() });
      toast(t.twoFactorOn, "success");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errorUnexpectedTitle);
    } finally {
      setBusy(false);
    }
  };

  // Enrolment only makes sense for an account that is not enrolled.
  if (alreadyOn) {
    const done = <AlreadyOn />;
    return (
      <ScaffoldShell
        title={t.twoFactorTitle}
        showBack={!required}
        onBack={onBack}
        embedded={embedded}
      >
        {done}
      </ScaffoldShell>
    );
  }

  if (loadError) {
    return (
      <ScaffoldShell
        title={t.twoFactorTitle}
        showBack={!required}
        onBack={onBack}
        embedded={embedded}
      >
        <ErrorState message={loadError} onRetry={() => void begin()} />
      </ScaffoldShell>
    );
  }

  if (!data) {
    return (
      <ScaffoldShell
        title={t.twoFactorTitle}
        showBack={!required}
        onBack={onBack}
        embedded={embedded}
      >
        <div style={{ display: "grid", placeItems: "center", minHeight: 300 }}>
          <Spinner />
        </div>
      </ScaffoldShell>
    );
  }

  const recoveryCodes = data.recovery_codes || [];

  // Left panel: Step 1 (Scan QR / Use Secret Key)
  const panel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <StepBadge number={1} title={t.twoFactorScanTitle} />

      {/* LdSegmented: Use QR vs Use Key */}
      <div
        style={{
          display: "flex",
          gap: 0,
          padding: 4,
          background: "var(--bg-elevated)",
          border: "1px solid var(--stroke)",
          borderRadius: "var(--r-pill)",
        }}
      >
        <button
          type="button"
          onClick={() => setByHand(false)}
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: "var(--r-pill)",
            background: !byHand ? "var(--accent)" : "transparent",
            color: !byHand ? "#FFFFFF" : "var(--fg-secondary)",
            fontSize: 14,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
            textAlign: "center",
          }}
        >
          {t.twoFactorUseQr}
        </button>
        <button
          type="button"
          onClick={() => setByHand(true)}
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: "var(--r-pill)",
            background: byHand ? "var(--accent)" : "transparent",
            color: byHand ? "#FFFFFF" : "var(--fg-secondary)",
            fontSize: 14,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
            textAlign: "center",
          }}
        >
          {t.twoFactorUseKey}
        </button>
      </div>

      {!byHand ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
          <div
            style={{
              padding: 16,
              background: "#FFFFFF",
              borderRadius: "var(--r-card)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt={t.twoFactorUseQr}
                width={200}
                height={200}
                style={{ display: "block" }}
              />
            ) : (
              <div style={{ width: 200, height: 200, display: "grid", placeItems: "center" }}>
                <Spinner />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p
            className="t-body-sm"
            style={{
              color: "var(--fg-secondary)",
              margin: 0,
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            {t.twoFactorKeyBody}
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "10px 8px 10px 14px",
              background: "var(--bg-sunken)",
              border: "1px solid var(--stroke)",
              borderRadius: "var(--r-field)",
            }}
          >
            <span
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 14,
                letterSpacing: 1.2,
                color: "var(--fg-primary)",
                wordBreak: "break-all",
                flex: 1,
              }}
            >
              {data.secret}
            </span>
            <Button
              label={t.actionCopyCode}
              glyph="copy"
              variant="text"
              expand={false}
              compact
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(data.secret);
                  toast(t.actionCopied, "success");
                } catch {
                  toast(t.errorUnexpectedTitle, "error");
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );

  // Right panel: Step 2 (Confirm Code & Recovery Codes)
  const proof = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <StepBadge number={2} title={t.twoFactorConfirmTitle} />

      <TextField
        value={code}
        onChange={setCode}
        label={t.twoFactorCode}
        hint={t.twoFactorCodeHint}
        glyph="lock"
        dir="ltr"
        onEnter={confirm}
      />

      {error && (
        <div className="t-body-sm" style={{ color: "var(--warning)", marginTop: -8 }}>
          {error}
        </div>
      )}

      <Button
        label={t.twoFactorTurnOn}
        onClick={() => void confirm()}
        busy={busy}
        disabled={code.trim().length < 6}
      />

      {recoveryCodes.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: 16,
            background: "var(--bg-elevated)",
            border: "1px solid var(--warning)",
            borderRadius: "var(--r-card)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon glyph="warning" size={18} color="var(--warning)" />
            <span className="t-title-sm" style={{ fontWeight: 600 }}>
              {t.recoveryCodesTitle}
            </span>
          </div>
          <p
            className="t-body-sm"
            style={{
              color: "var(--fg-secondary)",
              margin: 0,
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            {t.recoveryCodesBody}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "8px 10px",
              marginTop: 4,
            }}
          >
            {recoveryCodes.map((c) => (
              <span
                key={c}
                style={{
                  padding: "6px 10px",
                  background: "var(--bg-sunken)",
                  borderRadius: "var(--r-chip)",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 13,
                  letterSpacing: 1,
                  color: "var(--fg-primary)",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {c}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 4, display: "flex", justifyContent: "flex-start" }}>
            <Button
              label={t.actionCopy}
              glyph="copy"
              variant="secondary"
              expand={false}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(recoveryCodes.join("\n"));
                  toast(t.actionCopied, "success");
                } catch {
                  toast(t.errorUnexpectedTitle, "error");
                }
              }}
            />
          </div>
        </div>
      )}

      {required && (
        <div style={{ marginTop: 8 }}>
          <Button label={t.settingsSignOut} variant="quiet" onClick={() => void signOut()} />
        </div>
      )}
    </div>
  );

  return (
    <ScaffoldShell
      title={t.twoFactorTitle}
      showBack={!required}
      onBack={onBack}
      embedded={embedded}
    >
      <div style={{ width: "100%" }}>
        <p
          className="t-body-md"
          style={{
            color: "var(--fg-secondary)",
            margin: "0 0 28px",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {required ? t.twoFactorRequiredBody : t.twoFactorOptionalBody}
        </p>

        {!isMobile ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 40 }}>
            <div style={{ flex: 1, minWidth: 0 }}>{panel}</div>
            <div style={{ flex: 1, minWidth: 0 }}>{proof}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {panel}
            {proof}
          </div>
        )}
      </div>
    </ScaffoldShell>
  );
}

/**
 * Empty state shown when 2FA is already turned on. Matches Flutter's _AlreadyOn.
 */
function AlreadyOn() {
  const t = useL10n();

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: 320, padding: "24px 0" }}>
      <EmptyState
        glyph="lock"
        title={t.twoFactorOn}
        message={t.twoFactorAlreadyOnBody}
        compact
      />
    </div>
  );
}

/**
 * Step numbered circle badge matching Flutter's _Step.
 */
function StepBadge({ number, title }: { number: number; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          width: 22,
          height: 22,
          flex: "none",
          borderRadius: "50%",
          background: "var(--accent)",
          color: "#FFFFFF",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        {number}
      </span>
      <span
        className="t-title-sm"
        style={{ fontWeight: 600, fontSize: 15, color: "var(--fg-primary)" }}
      >
        {title}
      </span>
    </div>
  );
}

/**
 * Shell matching Flutter's LdScaffold and LdContentPane(maxWidth: 860).
 */
function ScaffoldShell({
  title,
  showBack = false,
  onBack,
  embedded = false,
  children,
}: {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  embedded?: boolean;
  children: React.ReactNode;
}) {
  const t = useL10n();

  if (embedded) {
    return (
      <div style={{ width: "100%", maxWidth: 860, margin: "0 auto", padding: "8px 0 32px" }}>
        {children}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header bar matching LdScaffold */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 16px",
          gap: 4,
          background: "transparent",
          flex: "none",
        }}
      >
        {showBack && (
          <Tappable
            onClick={onBack ?? (() => window.history.back())}
            radius={999}
            style={{
              width: 38,
              height: 38,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--fg-primary)",
            }}
            title={t.actionBack}
          >
            <Icon glyph="chevron-left" size={22} />
          </Tappable>
        )}
        <h1
          className="t-title-lg"
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 600,
            color: "var(--fg-primary)",
          }}
        >
          {title}
        </h1>
      </header>

      {/* Body container matching LdContentPane */}
      <main style={{ flex: 1, overflowY: "auto", padding: "8px 16px 32px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", width: "100%" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
