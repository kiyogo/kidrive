"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon, type Glyph } from "./Icon";
import { useL10n } from "@/lib/l10n";

/*
  The shared widgets, matching the Ld* set in the Flutter client.

  Flat fills with a one pixel border, no shadows and no gradients. Two accents
  only. Every surface here should be recognisable beside a screenshot of the
  app, because it is the same design system rather than an interpretation of it.
*/

/* ------------------------------------------------------------------ press */

/** A pressable surface with the app's press feedback: a brief fade, not a
 *  ripple. Used instead of a bare button so every tap feels the same. */
export function Tappable({
  children,
  onClick,
  onContextMenu,
  className = "",
  radius = 12,
  disabled,
  title,
  style,
  ...rest
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  className?: string;
  radius?: number;
  disabled?: boolean;
  title?: string;
  style?: React.CSSProperties;
  [key: `data-${string}`]: unknown;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={disabled ? undefined : (e) => onClick?.(e)}
      onContextMenu={onContextMenu}
      className={`ld-tappable ${className}`}
      {...rest}
      style={{
        borderRadius: radius,
        background: "none",
        border: 0,
        padding: 0,
        color: "inherit",
        font: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: `background var(--d-tap) var(--ease), opacity var(--d-tap) var(--ease)`,
        textAlign: "start",
        whiteSpace: "normal",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- button */

export function Button({
  label,
  onClick,
  glyph,
  variant = "primary",
  expand = true,
  compact = false,
  disabled,
  busy,
  type = "button",
}: {
  label: string;
  onClick?: () => void;
  glyph?: Glyph;
  variant?: "primary" | "secondary" | "quiet" | "text" | "danger" | "destructive";
  expand?: boolean;
  compact?: boolean;
  disabled?: boolean;
  busy?: boolean;
  type?: "button" | "submit";
}) {
  const palette = {
    primary: { bg: "var(--accent)", fg: "#FFFFFF", border: "var(--accent)" },
    secondary: { bg: "transparent", fg: "var(--fg-primary)", border: "var(--stroke)" },
    quiet: { bg: "transparent", fg: "var(--fg-primary)", border: "var(--stroke)" },
    text: { bg: "transparent", fg: "var(--accent)", border: "transparent" },
    danger: { bg: "transparent", fg: "var(--warning)", border: "var(--warning)" },
    destructive: { bg: "transparent", fg: "var(--warning)", border: "var(--warning)" },
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className="ld-btn"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: compact ? 38 : "var(--button-height)",
        padding: compact ? "0 14px" : "0 20px",
        width: expand ? "100%" : undefined,
        borderRadius: "var(--r-pill)",
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        font: "inherit",
        fontWeight: 600,
        whiteSpace: "nowrap",
        fontSize: compact ? 13 : 14,
        cursor: disabled || busy ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background var(--d-hover) var(--ease), border-color var(--d-hover) var(--ease)",
      }}
    >
      {busy ? <Spinner size={16} color={palette.fg} /> : glyph ? <Icon glyph={glyph} size={17} /> : null}
      {label}
    </button>
  );
}

/** The round icon button used in a toolbar. */
export function UtilityButton({
  glyph,
  onClick,
  title,
  active,
}: {
  glyph: Glyph;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  active?: boolean;
}) {
  return (
    <Tappable
      onClick={onClick}
      title={title}
      radius={999}
      style={{
        width: "var(--utility-button)",
        height: "var(--utility-button)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: `1px solid ${active ? "var(--accent)" : "var(--stroke)"}`,
        background: active ? "rgba(76,141,255,0.14)" : "var(--bg-elevated)",
        color: active ? "var(--accent)" : "var(--fg-primary)",
      }}
    >
      <Icon glyph={glyph} size={18} />
    </Tappable>
  );
}

export function RadioRow({
  label,
  subtitle,
  selected,
  onTap,
  trailing,
}: {
  label: string;
  subtitle?: string;
  selected: boolean;
  onTap: () => void;
  trailing?: ReactNode;
}) {
  return (
    <Tappable
      onClick={onTap}
      radius={14}
      style={{
        margin: "6px 0",
        padding: "13px 14px",
        background: selected ? "rgba(76, 141, 255, 0.1)" : "var(--bg-elevated)",
        borderRadius: "var(--r-tile)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--stroke)"}`,
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          border: `1.8px solid ${selected ? "var(--accent)" : "var(--stroke)"}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
        }}
      >
        {selected && (
          <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--accent)" }} />
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: "start" }}>
        <span className="t-body-lg" style={{ display: "block", color: "var(--fg-primary)" }}>
          {label}
        </span>
        {subtitle && (
          <span className="t-body-sm" style={{ color: "var(--fg-secondary)", marginTop: 2, display: "block" }}>
            {subtitle}
          </span>
        )}
      </span>
      {trailing}
    </Tappable>
  );
}

/* ---------------------------------------------------------------- controls */

export function Switch({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange?: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Tappable
      onClick={(e) => {
        e?.stopPropagation();
        if (!disabled && onChange) onChange(!value);
      }}
      disabled={disabled}
      radius={16}
      style={{
        width: 46,
        height: 28,
        padding: 3,
        borderRadius: 14,
        background: value ? "var(--accent)" : "rgba(128, 128, 128, 0.16)",
        border: `1px solid ${value ? "var(--accent)" : "var(--stroke)"}`,
        display: "flex",
        alignItems: "center",
        boxSizing: "border-box",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background var(--d-tap) var(--ease), border var(--d-tap) var(--ease)",
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          background: "#FFFFFF",
          marginInlineStart: value ? "auto" : 0,
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          transition: "margin var(--d-tap) var(--ease)",
        }}
      />
    </Tappable>
  );
}

export function SettingGroup({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      {title && (
        <div
          style={{
            padding: "4px 8px 4px 10px",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--fg-secondary)",
            letterSpacing: 0.3,
          }}
        >
          {title}
        </div>
      )}
      <div
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "var(--r-card)",
          border: "1px solid var(--stroke)",
          padding: "8px 14px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function SettingRow({
  glyph,
  label,
  description,
  trailing,
  onTap,
  destructive = false,
  showDivider = false,
}: {
  glyph?: Glyph;
  label: string;
  description?: string;
  trailing?: ReactNode;
  onTap?: () => void;
  destructive?: boolean;
  showDivider?: boolean;
}) {
  const color = destructive ? "var(--warning)" : "var(--fg-primary)";

  const rowContent = (
    <>
      {glyph && (
        <div style={{ flex: "none", display: "flex", alignItems: "center" }}>
          <Icon glyph={glyph} size={19} color={destructive ? "var(--warning)" : "var(--fg-secondary)"} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div
          className="t-body-lg"
          style={{
            color,
            fontWeight: 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
        {description && (
          <div
            className="t-body-sm"
            style={{
              color: "var(--fg-secondary)",
              marginTop: 2,
              lineHeight: 1.4,
              whiteSpace: "normal",
              wordBreak: "break-word",
            }}
          >
            {description}
          </div>
        )}
      </div>
      {trailing ? (
        <div style={{ flex: "none", marginInlineStart: 12 }}>{trailing}</div>
      ) : onTap ? (
        <div style={{ flex: "none", marginInlineStart: 8, color: "var(--fg-secondary)" }}>
          <Icon glyph="chevron-right" size={18} />
        </div>
      ) : null}
    </>
  );

  return (
    <>
      {showDivider && (
        <div style={{ height: 1, background: "var(--stroke)", margin: "0 -14px" }} />
      )}
      {trailing ? (
        <div
          onClick={onTap}
          className={onTap ? "ld-tappable" : undefined}
          style={{
            width: "100%",
            padding: "14px 4px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            cursor: onTap ? "pointer" : "default",
            boxSizing: "border-box",
            borderRadius: 12,
            whiteSpace: "normal",
            transition: "background var(--d-tap) var(--ease)",
          }}
        >
          {rowContent}
        </div>
      ) : (
        <Tappable
          onClick={onTap}
          radius={12}
          style={{
            width: "100%",
            padding: "14px 4px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            cursor: onTap ? "pointer" : "default",
            boxSizing: "border-box",
            whiteSpace: "normal",
          }}
        >
          {rowContent}
        </Tappable>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ field */

export function TextField({
  value,
  onChange,
  label,
  hint,
  type = "text",
  glyph,
  error,
  autoFocus,
  onEnter,
  dir,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  hint?: string;
  type?: "text" | "password" | "email";
  glyph?: Glyph;
  error?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  dir?: "ltr" | "rtl";
}) {
  const [reveal, setReveal] = useState(false);
  const [focused, setFocused] = useState(false);
  const actual = type === "password" && reveal ? "text" : type;

  return (
    <div style={{ width: "100%" }}>
      {label && (
        <div className="t-label-md" style={{ color: "var(--fg-secondary)", marginBottom: 8 }}>
          {label}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 48,
          padding: "0 14px",
          background: "var(--bg-elevated)",
          border: `1px solid ${error ? "var(--warning)" : focused ? "var(--accent)" : "var(--stroke)"}`,
          borderRadius: "var(--r-field)",
          transition: "border-color var(--d-hover) var(--ease)",
        }}
      >
        {glyph && <Icon glyph={glyph} size={18} color="var(--fg-secondary)" />}
        <input
          dir={dir}
          type={actual}
          value={value}
          autoFocus={autoFocus}
          placeholder={hint}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter();
          }}
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: 0,
            outline: "none",
            color: "var(--fg-primary)",
            font: "inherit",
            fontSize: 14,
          }}
        />
        {type === "password" && (
          <Tappable onClick={() => setReveal((r) => !r)} radius={8} title={reveal ? "Hide" : "Show"}>
            <Icon glyph={reveal ? "eye-off" : "eye"} size={18} color="var(--fg-secondary)" />
          </Tappable>
        )}
      </div>
      {error && (
        <div className="t-body-sm" style={{ color: "var(--warning)", marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- feedback */

export function Spinner({ size = 22, color = "var(--accent)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="ld-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="var(--stroke)" strokeWidth="2.4" fill="none" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke={color}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LayeredBadge({
  glyph,
  tint,
  size = 88,
}: {
  glyph: Glyph;
  tint?: string;
  size?: number;
}) {
  const actualTint = tint ?? "var(--fg-secondary)";
  const isWarning = tint === "var(--warning)" || tint === "#EE7759";
  const isAccent = tint === "var(--accent)" || tint === "#4C8DFF";

  const backBg = isWarning
    ? "rgba(238, 119, 89, 0.35)"
    : isAccent
      ? "rgba(76, 141, 255, 0.25)"
      : "rgba(128, 128, 128, 0.22)";

  const frontBorder = isWarning
    ? "rgba(238, 119, 89, 0.45)"
    : isAccent
      ? "rgba(76, 141, 255, 0.45)"
      : "var(--stroke)";

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {/* back panel, offset and darker */}
      <div
        style={{
          position: "absolute",
          left: Math.round(size * 0.08),
          top: Math.round(size * 0.12),
          width: Math.round(size * 0.78),
          height: Math.round(size * 0.66),
          borderRadius: 14,
          background: backBg,
        }}
      />
      {/* front panel */}
      <div
        style={{
          position: "absolute",
          right: Math.round(size * 0.06),
          bottom: Math.round(size * 0.08),
          width: Math.round(size * 0.8),
          height: Math.round(size * 0.68),
          borderRadius: 14,
          background: "var(--bg-elevated)",
          border: `1px solid ${frontBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon glyph={glyph} size={Math.round(size * 0.32)} color={actualTint} />
      </div>
    </div>
  );
}

export function EmptyState({
  glyph = "folder",
  title,
  message,
  tint,
  actionLabel,
  onAction,
  compact = false,
}: {
  glyph?: Glyph;
  title: string;
  message?: string;
  tint?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className="ld-enter"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: compact ? "24px 32px" : "48px 32px",
        maxWidth: 340,
        margin: "0 auto",
      }}
    >
      <LayeredBadge glyph={glyph} tint={tint} size={compact ? 64 : 88} />
      <div
        className="t-title-md"
        style={{
          marginTop: compact ? 16 : 24,
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        {title}
      </div>
      {message && (
        <div
          className="t-body-md"
          style={{
            color: "var(--fg-secondary)",
            marginTop: 8,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          {message}
        </div>
      )}
      {actionLabel && onAction && (
        <div style={{ marginTop: 24 }}>
          <Button label={actionLabel} onClick={onAction} expand={false} compact />
        </div>
      )}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  title,
  compact = false,
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
  compact?: boolean;
}) {
  return (
    <EmptyState
      glyph="warning"
      tint="var(--warning)"
      title={title ?? "Có lỗi bất ngờ xảy ra"}
      message={message}
      actionLabel={onRetry ? "Thử lại" : undefined}
      onAction={onRetry}
      compact={compact}
    />
  );
}

/**
 * Loading indicator: shows only the brand loading Spinner (zero skeleton frames).
 * Includes a 120ms debounce: if data arrives immediately, nothing flashes and
 * the content renders right away. If loading takes longer, only the centered
 * Spinner icon is displayed.
 */
export function LoadingState({ size = 32, delay = 120 }: { size?: number; delay?: number }) {
  const [show, setShow] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const timer = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!show) return null;

  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: 240,
        padding: 40,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <Spinner size={size} />
    </div>
  );
}

export function GridSkeleton({ columns: _columns }: { columns?: number } = {}) {
  return <LoadingState size={32} delay={120} />;
}

export function ListSkeleton({ rows: _rows }: { rows?: number } = {}) {
  return <LoadingState size={32} delay={120} />;
}

/* ------------------------------------------------------------------ toast */

type Toast = { id: number; message: string; tone: "info" | "success" | "error" };
const ToastCtx = createContext<(m: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const next = useRef(1);
  const { isMobile } = useDeviceClass();

  const show = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = next.current++;
    setItems((list) => [...list, { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ message: string; tone?: Toast["tone"] }>;
      if (ce.detail?.message) {
        show(ce.detail.message, ce.detail.tone || "info");
      }
    };
    window.addEventListener("ld-toast", handler);
    return () => window.removeEventListener("ld-toast", handler);
  }, [show]);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 24,
          display: "flex",
          flexDirection: "column-reverse",
          alignItems: "center",
          gap: 8,
          zIndex: 9999,
          pointerEvents: "none",
        }}
      >
        {items.map((t) => {
          const accent =
            t.tone === "success"
              ? "var(--file-spreadsheet)"
              : t.tone === "error"
              ? "var(--warning)"
              : "var(--accent)";
          const glyph =
            t.tone === "success"
              ? "check"
              : t.tone === "error"
              ? "alert"
              : "info";

          return (
            <div
              key={t.id}
              className="ld-enter"
              style={{
                pointerEvents: "auto",
                maxWidth: 480,
                width: "fit-content",
                margin: "0 20px",
                padding: "12px 14px",
                borderRadius: "var(--r-card)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--stroke)",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: "var(--fg-primary)",
                fontSize: 15,
                lineHeight: "22px",
                fontWeight: 400,
              }}
            >
              <Icon glyph={glyph} size={20} color={accent} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

/* ----------------------------------------------------------------- avatar */

/**
 * A person, drawn as a deterministic gradient plus their initials. The same
 * seed always produces the same face, so an avatar is recognisable across
 * devices without the server ever storing an image.
 *
 * The hash and the two hue offsets are the same as LdAvatar's, so a face here
 * matches the face the app draws for the same person. Changing either number
 * silently repaints everyone.
 */
export function Avatar({
  name,
  seed = "",
  size = 32,
  showBorder = false,
}: {
  name: string;
  seed?: string;
  size?: number;
  showBorder?: boolean;
}) {
  const hash = hashOf(seed || "localdrive");
  const hue = hash % 360;
  const second = (hue + 38) % 360;
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: 999,
        background: `linear-gradient(to bottom right, hsl(${hue} 52% 56%), hsl(${second} 58% 42%))`,
        border: showBorder ? "2px solid var(--bg-primary)" : undefined,
        color: "var(--fg-primary)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontWeight: 600,
        lineHeight: 1,
        letterSpacing: 0,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

function hashOf(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) & 0x7fffffff;
  return hash;
}

export function initialsOf(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return [...parts[0]].slice(0, 2).join("").toUpperCase();
  return parts
    .slice(0, 2)
    .map((p) => [...p][0])
    .join("")
    .toUpperCase();
}

/* ----------------------------------------------------------------- banner */

export function Banner({
  message,
  glyph = "warning",
  tint = "var(--fg-secondary)",
  action,
}: {
  message: string;
  glyph?: Glyph;
  tint?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        background: "var(--bg-sunken)",
        borderBottom: "1px solid var(--stroke)",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        boxSizing: "border-box",
      }}
    >
      <Icon glyph={glyph} size={17} color={tint} />
      <span className="t-body-sm" style={{ flex: 1, color: "var(--fg-primary)" }}>
        {message}
      </span>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ sheet */

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { isMobile } = useDeviceClass();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  if (!isMobile) {
    return (
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="ld-enter"
          style={{
            width: "min(520px, 100%)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--stroke)",
            borderRadius: "var(--r-card)",
            padding: 24,
            maxHeight: "min(640px, 90vh)",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: 16,
              gap: 12,
            }}
          >
            <div>
              {title && (
                <div className="t-title-md" style={{ margin: 0 }}>
                  {title}
                </div>
              )}
              {subtitle && (
                <div className="t-body-sm" style={{ color: "var(--fg-secondary)", marginTop: 4 }}>
                  {subtitle}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 4,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--fg-secondary)",
                borderRadius: "50%",
              }}
            >
              <Icon glyph="close" size={20} />
            </button>
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 800,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ld-enter"
        style={{
          width: "min(520px, 100%)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--stroke)",
          borderBottom: 0,
          borderRadius: "var(--r-sheet) var(--r-sheet) 0 0",
          padding: 20,
          maxHeight: "80vh",
          overflowY: "auto",
          marginBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "var(--stroke)",
            margin: "0 auto 16px",
          }}
        />
        {title && (
          <div className="t-title-md" style={{ marginBottom: 14 }}>
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- dialog */

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 850,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ld-enter"
        style={{
          width: "min(420px, 100%)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--stroke)",
          borderRadius: "var(--r-card)",
          padding: 24,
        }}
      >
        {title && (
          <div className="t-title-md" style={{ marginBottom: 16 }}>
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onCancel,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const handleClose = onCancel ?? onClose ?? (() => {});
  return (
    <Dialog open={open} onClose={handleClose} title={title}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="t-body-md" style={{ color: "var(--fg-primary)", lineHeight: 1.5 }}>
          {message}
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <Button
            label={cancelLabel}
            variant="quiet"
            expand={false}
            compact
            onClick={handleClose}
          />
          <Button
            label={confirmLabel}
            variant={destructive ? "danger" : "primary"}
            expand={false}
            compact
            onClick={() => {
              void onConfirm();
              handleClose();
            }}
          />
        </div>
      </div>
    </Dialog>
  );
}

export function Menu({
  open,
  x,
  y,
  anchorRect,
  title,
  subtitle,
  onClose,
  items,
}: {
  open: boolean;
  x?: number;
  y?: number;
  anchorRect?: { left: number; right: number; top: number; bottom: number } | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  items: { label: string; glyph?: Glyph; onClick: () => void; danger?: boolean }[];
}) {
  const { isDesktop } = useDeviceClass();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  if (!isDesktop) {
    return (
      <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 0" }}>
          {items.map((item) => {
            const itemColor = item.danger ? "var(--warning)" : "var(--fg-primary)";
            return (
              <Tappable
                key={item.label}
                radius={12}
                onClick={() => {
                  onClose();
                  item.onClick();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  width: "100%",
                  padding: "14px 4px",
                  color: itemColor,
                  boxSizing: "border-box",
                  whiteSpace: "nowrap",
                }}
              >
                {item.glyph && <Icon glyph={item.glyph} size={20} color={itemColor} />}
                <span
                  className="t-body-lg"
                  style={{
                    color: itemColor,
                    flex: 1,
                    textAlign: "left",
                    lineHeight: 1.3,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.label}
                </span>
              </Tappable>
            );
          })}
        </div>
      </Sheet>
    );
  }

  const panelWidth = 240;
  const estimatedHeight = items.length * 46 + 12;
  const winW = typeof window !== "undefined" ? window.innerWidth : 1280;
  const winH = typeof window !== "undefined" ? window.innerHeight : 800;

  let posX = x ?? 0;
  let posY = y ?? 0;

  if (anchorRect) {
    const isRightHalf = anchorRect.left > winW / 2;
    posX = isRightHalf ? anchorRect.right : anchorRect.left;
    posY = anchorRect.bottom;
  }

  // Follow Flutter _showFloating:
  // (anchor.dx > size.width / 2 || anchor.dx + panelWidth > size.width)
  const flipH = posX > winW / 2 || posX + panelWidth > winW - 8;
  const targetLeft = flipH ? posX - panelWidth : posX;
  const left = Math.max(8, Math.min(targetLeft, winW - panelWidth - 8));

  const fitsBelow = posY + estimatedHeight <= winH - 8;
  const top = fitsBelow
    ? Math.max(8, Math.min(posY, winH - estimatedHeight - 8))
    : Math.max(8, posY - estimatedHeight);

  return createPortal(
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 848,
          background: "transparent",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left,
          top,
          zIndex: 850,
          width: panelWidth,
          background: "var(--bg-elevated)",
          border: "1px solid var(--stroke)",
          borderRadius: 14,
          padding: "6px 0",
          boxShadow: "none",
          maxHeight: winH - 16,
          overflowY: "auto",
        }}
      >
        {items.map((item) => {
          const itemColor = item.danger ? "var(--warning)" : "var(--fg-primary)";
          return (
            <Tappable
              key={item.label}
              radius={10}
              onClick={() => {
                onClose();
                item.onClick();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                width: "100%",
                padding: "11px 14px",
                color: itemColor,
                boxSizing: "border-box",
              }}
            >
              {item.glyph && <Icon glyph={item.glyph} size={19} color={itemColor} />}
              <span
                className="t-body-lg"
                style={{
                  color: itemColor,
                  flex: 1,
                  textAlign: "left",
                  lineHeight: "22px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.label}
              </span>
            </Tappable>
          );
        })}
      </div>
    </>,
    document.body,
  );
}

/* ------------------------------------------------------------ measurement */

/** The device class, from the width, matching Breakpoints in the app. */
export function useDeviceClass() {
  const [width, setWidth] = useState(1280);
  useEffect(() => {
    const measure = () => setWidth(window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return useMemo(
    () => ({
      width,
      isMobile: width < 600,
      isTablet: width >= 600 && width < 768,
      isDesktop: width >= 768,
    }),
    [width],
  );
}

/**
 * Density size slider for photo/video grids, matching Flutter's _SizeSlider in gallery_page_desktop.dart.
 */
export function SizeSlider({
  columns,
  onChanged,
  steps = [3, 4, 5, 6, 8],
}: {
  columns: number;
  onChanged: (n: number) => void;
  steps?: number[];
}) {
  const t = useL10n();
  return (
    <div
      title={t.galleryColumns}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: 3,
        background: "var(--bg-elevated)",
        borderRadius: "var(--r-pill)",
        border: "1px solid var(--stroke)",
      }}
    >
      {steps.map((step) => {
        const active = step === columns;
        return (
          <button
            key={step}
            type="button"
            onClick={() => onChanged(step)}
            style={{
              width: 30,
              height: 26,
              display: "grid",
              placeItems: "center",
              background: active ? "var(--accent)" : "transparent",
              borderRadius: "var(--r-pill)",
              border: "none",
              cursor: "pointer",
              color: active ? "#FFFFFF" : "var(--fg-secondary)",
              transition: "background var(--d-hover) var(--ease), color var(--d-hover) var(--ease)",
            }}
          >
            <svg width={13} height={13} viewBox="0 0 13 13" fill="none">
              {step >= 6 ? (
                <>
                  <rect x="0.5" y="0.5" width="3" height="3" fill="currentColor" rx="0.5" />
                  <rect x="5" y="0.5" width="3" height="3" fill="currentColor" rx="0.5" />
                  <rect x="9.5" y="0.5" width="3" height="3" fill="currentColor" rx="0.5" />
                  <rect x="0.5" y="5" width="3" height="3" fill="currentColor" rx="0.5" />
                  <rect x="5" y="5" width="3" height="3" fill="currentColor" rx="0.5" />
                  <rect x="9.5" y="5" width="3" height="3" fill="currentColor" rx="0.5" />
                  <rect x="0.5" y="9.5" width="3" height="3" fill="currentColor" rx="0.5" />
                  <rect x="5" y="9.5" width="3" height="3" fill="currentColor" rx="0.5" />
                  <rect x="9.5" y="9.5" width="3" height="3" fill="currentColor" rx="0.5" />
                </>
              ) : (
                <>
                  <rect x="1" y="1" width="4.5" height="4.5" fill="currentColor" rx="0.5" />
                  <rect x="7.5" y="1" width="4.5" height="4.5" fill="currentColor" rx="0.5" />
                  <rect x="1" y="7.5" width="4.5" height="4.5" fill="currentColor" rx="0.5" />
                  <rect x="7.5" y="7.5" width="4.5" height="4.5" fill="currentColor" rx="0.5" />
                </>
              )}
            </svg>
          </button>
        );
      })}
    </div>
  );
}
