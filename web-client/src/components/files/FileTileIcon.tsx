"use client";

import React from "react";
import { Icon, type Glyph } from "@/components/Icon";
import type { NodeModel } from "@/lib/models";

export type Category =
  | "folder"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "code"
  | "archive"
  | "neutral";

export const CATEGORY_COLORS: Record<Category, string> = {
  folder: "#6E6E6E",
  document: "#4C8DFF",
  spreadsheet: "#4CAF6D",
  presentation: "#E8935C",
  pdf: "#E5646B",
  image: "#4C8DFF",
  video: "#4CC6C6",
  audio: "#EE7759",
  code: "#9B7BEF",
  archive: "#F59E0B",
  neutral: "#6E6E6E",
};

export const FOLDER_SWATCHES: Record<string, string> = {
  neutral: "#6E6E6E",
  blue: "#4C8DFF",
  green: "#4CAF6D",
  orange: "#E8935C",
  red: "#E5646B",
  purple: "#9B7BEF",
  teal: "#4CC6C6",
};

export function categoryOfNode(node: NodeModel): Category {
  if (node.type === "folder") return "folder";
  const mime = (node.mime_type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return "spreadsheet";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "presentation";
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("archive") || mime.includes("compressed")) return "archive";
  if (mime.includes("json") || mime.includes("javascript") || mime.includes("text/x-") || mime.includes("xml")) return "code";
  return "document";
}

function glyphForCategory(cat: Category): Glyph {
  switch (cat) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "code":
      return "code";
    case "archive":
      return "archive";
    case "pdf":
      return "pdf";
    case "spreadsheet":
      return "sheet";
    case "presentation":
      return "slides";
    default:
      return "file";
  }
}

/**
 * Layered file/folder icon matching Flutter's LdFileIcon and _SheetPainter.
 * Two or three overlapping shapes with no drop shadows or gradients.
 */
export function FileTileIcon({
  category,
  size = 48,
  folderColor,
}: {
  category: Category;
  size?: number;
  folderColor?: string;
}) {
  if (category === "folder") {
    const front = folderColor && folderColor in FOLDER_SWATCHES
      ? FOLDER_SWATCHES[folderColor]
      : FOLDER_SWATCHES.neutral;
    const back = "#3A3A3A";

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ display: "block" }}
      >
        {/* Back panel with folder tab */}
        <path
          d="M6 22C6 17.58 9.58 14 14 14H36L46 24H86C90.42 24 94 27.58 94 32V80C94 84.42 90.42 88 86 88H14C9.58 88 6 84.42 6 80V22Z"
          fill={back}
        />
        {/* Front flap panel */}
        <rect
          x="3"
          y="36"
          width="94"
          height="52"
          rx="10"
          fill={front}
        />
      </svg>
    );
  }

  const tint = CATEGORY_COLORS[category] || CATEGORY_COLORS.document;
  const back = "#282B30"; // darker companion sheet
  const glyph = glyphForCategory(category);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-block",
      }}
      aria-hidden="true"
    >
      {/* Back panel peeking out */}
      <div
        style={{
          position: "absolute",
          left: "18%",
          top: "8%",
          width: "60%",
          height: "78%",
          background: back,
          borderRadius: `${size * 0.1}px`,
        }}
      />
      {/* Front sheet with folded top-right corner */}
      <svg
        width={size * 0.66}
        height={size * 0.78}
        viewBox="0 0 66 78"
        style={{
          position: "absolute",
          left: "10%",
          top: "14%",
        }}
      >
        {/* Main body with diagonal corner cut */}
        <path
          d="M9 0H44L66 22V69C66 73.97 61.97 78 57 78H9C4.03 78 0 73.97 0 69V9C0 4.03 4.03 0 9 0Z"
          fill={tint}
        />
        {/* Fold triangle */}
        <path
          d="M44 0V17C44 19.76 46.24 22 49 22H66L44 0Z"
          fill={back}
          opacity="0.85"
        />
      </svg>
      {/* Centered category glyph on front sheet */}
      <div
        style={{
          position: "absolute",
          left: "24%",
          top: "44%",
          width: size * 0.38,
          height: size * 0.38,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#FFFFFF",
        }}
      >
        <Icon glyph={glyph} size={Math.round(size * 0.28)} strokeWidth={2.2} color="#FFFFFF" />
      </div>
    </div>
  );
}
