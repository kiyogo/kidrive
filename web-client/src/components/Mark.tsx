/**
 * The Local Drive mark.
 *
 * Modern layered folder panels with an Apple-style smooth sloped tab, crisp sheet,
 * vibrant azure front panel, and a bold, crystal-clear cloud silhouette.
 *
 * The layers match the onboarding narrative:
 * - "closed": clean closed folder
 * - "connected": sheet rises up from the opening
 * - "syncing": sync indicator active on the cloud
 * - "complete": solid, bright white cloud symbol
 */
export function Mark({
  size = 64,
  className,
  stage = "complete",
}: {
  size?: number;
  className?: string;
  /** which layers are drawn, matching the onboarding steps */
  stage?: "closed" | "connected" | "syncing" | "complete";
}) {
  const showSheet = stage !== "closed";
  const isSyncing = stage === "syncing";
  const showCloud = stage !== "closed";

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="mark-back-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E40AF" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id="mark-front-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id="mark-sheet-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </linearGradient>
      </defs>

      {/* logo-back: the folder back and its modern rounded tab */}
      <path
        id="logo-back"
        d="M11 12 H24 C27 12 29 17 33 17 H53 C56 17 58 19 58 22 V46 C58 49 56 51 53 51 H11 C8 51 6 49 6 46 V17 C6 14 8 12 11 12 Z"
        fill="url(#mark-back-grad)"
      />

      {/* logo-sheet: contents peeking out */}
      {showSheet && (
        <path
          id="logo-sheet"
          d="M15 19 H49 C51 19 52 20 52 22 V43 H12 V22 C12 20 13 19 15 19 Z"
          fill="url(#mark-sheet-grad)"
        />
      )}

      {/* logo-front: the front panel, vibrant azure with sleek top highlight */}
      <path
        id="logo-front"
        d="M11 25 H53 C56 25 58 27 58 30 V46 C58 49 56 51 53 51 H11 C8 51 6 49 6 46 V30 C6 27 8 25 11 25 Z"
        fill="url(#mark-front-grad)"
      />
      <path
        id="logo-front-highlight"
        d="M11 25 H53 C56 25 58 27 58 30 V31 C58 28 56 26 53 26 H11 C8 26 6 28 6 31 V30 C6 27 8 25 11 25 Z"
        fill="#FFFFFF"
        fillOpacity={0.25}
      />

      {/* logo-cloud: bold crisp white cloud */}
      {showCloud && (
        <path
          id="logo-cloud"
          d="M 25 46 C 21.7 46 19 43.3 19 40 C 19 37.4 21.2 35.2 24.2 34.5 C 24.5 30.5 28.2 28 32 28 C 35.8 28 39.5 30.5 39.8 34.5 C 42.8 35.2 45 37.4 45 40 C 45 43.3 42.3 46 39 46 Z"
          fill="#FFFFFF"
          fillOpacity={stage === "connected" ? 0.7 : 1}
        />
      )}

      {/* syncing pulse indicator */}
      {isSyncing && (
        <circle
          cx="44"
          cy="32"
          r="3"
          fill="#60A5FA"
          stroke="#FFFFFF"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}

/** The mark beside the product name, for a header or a sign in screen. */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <Mark size={size} />
    </span>
  );
}
