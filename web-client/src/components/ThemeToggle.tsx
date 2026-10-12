"use client";

import { useL10n } from "@/lib/l10n";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { Icon } from "./Icon";
import { Tappable } from "./ui";

/**
 * The light/dark/system theme switch, matching LdThemeToggle in the Flutter client.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const t = useL10n();
  const { theme, isDark, setTheme } = useTheme();

  if (compact) {
    return (
      <div
        style={{
          display: "inline-flex",
          padding: 2,
          background: "var(--bg-elevated)",
          borderRadius: "var(--r-pill)",
          border: "1px solid var(--stroke)",
        }}
      >
        <Tappable
          onClick={() => setTheme("light")}
          radius={999}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            background: !isDark ? "var(--accent)" : "transparent",
            color: !isDark ? "#ffffff" : "var(--fg-secondary)",
          }}
          title={t.themeLight}
        >
          <Icon glyph="sun" size={14} color={!isDark ? "#ffffff" : "var(--fg-secondary)"} />
          <span className="t-label-sm">{t.themeLight}</span>
        </Tappable>
        <Tappable
          onClick={() => setTheme("dark")}
          radius={999}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            background: isDark ? "var(--accent)" : "transparent",
            color: isDark ? "#ffffff" : "var(--fg-secondary)",
          }}
          title={t.themeDark}
        >
          <Icon glyph="moon" size={14} color={isDark ? "#ffffff" : "var(--fg-secondary)"} />
          <span className="t-label-sm">{t.themeDark}</span>
        </Tappable>
      </div>
    );
  }

  const options: { id: ThemeMode; label: string; glyph: "sun" | "moon" | "device" }[] = [
    { id: "system", label: t.themeSystem, glyph: "device" },
    { id: "light", label: t.themeLight, glyph: "sun" },
    { id: "dark", label: t.themeDark, glyph: "moon" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {options.map((opt) => {
        const active = theme === opt.id;
        return (
          <Tappable
            key={opt.id}
            onClick={() => setTheme(opt.id)}
            radius={14}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 16px",
              background: "var(--bg-elevated)",
              border: `1px solid ${active ? "var(--accent)" : "var(--stroke)"}`,
            }}
          >
            <Icon glyph={opt.glyph} size={18} color={active ? "var(--accent)" : "var(--fg-secondary)"} />
            <span className="t-body-md" style={{ flex: 1, minWidth: 0, fontWeight: 400 }}>
              {opt.label}
            </span>
            {active && <Icon glyph="check" size={18} color="var(--accent)" />}
          </Tappable>
        );
      })}
    </div>
  );
}
