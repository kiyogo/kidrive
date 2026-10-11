/** Sizes, dates and names, formatted the way the Flutter client formats them. */

export function bytes(n: number): string {
  if (!n || n < 0) return "0 B";
  const unit = 1024;
  if (n < unit) return `${n} B`;
  const suffixes = ["KB", "MB", "GB", "TB", "PB"];
  let value = n / unit;
  let i = 0;
  while (value >= unit && i < suffixes.length - 1) {
    value /= unit;
    i++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${suffixes[i]}`;
}

/**
 * How long ago, in the words a person would use.
 *
 * Anything older than a week becomes a date: "37 days ago" is arithmetic the
 * reader has to undo, where a date is just the answer.
 */
/**
 * The language dates are written in.
 *
 * Ambient rather than a parameter on every call: a date is formatted in a
 * dozen places, and one caller forgetting to pass the locale is an English
 * date sitting in an Arabic screen, which is exactly the bug this had.
 */
import type { Locale } from "./l10n.generated";

let current: Locale = "vi";

export function setFormatLocale(locale: Locale) {
  current = locale;
}

export function relative(ms: number, locale = current): string {
  if (!ms) return "";
  const then = new Date(ms);
  const diff = Date.now() - ms;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    if (locale === "vi") return "vừa xong";
    if (locale === "ar") return "الآن";
    return "just now";
  }
  if (diff < hour) {
    const n = Math.floor(diff / minute);
    if (locale === "vi") return `${n} phút trước`;
    if (locale === "ar") return `منذ ${n} دقيقة`;
    return `${n} minute${n === 1 ? "" : "s"} ago`;
  }
  if (diff < day) {
    const n = Math.floor(diff / hour);
    if (locale === "vi") return `${n} giờ trước`;
    if (locale === "ar") return `منذ ${n} ساعة`;
    return `${n} hour${n === 1 ? "" : "s"} ago`;
  }
  if (diff < 7 * day) {
    const n = Math.floor(diff / day);
    if (locale === "vi") return `${n} ngày trước`;
    if (locale === "ar") return `منذ ${n} يوم`;
    return `${n} day${n === 1 ? "" : "s"} ago`;
  }
  const dateLocale = locale === "vi" ? "vi-VN" : locale === "ar" ? "ar" : "en-GB";
  return then.toLocaleDateString(dateLocale, {
    day: "numeric",
    month: "short",
    year: then.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function dateTime(ms: number, locale = current): string {
  if (!ms) return "";
  const dateLocale = locale === "vi" ? "vi-VN" : locale === "ar" ? "ar" : "en-GB";
  return new Date(ms).toLocaleString(dateLocale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The extension, uppercased, for the badge on a tile with no preview. */
export function extensionOf(name: string): string {
  const at = name.lastIndexOf(".");
  if (at <= 0 || at === name.length - 1) return "";
  return name.slice(at + 1).toUpperCase().slice(0, 4);
}

export function percent(used: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, (used / total) * 100));
}
