"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { transfers, type Transfer } from "@/lib/upload";
import { bytes } from "@/lib/format";
import { useDeviceClass } from "@/components/ui";

export function FloatingTransfersTray({ onOpenTransfers }: { onOpenTransfers: () => void }) {
  const { isDesktop } = useDeviceClass();
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

  const totalBytes = items.reduce((acc, x) => acc + (x.size || 0), 0);
  const sentBytes = items.reduce((acc, x) => acc + (x.sent || 0), 0);
  const currentSpeed = active.reduce((acc, x) => acc + (x.speed || 0), 0);
  const pct = isDoneAll
    ? 100
    : totalBytes > 0
      ? Math.max(1, Math.min(99, Math.round((sentBytes / totalBytes) * 100)))
      : current.size
        ? Math.max(1, Math.min(99, Math.round((current.sent / current.size) * 100)))
        : 10;
  const barColor = isFailed ? "var(--danger)" : isDoneAll ? "var(--ok)" : "var(--accent)";

  return (
    <div
      onClick={onOpenTransfers}
      style={{
        position: "fixed",
        bottom: isDesktop ? 24 : "calc(84px + env(safe-area-inset-bottom))",
        right: isDesktop ? 24 : 16,
        left: isDesktop ? "auto" : 16,
        zIndex: 9999,
        background: "var(--bg-elevated)",
        border: "1px solid var(--stroke)",
        borderRadius: "var(--r-card, 14px)",
        boxShadow: "0 10px 36px rgba(0,0,0,0.45)",
        padding: "14px 18px",
        minWidth: isDesktop ? 320 : "auto",
        maxWidth: isDesktop ? 420 : "100%",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "all 200ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, textAlign: "left" }}>
          <span
            className="t-body-sm"
            style={{
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "left",
            }}
          >
            Trạng thái
          </span>
          <span
            style={{
              fontSize: 12,
              color: "var(--fg-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 2,
            }}
          >
            {isDoneAll
              ? `${completed} mục đã xong • ${bytes(totalBytes)}`
              : isFailed
                ? `${failedItems.length} mục lỗi`
                : `${bytes(sentBytes)} / ${bytes(totalBytes)}${currentSpeed > 0 ? ` • ${bytes(currentSpeed)}/s` : ""}`}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 10, flexShrink: 0 }}>
          <span
            className="t-label-sm"
            style={{
              color: barColor,
              fontWeight: 700,
              fontSize: 14,
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

      {isFailed && current.error && (
        <div style={{ display: "flex", alignItems: "center" }}>
          <span className="t-body-xs" style={{ color: "var(--danger)" }}>
            {current.error}
          </span>
        </div>
      )}
    </div>
  );
}