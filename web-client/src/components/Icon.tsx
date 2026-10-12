import React from "react";

/**
 * The glyph set, matching LdGlyph in the Flutter client (localdrive/lib/core/widgets/ld_icons.dart).
 *
 * One visual language throughout: a 24 unit box, outline with 1.9 stroke width,
 * round caps and joins. Every path is authored to match Flutter's CustomPainter
 * 100% vector-for-vector.
 */

export type Glyph =
  | "home"
  | "gallery"
  | "shared"
  | "recent"
  | "star"
  | "star-filled"
  | "trash"
  | "storage"
  | "drive"
  | "settings"
  | "search"
  | "upload"
  | "download"
  | "folder"
  | "folder-plus"
  | "file"
  | "image"
  | "video"
  | "audio"
  | "music"
  | "pdf"
  | "code"
  | "archive"
  | "sheet"
  | "slides"
  | "more"
  | "close"
  | "check"
  | "chevron-right"
  | "chevron-left"
  | "chevron-down"
  | "arrow-left"
  | "arrow-up"
  | "arrow-down"
  | "arrowUp"
  | "arrowDown"
  | "filter"
  | "plus"
  | "grid"
  | "list"
  | "sort"
  | "rename"
  | "edit"
  | "share"
  | "link"
  | "eye"
  | "eye-off"
  | "lock"
  | "user"
  | "person"
  | "users"
  | "people"
  | "device"
  | "server"
  | "globe"
  | "language"
  | "wifi"
  | "info"
  | "alert"
  | "warning"
  | "refresh"
  | "logout"
  | "play"
  | "pause"
  | "volume"
  | "volume-off"
  | "transfers"
  | "activity"
  | "offline"
  | "offline-ready"
  | "offlineReady"
  | "restore"
  | "copy"
  | "move"
  | "sun"
  | "moon"
  | "expand"
  | "minimize"
  | "fullscreen"
  | "fullscreenExit"
  | "qr";

export function Icon({
  glyph,
  size = 22,
  color = "currentColor",
  className,
  strokeWidth = 1.9,
}: {
  glyph: Glyph;
  size?: number;
  color?: string;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      style={{ flex: "none", display: "block" }}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {renderGlyph(glyph, color, strokeWidth)}
    </svg>
  );
}

function renderGlyph(glyph: Glyph, color: string, strokeWidth: number): React.ReactNode {
  switch (glyph) {
    case "home":
      return (
        <>
          <path d="M4 10 L12 3.5 L20 10 V19 H4 Z" />
          <path d="M9.5 19 V13.5 H14.5 V19" />
        </>
      );

    case "search":
      return (
        <>
          <circle cx="10.5" cy="10.5" r="6" />
          <line x1="15" y1="15" x2="20" y2="20" />
        </>
      );

    case "plus":
      return (
        <>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </>
      );

    case "shared":
    case "share":
      return (
        <>
          <circle cx="6.5" cy="12" r="2.6" />
          <circle cx="17" cy="6.5" r="2.6" />
          <circle cx="17" cy="17.5" r="2.6" />
          <line x1="8.9" y1="10.8" x2="14.7" y2="7.7" />
          <line x1="8.9" y1="13.2" x2="14.7" y2="16.3" />
        </>
      );

    case "settings":
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="8" />
          <line x1="12" y1="4" x2="12" y2="6.5" />
          <line x1="12" y1="17.5" x2="12" y2="20" />
          <line x1="4" y1="12" x2="6.5" y2="12" />
          <line x1="17.5" y1="12" x2="20" y2="12" />
        </>
      );

    case "folder":
      return (
        <path d="M3.5 8 V6.5 Q3.5 5.5 4.5 5.5 H9.5 L11.5 8 H19.5 Q20.5 8 20.5 9 V17.5 Q20.5 18.5 19.5 18.5 H4.5 Q3.5 18.5 3.5 17.5 Z" />
      );

    case "folder-plus":
      return (
        <>
          <path d="M3.5 8 V6.5 Q3.5 5.5 4.5 5.5 H9.5 L11.5 8 H19.5 Q20.5 8 20.5 9 V17.5 Q20.5 18.5 19.5 18.5 H4.5 Q3.5 18.5 3.5 17.5 Z" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <line x1="9.5" y1="13.5" x2="14.5" y2="13.5" />
        </>
      );

    case "file":
      return (
        <>
          <path d="M6 3.5 H14 L19 8.5 V20.5 H6 Z" />
          <path d="M14 3.5 V8.5 H19" />
        </>
      );

    case "upload":
    case "transfers":
      return (
        <>
          <line x1="12" y1="16" x2="12" y2="4" />
          <path d="M7.5 8.5 L12 4 L16.5 8.5" />
          <path d="M4.5 15 V19.5 H19.5 V15" />
        </>
      );

    case "download":
      return (
        <>
          <line x1="12" y1="4" x2="12" y2="16" />
          <path d="M7.5 11.5 L12 16 L16.5 11.5" />
          <path d="M4.5 15 V19.5 H19.5 V15" />
        </>
      );

    case "star":
      return (
        <path
          d="M12 4.2 L14.0 9.45 L19.61 9.73 L15.26 13.25 L16.71 18.67 L12 15.5 L7.29 18.67 L8.74 13.25 L4.39 9.73 L10.0 9.45 Z"
          fill="none"
        />
      );

    case "star-filled":
      return (
        <path
          d="M12 4.2 L14.0 9.45 L19.61 9.73 L15.26 13.25 L16.71 18.67 L12 15.5 L7.29 18.67 L8.74 13.25 L4.39 9.73 L10.0 9.45 Z"
          fill={color}
          stroke={color}
        />
      );

    case "trash":
      return (
        <>
          <path d="M5.5 7 L18.5 7 L17.4 20 H6.6 Z" />
          <line x1="4" y1="7" x2="20" y2="7" />
          <path d="M9.5 7 V4.5 H14.5 V7" />
          <line x1="10.5" y1="11" x2="10.5" y2="16.5" />
          <line x1="13.5" y1="11" x2="13.5" y2="16.5" />
        </>
      );

    case "restore":
      return (
        <>
          <path d="M 7.58 18.06 A 7.5 7.5 0 1 1 18.52 15.7" />
          <path d="M 4.6 8.4 L 4.2 13 L 8.8 12.3" />
        </>
      );

    case "recent":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7.5 V12.3 L15.5 14.2" />
        </>
      );

    case "grid":
      return (
        <>
          <rect x="4.5" y="4.5" width="6" height="6" rx="1.6" />
          <rect x="13.5" y="4.5" width="6" height="6" rx="1.6" />
          <rect x="4.5" y="13.5" width="6" height="6" rx="1.6" />
          <rect x="13.5" y="13.5" width="6" height="6" rx="1.6" />
        </>
      );

    case "list":
      return (
        <>
          <circle cx="5" cy="6.5" r="1.1" fill={color} stroke="none" />
          <line x1="9" y1="6.5" x2="19.5" y2="6.5" />
          <circle cx="5" cy="12" r="1.1" fill={color} stroke="none" />
          <line x1="9" y1="12" x2="19.5" y2="12" />
          <circle cx="5" cy="17.5" r="1.1" fill={color} stroke="none" />
          <line x1="9" y1="17.5" x2="19.5" y2="17.5" />
        </>
      );

    case "more":
      return (
        <>
          <circle cx="6" cy="12" r="1.5" fill={color} stroke="none" />
          <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
          <circle cx="18" cy="12" r="1.5" fill={color} stroke="none" />
        </>
      );

    case "chevron-right":
      return <path d="M9.5 5.5 L16 12 L9.5 18.5" />;

    case "chevron-left":
    case "arrow-left":
      return <path d="M14.5 5.5 L8 12 L14.5 18.5" />;

    case "chevron-down":
      return <path d="M5.5 9.5 L12 16 L18.5 9.5" />;

    case "arrow-up":
    case "arrowUp":
      return (
        <>
          <line x1="12" y1="19" x2="12" y2="5" />
          <path d="M6.5 10.5 L12 5 L17.5 10.5" />
        </>
      );

    case "arrow-down":
    case "arrowDown":
      return (
        <>
          <line x1="12" y1="5" x2="12" y2="19" />
          <path d="M6.5 13.5 L12 19 L17.5 13.5" />
        </>
      );

    case "filter":
      return (
        <path
          d="M3.5 6 L20.5 6 L14 13 V19.5 L10 17.5 V13 Z"
        />
      );

    case "close":
      return (
        <>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </>
      );

    case "check":
      return <path d="M5 12.5 L10 17.5 L19 6.5" />;

    case "link":
      return (
        <>
          <line x1="10" y1="14" x2="14" y2="10" />
          <path d="M9 15.5 L7 17.5 Q4.5 20 6.5 22 Q8.5 24 11 21.5 L13 19.5" />
          <path d="M15 8.5 L17 6.5 Q19.5 4 17.5 2 Q15.5 0 13 2.5 L11 4.5" />
        </>
      );

    case "users":
    case "people":
      return (
        <>
          <circle cx="9" cy="8.5" r="3.2" />
          <path d="M3.5 19 Q3.5 14 9 14 Q14.5 14 14.5 19" />
          <path d="M17.65 5.56 A3.2 3.2 0 0 1 17.65 11.44" />
          <path d="M16.5 14 Q21 14.4 21 19" />
        </>
      );

    case "user":
    case "person":
      return (
        <>
          <circle cx="12" cy="8.5" r="3.6" />
          <path d="M5 19.5 Q5 14 12 14 Q19 14 19 19.5" />
        </>
      );

    case "device":
      return (
        <>
          <rect x="7" y="3" width="10" height="18" rx="2.4" />
          <line x1="10.5" y1="18" x2="13.5" y2="18" />
        </>
      );

    case "storage":
    case "drive":
      return (
        <>
          <rect x="3" y="6.5" width="18" height="11" rx="2.6" />
          <circle cx="17" cy="12" r="1.4" fill={color} stroke="none" />
          <line x1="6.5" y1="12" x2="12.5" y2="12" />
        </>
      );

    case "server":
      return (
        <>
          <rect x="3.5" y="4" width="17" height="6.5" rx="2" />
          <rect x="3.5" y="13.5" width="17" height="6.5" rx="2" />
          <circle cx="7" cy="7.2" r="1.1" fill={color} stroke="none" />
          <circle cx="7" cy="16.8" r="1.1" fill={color} stroke="none" />
        </>
      );

    case "eye":
      return (
        <>
          <path d="M2.5 12 Q7 5.5 12 5.5 Q17 5.5 21.5 12 Q17 18.5 12 18.5 Q7 18.5 2.5 12 Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      );

    case "eye-off":
      return (
        <>
          <path d="M3.5 12 Q7.5 6 12 6 Q16.5 6 20.5 12" />
          <circle cx="12" cy="12.5" r="2.8" />
          <line x1="4.5" y1="4.5" x2="19.5" y2="19.5" />
        </>
      );

    case "rename":
    case "edit":
      return <path d="M4.5 19.5 L5.4 15.5 L16 5 L19 8 L8.5 18.6 Z" />;

    case "move":
      return (
        <>
          <line x1="4" y1="12" x2="15" y2="12" />
          <path d="M11.5 8 L15.5 12 L11.5 16" />
          <line x1="18.5" y1="5" x2="18.5" y2="19" />
        </>
      );

    case "copy":
      return (
        <>
          <rect x="8" y="8" width="12" height="12" rx="2.4" />
          <path d="M16 5.5 H6.5 Q4.5 5.5 4.5 7.5 V16.5" />
        </>
      );

    case "info":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="8" r="1.1" fill={color} stroke="none" />
          <line x1="12" y1="11" x2="12" y2="16.5" />
        </>
      );

    case "alert":
    case "warning":
      return (
        <>
          <path d="M12 3.5 L21 19.5 H3 Z" />
          <line x1="12" y1="9" x2="12" y2="14" />
          <circle cx="12" cy="16.8" r="1.1" fill={color} stroke="none" />
        </>
      );

    case "offline":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <line x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
        </>
      );

    case "offline-ready":
    case "offlineReady":
      return (
        <>
          <circle cx="12" cy="12" r="8" fill={color} stroke="none" />
          <path
            d="M8 12.2 L11 15.2 L16 9"
            fill="none"
            stroke="var(--bg-primary, #ffffff)"
            strokeWidth={strokeWidth + 0.3}
          />
        </>
      );

    case "play":
      return <path d="M8.5 5.5 L18.5 12 L8.5 18.5 Z" fill={color} stroke={color} />;

    case "pause":
      return (
        <>
          <line x1="9" y1="5.5" x2="9" y2="18.5" />
          <line x1="15" y1="5.5" x2="15" y2="18.5" />
        </>
      );

    case "volume":
      return (
        <>
          <path d="M4 9.5 H7.5 L11.5 5.5 V18.5 L7.5 14.5 H4 Z" />
          <path d="M 14.6 9.4 A 5 5 0 0 1 14.6 14.6" />
        </>
      );

    case "volume-off":
      return (
        <>
          <path d="M4 9.5 H7.5 L11.5 5.5 V18.5 L7.5 14.5 H4 Z" />
          <line x1="15" y1="9.5" x2="20" y2="14.5" />
          <line x1="20" y1="9.5" x2="15" y2="14.5" />
        </>
      );

    case "fullscreen":
    case "expand":
      return <path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15" />;

    case "fullscreenExit":
    case "minimize":
      return <path d="M4 8 H8 V4 M16 4 V8 H20 M20 16 H16 V20 M8 20 V16 H4" />;

    case "image":
    case "gallery":
      return (
        <>
          <rect x="3.5" y="5" width="17" height="14" rx="2.6" />
          <circle cx="9" cy="10" r="1.7" />
          <path d="M4.5 17 L10 12.5 L14 16 L16.5 13.8 L19.5 17" />
        </>
      );

    case "video":
      return (
        <>
          <rect x="3.5" y="6" width="12" height="12" rx="2.4" />
          <path d="M15.5 9.5 L20.5 6.5 V17.5 L15.5 14.5 Z" />
        </>
      );

    case "audio":
    case "music":
      return (
        <>
          <path d="M9 17 V5.5 L19 3.5 V15" />
          <circle cx="6.6" cy="17.2" r="2.6" />
          <circle cx="16.6" cy="15.2" r="2.6" />
        </>
      );

    case "code":
      return (
        <>
          <path d="M8.5 7.5 L3.5 12 L8.5 16.5" />
          <path d="M15.5 7.5 L20.5 12 L15.5 16.5" />
          <line x1="13.5" y1="5" x2="10.5" y2="19" />
        </>
      );

    case "archive":
      return (
        <>
          <rect x="3.5" y="4.5" width="17" height="4.5" rx="1.6" />
          <path d="M5 9 V19.5 H19 V9" />
          <line x1="10" y1="13" x2="14" y2="13" />
        </>
      );

    case "activity":
      return <path d="M3 12.5 H7.5 L10 6.5 L14 18 L16.5 12.5 H21" />;

    case "logout":
      return (
        <>
          <path d="M14 5 H5.5 V19 H14" />
          <line x1="10" y1="12" x2="20" y2="12" />
          <path d="M16.5 8.5 L20 12 L16.5 15.5" />
        </>
      );

    case "qr":
      return (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1.2" />
          <rect x="14" y="4" width="6" height="6" rx="1.2" />
          <rect x="4" y="14" width="6" height="6" rx="1.2" />
          <rect x="14" y="14" width="2.5" height="2.5" fill={color} stroke="none" />
          <rect x="17.5" y="17.5" width="2.5" height="2.5" fill={color} stroke="none" />
        </>
      );

    case "sort":
      return (
        <>
          <line x1="4.5" y1="7" x2="15" y2="7" />
          <line x1="4.5" y1="12" x2="12" y2="12" />
          <line x1="4.5" y1="17" x2="9" y2="17" />
          <path d="M18 6 V18 M15.5 15.5 L18 18 L20.5 15.5" />
        </>
      );

    case "language":
    case "globe":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <path d="M12 4 Q16 8 16 12 Q16 16 12 20 Q8 16 8 12 Q8 8 12 4" />
        </>
      );

    case "wifi":
      return (
        <>
          <path d="M8.82 14.82 A4.5 4.5 0 0 1 15.18 14.82" />
          <path d="M6 12 A8.5 8.5 0 0 1 18 12" />
          <path d="M3.17 9.17 A12.5 12.5 0 0 1 20.83 9.17" />
          <circle cx="12" cy="18" r="1.4" fill={color} stroke="none" />
        </>
      );

    case "lock":
      return (
        <>
          <rect x="5" y="10.5" width="14" height="9.5" rx="2.4" />
          <path d="M8 10.5 V8 Q8 4 12 4 Q16 4 16 8 V10.5" />
        </>
      );

    case "refresh":
      return (
        <>
          <path d="M 16.05 6.06 A 7.5 7.5 0 1 0 19.5 12" />
          <path d="M15.5 2.8 L16.5 6.8 L12.5 7.2" />
        </>
      );

    case "pdf":
      return (
        <>
          <path d="M6 3.5 H14 L19 8.5 V20.5 H6 Z" />
          <path d="M14 3.5 V8.5 H19" />
          <path d="M9 13 H10.5 Q11.5 13 11.5 14 Q11.5 15 10.5 15 H9 V17" />
        </>
      );

    case "sheet":
      return (
        <>
          <path d="M6 3.5 H14 L19 8.5 V20.5 H6 Z" />
          <path d="M14 3.5 V8.5 H19" />
          <line x1="8.5" y1="12" x2="15.5" y2="12" />
          <line x1="8.5" y1="15" x2="15.5" y2="15" />
          <line x1="12" y1="12" x2="12" y2="15" />
        </>
      );

    case "slides":
      return (
        <>
          <path d="M6 3.5 H14 L19 8.5 V20.5 H6 Z" />
          <path d="M14 3.5 V8.5 H19" />
          <rect x="8.5" y="12" width="7" height="4" rx="1" />
        </>
      );

    case "sun":
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="2" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22" y2="12" />
          <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
          <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
          <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
          <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
        </>
      );

    case "moon":
      return <path d="M21 12.79 A9 9 0 1 1 11.21 3 A7 7 0 0 0 21 12.79 Z" />;

    default:
      return (
        <>
          <path d="M6 3.5 H14 L19 8.5 V20.5 H6 Z" />
          <path d="M14 3.5 V8.5 H19" />
        </>
      );
  }
}
