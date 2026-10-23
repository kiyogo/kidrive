"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { Api } from "./endpoints";

export interface DashboardSettings {
  language: "auto_geoip" | "vi" | "en" | "ar";
  theme: "system" | "light" | "dark";
  siteTitle: string;
  siteDescription: string;
  siteKeywords: string;
  faviconUrl: string;
}

export interface SSLCertificateDetails {
  domain: string;
  issuer: string;
  type: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  fingerprintSha256: string;
  certPem: string;
  keyPem: string;
  autoRenew: boolean;
}

export interface SecuritySettings {
  // Truy cập
  domain: string;
  port: number;
  enableLanAccess: boolean;
  enableRemoteAccess: boolean;

  // Bảng điều khiển SSL
  sslEnabled: boolean;
  sslStatus: "valid" | "expired" | "self_signed" | "pending";
  forceHttps: boolean;
  minTlsVersion: "TLS 1.2" | "TLS 1.3";
  certificate: SSLCertificateDetails;

  // Bảo vệ (Chống DDoS, Rate limit, Brute-force...)
  ddosProtection: boolean;
  underAttackMode: boolean;
  rateLimitEnabled: boolean;
  rateLimitRpm: number;
  bruteforceProtection: boolean;
  bruteforceMaxAttempts: number;
  bruteforceLockoutMinutes: number;
  ipBlacklist: string[];
  ipWhitelist: string[];
  geoBlockingEnabled: boolean;
  blockedCountries: string[];
  antiBotCaptcha: boolean;
}

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  language: "auto_geoip",
  theme: "system",
  siteTitle: "Local Drive - Lưu trữ đám mây gia đình & doanh nghiệp",
  siteDescription: "Nền tảng lưu trữ đám mây cá nhân tốc độ cao, hoàn toàn riêng tư trên phần cứng của bạn.",
  siteKeywords: "localdrive, nas, cloud storage, private cloud, luu tru dam may",
  faviconUrl: "",
};

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  domain: typeof window !== "undefined" ? window.location.hostname : "localdrive.lan",
  port: typeof window !== "undefined" ? (parseInt(window.location.port) || 9683) : 9683,
  enableLanAccess: true,
  enableRemoteAccess: true,

  sslEnabled: true,
  sslStatus: "valid",
  forceHttps: true,
  minTlsVersion: "TLS 1.3",
  certificate: {
    domain: typeof window !== "undefined" ? window.location.hostname || "localdrive.lan" : "localdrive.lan",
    issuer: "Let's Encrypt Authority X3",
    type: "ECDSA P-256",
    validFrom: "2026-10-21",
    validTo: "2027-01-19",
    daysRemaining: 90,
    fingerprintSha256: "DA:74:8F:5C:0A:A6:98:18:15:F7:55:24:E6:9D:74:2B:31:BB:E6:C4:5C:46:8C:A4:AF:7A:3C:AF:A4:3A:AC:C4",
    certPem: `-----BEGIN CERTIFICATE-----
MIIB+DCCAZ+gAwIBAgIQJ4EWSwU9DuxV9M2B3bqUCDAKBggqhkjOPQQDAjA/MSQw
IgYDVQQKExtMb2NhbERyaXZlIE5ldHdvcmsgU2VjdXJpdHkxFzAVBgNVBAMTDmxv
Y2FsZHJpdmUubGFuMB4XDTI2MTAyMTEwMDMxNloXDTI3MDExOTEwMDMxNlowPzEk
MCIGA1UEChMbTG9jYWxEcml2ZSBOZXR3b3JrIFNlY3VyaXR5MRcwFQYDVQQDEw5s
b2NhbGRyaXZlLmxhbjBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABDqZJtMLkWuc
2RQEHUj6VcHoEcnOYB7eBHwQkuVq3kznXvN8TbOpAWXc1i90BGY4pcH99cm4Uwo+
OjJDioQOkJKjfTB7MA4GA1UdDwEB/wQEAwIFoDAdBgNVHSUEFjAUBggrBgEFBQcD
AQYIKwYBBQUHAwIwDAYDVR0TAQH/BAIwADA8BgNVHREENTAzgg5sb2NhbGRyaXZl
LmxhboIJbG9jYWxob3N0hwR/AAABhxAAAAAAAAAAAAAAAAAAAAABMAoGCCqGSM49
BAMCA0cAMEQCIEImmyN1Ku0QOMQ4eo/mr3Ia9LJYHsQLztmQAKNnP3UWAiAhvYsf
IOvgzzmeSRG33ab6cQvw4WyRThMucjmW9kYSOQ==
-----END CERTIFICATE-----`,
    keyPem: `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgjDs1CyJIjwLI7JIK
HiqnP4CRA8vyRuXfrXzLMHHNrfChRANCAAQ6mSbTC5FrnNkUBB1I+lXB6BHJzmAe
3gR8EJLlat5M517zfE2zqQFl3NYvdARmOKXB/fXJuFMKPjoyQ4qEDpCS
-----END PRIVATE KEY-----`,
    autoRenew: true,
  },

  ddosProtection: true,
  underAttackMode: false,
  rateLimitEnabled: true,
  rateLimitRpm: 120,
  bruteforceProtection: true,
  bruteforceMaxAttempts: 5,
  bruteforceLockoutMinutes: 30,
  ipBlacklist: ["198.51.100.24", "203.0.113.88"],
  ipWhitelist: ["127.0.0.1", "192.168.1.0/24", "10.0.0.0/8"],
  geoBlockingEnabled: false,
  blockedCountries: ["RU", "KP"],
  antiBotCaptcha: false,
};

const KEY_DASHBOARD = "ld.system_dashboard";
const KEY_SECURITY = "ld.system_security";

export function getStoredDashboardSettings(): DashboardSettings {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY_DASHBOARD);
    if (!raw) return DEFAULT_DASHBOARD_SETTINGS;
    return { ...DEFAULT_DASHBOARD_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_DASHBOARD_SETTINGS;
  }
}

export function saveDashboardSettings(settings: DashboardSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY_DASHBOARD, JSON.stringify(settings));
    applyDashboardSettings(settings);
    window.dispatchEvent(new CustomEvent("ld:dashboard_settings_changed", { detail: settings }));
  } catch (e) {
    console.error("Failed to save dashboard settings:", e);
  }
}

export function getStoredSecuritySettings(): SecuritySettings {
  if (typeof window === "undefined") return DEFAULT_SECURITY_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY_SECURITY);
    if (!raw) return DEFAULT_SECURITY_SETTINGS;
    const parsed = JSON.parse(raw);
    if (!parsed.certificate?.keyPem || parsed.certificate.keyPem.includes("7u7u7u")) {
      parsed.certificate = DEFAULT_SECURITY_SETTINGS.certificate;
    }
    return { ...DEFAULT_SECURITY_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SECURITY_SETTINGS;
  }
}

export function saveSecuritySettings(settings: SecuritySettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY_SECURITY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("ld:security_settings_changed", { detail: settings }));
  } catch (e) {
    console.error("Failed to save security settings:", e);
  }
}

/**
 * Applies site title, meta description, keywords, favicon and defaults to the document.
 */
export function applyDashboardSettings(settings: DashboardSettings): void {
  if (typeof document === "undefined") return;

  // Title
  if (settings.siteTitle) {
    document.title = settings.siteTitle;
  }

  // Meta description
  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement("meta");
    metaDesc.setAttribute("name", "description");
    document.head.appendChild(metaDesc);
  }
  metaDesc.setAttribute("content", settings.siteDescription || "");

  // Meta keywords
  let metaKeywords = document.querySelector('meta[name="keywords"]');
  if (!metaKeywords) {
    metaKeywords = document.createElement("meta");
    metaKeywords.setAttribute("name", "keywords");
    document.head.appendChild(metaKeywords);
  }
  metaKeywords.setAttribute("content", settings.siteKeywords || "");

  // Favicon
  if (settings.faviconUrl) {
    let linkIcon = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
    if (!linkIcon) {
      linkIcon = document.createElement("link");
      linkIcon.rel = "icon";
      document.head.appendChild(linkIcon);
    }
    linkIcon.href = settings.faviconUrl;
  }

  // Default theme if not already customized by user
  if (!localStorage.getItem("ld.theme") && settings.theme) {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }

  // Default locale if not already picked
  if (!localStorage.getItem("ld.locale.chosen") && settings.language) {
    if (settings.language === "auto_geoip") {
      // Auto-detect based on navigator language or GeoIP
      const navLang = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "vi";
      const detected = navLang.startsWith("vi") ? "vi" : navLang.startsWith("ar") ? "ar" : "en";
      document.documentElement.lang = detected;
      document.documentElement.dir = detected === "ar" ? "rtl" : "ltr";
    } else {
      document.documentElement.lang = settings.language;
      document.documentElement.dir = settings.language === "ar" ? "rtl" : "ltr";
    }
  }
}

export function useSystemDashboard() {
  const [dashboard, setDashboard] = useState<DashboardSettings>(getStoredDashboardSettings);

  useEffect(() => {
    const current = getStoredDashboardSettings();
    setDashboard(current);
    applyDashboardSettings(current);

    const onUpdate = (e: any) => {
      setDashboard(e.detail || getStoredDashboardSettings());
    };
    window.addEventListener("ld:dashboard_settings_changed", onUpdate);
    return () => window.removeEventListener("ld:dashboard_settings_changed", onUpdate);
  }, []);

  const updateDashboard = (patch: Partial<DashboardSettings>) => {
    const next = { ...dashboard, ...patch };
    setDashboard(next);
    saveDashboardSettings(next);
  };

  return { dashboard, updateDashboard };
}

export function useSystemSecurity() {
  const [security, setSecurity] = useState<SecuritySettings>(getStoredSecuritySettings);

  useEffect(() => {
    setSecurity(getStoredSecuritySettings());

    const onUpdate = (e: any) => {
      setSecurity(e.detail || getStoredSecuritySettings());
    };
    window.addEventListener("ld:security_settings_changed", onUpdate);
    return () => window.removeEventListener("ld:security_settings_changed", onUpdate);
  }, []);

  const updateSecurity = (patch: Partial<SecuritySettings>) => {
    const next = { ...security, ...patch };
    setSecurity(next);
    saveSecuritySettings(next);
  };

  return { security, updateSecurity };
}
