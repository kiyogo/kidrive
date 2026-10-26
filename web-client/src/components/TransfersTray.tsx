"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { transfers, type Transfer } from "@/lib/upload";
import { bytes } from "@/lib/format";

export function FloatingTransfersTray({ onOpenTransfers }: { onOpenTransfers: () => void }) {
  const [items, setItems] = useState<Transfer[]>([]);
  const [lingering, setLingering] = useState(false);
  const [dismissedCount, setDismissedCount] = useState(0);

  useEffect(() => {
    const stop = transfers.subscribe(setItems);
    return () => {
      stop();
    };
  }, []);

  const active = items.filter((x) => x.state === "uploading" || x.state === "queued");

  useEffect(() => {
    if (active.length > 0) {
      setLingering(true);
      return;
    }
    if (lingering) {
      const t = setTimeout(() => {
        setLingering(false);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [active.length, lingering]);

  if (active.length === 0 && (!lingering || items.length === 0 || items.length === dismissedCount)) {
    return null;
  }

  const total = items.length;
  const completed = items.filter((x) => x.state === "done").length;
  const failedItems = items.filter((x) => x.state === "failed");
  const current = active[0] ?? failedItems[0] ?? items[0];
  if (!current) return null;

  const isDoneAll = active.length === 0 && failedItems.length === 0;
  const isFailed = active.length === 0 && failedItems.length > 0;
  const pct = isDoneAll
    ? 100
    : current.size
      ? Math.min(100, Math.round((current.sent / current.size) * 100))
      : 0;
  const barColor = isFailed ? "var(--danger)" : isDoneAll ? "var(--ok)" : "var(--accent)";

  return (
    <div
      onClick={onOpenTransfers}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        background: "var(--bg-elevated)",
        border: "1px solid var(--stroke)",
        borderRadius: "var(--r-card, 14px)",
        boxShadow: "0 10px 36px rgba(0,0,0,0.45)",
        padding: "14px 18px",
        minWidth: 310,
        maxWidth: 390,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        transition: "all 200ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden", minWidth: 0 }}>
          <Icon glyph={isDoneAll ? "check" : "upload"} size={18} color={barColor} />
          <span
            className="t-body-sm"
            style={{
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {current.name}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 10, flexShrink: 0 }}>
          <span
            className="t-label-sm"
            style={{
              color: barColor,
              fontWeight: 700,
            }}
          >
            {isFailed ? "Lỗi" : `${pct}%`}
          </span>
          {active.length === 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLingering(false);
                setDismissedCount(items.length);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--fg-muted)",
                cursor: "pointer",
                padding: 2,
                lineHeight: 1,
                fontSize: 15,
              }}
              aria-label="Đóng"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          height: 5,
          borderRadius: 999,
          background: "var(--bg-sunken)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${isFailed ? 100 : pct}%`,
            background: barColor,
            transition: "width 180ms linear",
            borderRadius: 999,
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center" }}>
        <span className="t-body-xs" style={{ color: isFailed ? "var(--danger)" : "var(--fg-secondary)" }}>
          {isFailed
            ? current.error || `Thất bại (${failedItems.length} mục)`
            : isDoneAll
              ? `Hoàn tất ${completed}/${total} mục (100%)`
              : `Đang xử lý ${Math.min(total, completed + 1)}/${total} mục (${pct}%)`}
        </span>
      </div>
    </div>
  );
}
