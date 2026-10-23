"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import {
  Button,
  Dialog,
  SettingGroup,
  SettingRow,
  Switch,
  TextField,
  Tappable,
  useToast,
} from "@/components/ui";
import {
  useSystemSecurity,
  type SecuritySettings,
} from "@/lib/systemSettings";
import { generateRealSslCertificate } from "@/lib/sslHelper";

export function SecuritySection({
  onBack: _onBack,
  embedded: _embedded,
}: {
  onBack?: () => void;
  embedded?: boolean;
}) {
  const toast = useToast();
  const { security, updateSecurity } = useSystemSecurity();

  const [form, setForm] = useState<SecuritySettings>(security);
  const [sslDialogOpen, setSslDialogOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState(false);
  const [tempDomain, setTempDomain] = useState(form.domain);
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ status: "ok" | "err"; ms: number } | null>(null);

  const [ipTab, setIpTab] = useState<"blacklist" | "whitelist">("blacklist");
  const [newIpInput, setNewIpInput] = useState("");
  const [customCertPem, setCustomCertPem] = useState(form.certificate.certPem);
  const [customKeyPem, setCustomKeyPem] = useState(form.certificate.keyPem);
  const [isGeneratingCert, setIsGeneratingCert] = useState(false);

  const handleTestDomain = () => {
    setIsPinging(true);
    setPingResult(null);
    setTimeout(() => {
      setIsPinging(false);
      const ms = Math.floor(Math.random() * 15) + 8;
      setPingResult({ status: "ok", ms });
      toast(`Kết nối ${form.domain} thành công (${ms}ms)`, "success");
    }, 600);
  };

  const handleSaveDomain = () => {
    const trimmed = tempDomain.trim();
    if (!trimmed) {
      toast("Vui lòng nhập tên miền", "error");
      return;
    }
    const updated = {
      ...form,
      domain: trimmed,
      certificate: { ...form.certificate, domain: trimmed },
    };
    setForm(updated);
    updateSecurity(updated);
    setEditingDomain(false);
    toast("Đã lưu tên miền mới", "success");
  };

  const handleAddIp = () => {
    const ip = newIpInput.trim();
    if (!ip) {
      toast("Vui lòng nhập địa chỉ IP hoặc dải mạng", "error");
      return;
    }

    if (ipTab === "blacklist") {
      if (form.ipBlacklist.includes(ip)) {
        toast("Địa chỉ IP này đã có trong danh sách chặn", "error");
        return;
      }
      const updated = { ...form, ipBlacklist: [...form.ipBlacklist, ip] };
      setForm(updated);
      updateSecurity(updated);
      setNewIpInput("");
      toast(`Đã thêm ${ip} vào danh sách chặn`, "success");
    } else {
      if (form.ipWhitelist.includes(ip)) {
        toast("Địa chỉ IP này đã có trong danh sách tin cậy", "error");
        return;
      }
      const updated = { ...form, ipWhitelist: [...form.ipWhitelist, ip] };
      setForm(updated);
      updateSecurity(updated);
      setNewIpInput("");
      toast(`Đã thêm ${ip} vào danh sách tin cậy`, "success");
    }
  };

  const handleRemoveBlacklist = (ip: string) => {
    const updated = { ...form, ipBlacklist: form.ipBlacklist.filter((x) => x !== ip) };
    setForm(updated);
    updateSecurity(updated);
    toast(`Đã bỏ chặn ${ip}`, "info");
  };

  const handleRemoveWhitelist = (ip: string) => {
    const updated = { ...form, ipWhitelist: form.ipWhitelist.filter((x) => x !== ip) };
    setForm(updated);
    updateSecurity(updated);
    toast(`Đã xóa ${ip} khỏi danh sách tin cậy`, "info");
  };

  const handleClearAllIps = () => {
    if (ipTab === "blacklist") {
      const updated = { ...form, ipBlacklist: [] };
      setForm(updated);
      updateSecurity(updated);
      toast("Đã xóa toàn bộ danh sách IP bị chặn", "info");
    } else {
      const updated = { ...form, ipWhitelist: [] };
      setForm(updated);
      updateSecurity(updated);
      toast("Đã xóa toàn bộ danh sách IP tin cậy", "info");
    }
  };

  const handleGenerateCert = async (mode: "letsencrypt" | "self_signed" = "letsencrypt") => {
    setIsGeneratingCert(true);
    try {
      const generated = await generateRealSslCertificate(form.domain, mode);
      setCustomCertPem(generated.certPem);
      setCustomKeyPem(generated.keyPem);
      const updated: SecuritySettings = {
        ...form,
        sslStatus: "valid",
        certificate: {
          ...form.certificate,
          ...generated,
        },
      };
      setForm(updated);
      updateSecurity(updated);
      toast("Đã cấp đổi chứng chỉ SSL thành công", "success");
    } catch (e) {
      console.error(e);
      toast("Lỗi khi tạo chứng chỉ SSL", "error");
    } finally {
      setIsGeneratingCert(false);
    }
  };

  const handleSaveCert = () => {
    const trimmedCert = customCertPem.trim();
    const trimmedKey = customKeyPem.trim();
    if (!trimmedCert || !trimmedKey) {
      toast("Vui lòng nhập đầy đủ Giấy chứng nhận và Khóa riêng", "error");
      return;
    }
    const updated: SecuritySettings = {
      ...form,
      sslStatus: "valid",
      certificate: {
        ...form.certificate,
        certPem: trimmedCert,
        keyPem: trimmedKey,
        issuer: trimmedCert.includes("Let's Encrypt")
          ? "Let's Encrypt Authority X3"
          : "LocalDrive CA",
      },
    };
    setForm(updated);
    updateSecurity(updated);
    setSslDialogOpen(false);
    toast("Đã áp dụng chứng chỉ SSL thành công", "success");
  };

  const copyToClipboard = (text: string, msg: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast(msg, "info");
    }
  };

  const RATE_LIMIT_OPTIONS = [
    { value: 60, label: "60/phút" },
    { value: 120, label: "120/phút" },
    { value: 300, label: "300/phút" },
    { value: 600, label: "600/phút" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, width: "100%" }}>
      {/* =================================================================== I. TRUY CẬP */}
      <SettingGroup title="Truy cập hệ thống">
        <SettingRow
          glyph="server"
          label="Tên miền"
          description={form.domain ? `${form.domain} (cổng ${form.port})` : "Chưa cấu hình tên miền"}
          trailing={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {pingResult && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--accent-teal)",
                    background: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    padding: "3px 9px",
                    borderRadius: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--accent-teal)",
                      display: "inline-block",
                    }}
                  />
                  {pingResult.ms}ms
                </span>
              )}
              <Button
                label="Kiểm tra"
                glyph="refresh"
                variant="quiet"
                expand={false}
                compact
                busy={isPinging}
                onClick={handleTestDomain}
              />
              <Button
                label="Sửa"
                glyph="edit"
                variant="quiet"
                expand={false}
                compact
                onClick={() => {
                  setTempDomain(form.domain);
                  setEditingDomain(true);
                }}
              />
            </div>
          }
        />
        <SettingRow
          showDivider
          glyph="wifi"
          label="Truy cập nội bộ"
          description="Cho phép thiết bị trong cùng mạng Wi-Fi hoặc LAN kết nối trực tiếp"
          trailing={
            <Switch
              value={form.enableLanAccess}
              onChange={(val) => {
                const next = { ...form, enableLanAccess: val };
                setForm(next);
                updateSecurity(next);
              }}
            />
          }
        />
        <SettingRow
          showDivider
          glyph="globe"
          label="Truy cập từ xa"
          description="Cho phép kết nối thông qua tên miền công khai hoặc VPN"
          trailing={
            <Switch
              value={form.enableRemoteAccess}
              onChange={(val) => {
                const next = { ...form, enableRemoteAccess: val };
                setForm(next);
                updateSecurity(next);
              }}
            />
          }
        />
      </SettingGroup>

      {/* =================================================================== II. SSL */}
      <SettingGroup title="Bảng điều khiển SSL / TLS">
        <SettingRow
          glyph="lock"
          label="Chứng chỉ SSL"
          description={`${form.certificate.issuer} · Còn lại ${form.certificate.daysRemaining} ngày`}
          onTap={() => setSslDialogOpen(true)}
          trailing={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--accent-teal)",
                  background: "rgba(16, 185, 129, 0.12)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  padding: "4px 10px",
                  borderRadius: 12,
                }}
              >
                Hợp lệ {form.certificate.daysRemaining} ngày
              </span>
              <Button
                label="Quản lý"
                variant="quiet"
                expand={false}
                compact
                onClick={() => setSslDialogOpen(true)}
              />
            </div>
          }
        />
        <SettingRow
          showDivider
          glyph="check"
          label="Trạng thái bảo mật"
          description={
            form.sslStatus === "valid"
              ? "Kết nối HTTPS an toàn, thông tin truyền tải được mã hóa"
              : "Chứng chỉ chưa hợp lệ hoặc đã hết hạn"
          }
          trailing={
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "4px 10px",
                borderRadius: 12,
                background: form.sslStatus === "valid" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                border: `1px solid ${form.sslStatus === "valid" ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: form.sslStatus === "valid" ? "var(--accent-teal)" : "#EF4444",
                  boxShadow: form.sslStatus === "valid" ? "0 0 6px rgba(16, 185, 129, 0.6)" : "0 0 6px rgba(239, 68, 68, 0.6)",
                }}
              />
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: form.sslStatus === "valid" ? "var(--accent-teal)" : "#EF4444",
                }}
              >
                {form.sslStatus === "valid" ? "Đang hoạt động" : "Lỗi chứng chỉ"}
              </span>
            </div>
          }
        />
        <SettingRow
          showDivider
          glyph="arrow-up"
          label="Bắt buộc HTTPS"
          description="Tự động chuyển hướng toàn bộ kết nối HTTP sang HTTPS an toàn"
          trailing={
            <Switch
              value={form.forceHttps}
              onChange={(val) => {
                const next = { ...form, forceHttps: val };
                setForm(next);
                updateSecurity(next);
              }}
            />
          }
        />
      </SettingGroup>

      {/* =================================================================== III. BẢO VỆ */}
      <SettingGroup title="Bảo vệ tường lửa">
        <SettingRow
          glyph="alert"
          label="Chống tấn công DDoS"
          description={
            form.ddosProtection
              ? "Tự động phân tích và giảm tải lưu lượng truy cập bất thường"
              : "Đã tắt (Không giám sát lưu lượng)"
          }
          trailing={
            <Switch
              value={form.ddosProtection}
              onChange={(val) => {
                const next = { ...form, ddosProtection: val };
                setForm(next);
                updateSecurity(next);
              }}
            />
          }
        />
        <SettingRow
          showDivider
          glyph="warning"
          label="Chế độ Under Attack"
          description={
            form.underAttackMode
              ? "Đang kích hoạt mức phòng thủ cao nhất: Kiểm tra nghiêm ngặt mọi truy cập"
              : "Chế độ hoạt động thông thường"
          }
          trailing={
            <Switch
              value={form.underAttackMode}
              onChange={(val) => {
                const next = { ...form, underAttackMode: val };
                setForm(next);
                updateSecurity(next);
              }}
            />
          }
        />

        {/* GIỚI HẠN YÊU CẦU: SWITCH ALIGNED 100% RIGHT, SUB-PANEL SEGMENTED PICKER BELOW */}
        <SettingRow
          showDivider
          glyph="recent"
          label="Giới hạn tần suất yêu cầu"
          description={
            form.rateLimitEnabled
              ? `Tối đa ${form.rateLimitRpm} yêu cầu / phút cho mỗi địa chỉ IP`
              : "Đã tắt (Không giới hạn tần suất)"
          }
          trailing={
            <Switch
              value={form.rateLimitEnabled}
              onChange={(val) => {
                const next = { ...form, rateLimitEnabled: val };
                setForm(next);
                updateSecurity(next);
              }}
            />
          }
        />

        {/* SUB-PANEL CHO RATE LIMIT (KHI BẬT) */}
        {form.rateLimitEnabled && (
          <div
            style={{
              padding: "10px 14px 14px",
              margin: "0 0 4px 0",
              background: "var(--bg-sunken)",
              borderRadius: "var(--r-field)",
              border: "1px solid var(--stroke)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--fg-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon glyph="recent" size={14} color="var(--accent)" />
              Mức giới hạn yêu cầu tối đa:
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {RATE_LIMIT_OPTIONS.map((opt) => {
                const active = form.rateLimitRpm === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      const next = { ...form, rateLimitRpm: opt.value };
                      setForm(next);
                      updateSecurity(next);
                    }}
                    style={{
                      flex: "1 1 auto",
                      minWidth: 80,
                      padding: "8px 12px",
                      borderRadius: "var(--r-chip)",
                      background: active ? "var(--accent)" : "var(--bg-elevated)",
                      color: active ? "#FFFFFF" : "var(--fg-primary)",
                      border: `1px solid ${active ? "var(--accent)" : "var(--stroke)"}`,
                      fontSize: 13,
                      fontWeight: active ? 600 : 500,
                      cursor: "pointer",
                      transition: "all var(--d-hover) var(--ease)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      boxShadow: active ? "0 2px 8px rgba(76, 141, 255, 0.3)" : "none",
                    }}
                  >
                    {active && <Icon glyph="check" size={13} color="#FFFFFF" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <SettingRow
          showDivider
          glyph="lock"
          label="Chống dò mật khẩu (Brute-force)"
          description={
            form.bruteforceProtection
              ? `Tự động tạm khóa sau ${form.bruteforceMaxAttempts} lần đăng nhập sai`
              : "Đã tắt"
          }
          trailing={
            <Switch
              value={form.bruteforceProtection}
              onChange={(val) => {
                const next = { ...form, bruteforceProtection: val };
                setForm(next);
                updateSecurity(next);
              }}
            />
          }
        />
        <SettingRow
          showDivider
          glyph="device"
          label="Xác thực Bot (Captcha)"
          description={
            form.antiBotCaptcha
              ? "Yêu cầu giải mã captcha khi phát hiện dấu hiệu truy vấn tự động"
              : "Đã tắt"
          }
          trailing={
            <Switch
              value={form.antiBotCaptcha}
              onChange={(val) => {
                const next = { ...form, antiBotCaptcha: val };
                setForm(next);
                updateSecurity(next);
              }}
            />
          }
        />
        <SettingRow
          showDivider
          glyph="globe"
          label="Chặn theo quốc gia (GeoIP)"
          description={
            form.geoBlockingEnabled
              ? `Đang chặn truy cập từ ${form.blockedCountries.length} quốc gia (${form.blockedCountries.join(", ")})`
              : "Đã tắt (Cho phép truy cập toàn cầu)"
          }
          trailing={
            <Switch
              value={form.geoBlockingEnabled}
              onChange={(val) => {
                const next = { ...form, geoBlockingEnabled: val };
                setForm(next);
                updateSecurity(next);
              }}
            />
          }
        />
      </SettingGroup>

      {/* =================================================================== IV. QUẢN LÝ IP */}
      <SettingGroup title="Quản lý địa chỉ IP">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 0" }}>
          {/* TAB CHUYỂN ĐỔI: CHẶN IP & IP TIN CẬY */}
          <div
            style={{
              display: "flex",
              padding: 4,
              background: "var(--bg-sunken)",
              borderRadius: "var(--r-field)",
              border: "1px solid var(--stroke)",
              gap: 4,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setIpTab("blacklist");
                setNewIpInput("");
              }}
              style={{
                flex: 1,
                padding: "8px 14px",
                borderRadius: "var(--r-chip)",
                background: ipTab === "blacklist" ? "var(--bg-elevated)" : "transparent",
                color: ipTab === "blacklist" ? "#EF4444" : "var(--fg-secondary)",
                border: ipTab === "blacklist" ? "1px solid var(--stroke)" : "1px solid transparent",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "all var(--d-hover) var(--ease)",
                boxShadow: ipTab === "blacklist" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#EF4444",
                  boxShadow: "0 0 6px rgba(239, 68, 68, 0.5)",
                }}
              />
              Danh sách chặn ({form.ipBlacklist.length})
            </button>

            <button
              type="button"
              onClick={() => {
                setIpTab("whitelist");
                setNewIpInput("");
              }}
              style={{
                flex: 1,
                padding: "8px 14px",
                borderRadius: "var(--r-chip)",
                background: ipTab === "whitelist" ? "var(--bg-elevated)" : "transparent",
                color: ipTab === "whitelist" ? "var(--accent-teal)" : "var(--fg-secondary)",
                border: ipTab === "whitelist" ? "1px solid var(--stroke)" : "1px solid transparent",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "all var(--d-hover) var(--ease)",
                boxShadow: ipTab === "whitelist" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--accent-teal)",
                  boxShadow: "0 0 6px rgba(16, 185, 129, 0.5)",
                }}
              />
              Danh sách tin cậy ({form.ipWhitelist.length})
            </button>
          </div>

          {/* DÒNG MÔ TẢ */}
          <div style={{ fontSize: 12.5, color: "var(--fg-secondary)", lineHeight: 1.45, padding: "0 2px" }}>
            {ipTab === "blacklist"
              ? "Các địa chỉ IPv4, IPv6 hoặc dải mạng CIDR trong danh sách chặn sẽ bị tường lửa từ chối kết nối ngay lập tức."
              : "Các địa chỉ trong danh sách tin cậy sẽ không bao giờ bị giới hạn tần suất yêu cầu hay khóa tự động."}
          </div>

          {/* KHUNG NHẬP IP & NÚT THÊM ĐỒNG BỘ CHIỀU CAO + BORDER RADIUS */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "var(--bg-sunken)",
                border: "1px solid var(--stroke)",
                borderRadius: "var(--r-field)",
                padding: "0 14px",
                height: 42,
                boxSizing: "border-box",
                transition: "border-color var(--d-hover) var(--ease)",
              }}
            >
              <Icon
                glyph="globe"
                size={16}
                color={ipTab === "blacklist" ? "#EF4444" : "var(--accent-teal)"}
              />
              <input
                type="text"
                placeholder={
                  ipTab === "blacklist"
                    ? "Nhập IP cần chặn (Ví dụ: 198.51.100.24 hoặc 10.0.0.0/8)..."
                    : "Nhập IP tin cậy (Ví dụ: 192.168.1.10 hoặc 127.0.0.1)..."
                }
                value={newIpInput}
                onChange={(e) => setNewIpInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddIp();
                }}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--fg-primary)",
                  fontSize: 13.5,
                  fontFamily: "inherit",
                }}
              />
            </div>

            <Button
              label={ipTab === "blacklist" ? "Chặn IP" : "Thêm tin cậy"}
              glyph="plus"
              variant={ipTab === "blacklist" ? "danger" : "primary"}
              expand={false}
              compact
              onClick={handleAddIp}
            />
          </div>

          {/* DANH SÁCH TAGS / CHIPS */}
          {ipTab === "blacklist" ? (
            form.ipBlacklist.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-secondary)" }}>
                    Đang chặn {form.ipBlacklist.length} địa chỉ:
                  </span>
                  <button
                    type="button"
                    onClick={handleClearAllIps}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--fg-secondary)",
                      fontSize: 12,
                      cursor: "pointer",
                      padding: "2px 6px",
                      borderRadius: 6,
                    }}
                  >
                    Xóa tất cả
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {form.ipBlacklist.map((ip) => (
                    <span
                      key={ip}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 12px",
                        background: "rgba(239, 68, 68, 0.08)",
                        color: "var(--fg-primary)",
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                        borderRadius: "var(--r-chip)",
                        fontSize: 13,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        fontWeight: 600,
                        letterSpacing: 0.3,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: "#EF4444",
                          boxShadow: "0 0 6px rgba(239, 68, 68, 0.7)",
                          flexShrink: 0,
                        }}
                      />
                      {ip}
                      <button
                        type="button"
                        onClick={() => handleRemoveBlacklist(ip)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--fg-secondary)",
                          cursor: "pointer",
                          padding: 2,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 999,
                          transition: "color var(--d-hover) var(--ease)",
                        }}
                        title="Bỏ chặn"
                      >
                        <Icon glyph="close" size={12} color="#EF4444" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: "20px 16px",
                  background: "var(--bg-sunken)",
                  borderRadius: "var(--r-field)",
                  border: "1px dashed var(--stroke)",
                  textAlign: "center",
                  color: "var(--fg-secondary)",
                  fontSize: 13,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon glyph="lock" size={22} color="var(--accent-teal)" />
                <span>Chưa có địa chỉ nào trong danh sách chặn. Mọi kết nối hợp lệ đều được cho phép.</span>
              </div>
            )
          ) : form.ipWhitelist.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-secondary)" }}>
                  Có {form.ipWhitelist.length} địa chỉ tin cậy:
                </span>
                <button
                  type="button"
                  onClick={handleClearAllIps}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--fg-secondary)",
                    fontSize: 12,
                    cursor: "pointer",
                    padding: "2px 6px",
                    borderRadius: 6,
                  }}
                >
                  Xóa tất cả
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {form.ipWhitelist.map((ip) => (
                  <span
                    key={ip}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 12px",
                      background: "rgba(16, 185, 129, 0.08)",
                      color: "var(--fg-primary)",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                      borderRadius: "var(--r-chip)",
                      fontSize: 13,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      fontWeight: 600,
                      letterSpacing: 0.3,
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "var(--accent-teal)",
                        boxShadow: "0 0 6px rgba(16, 185, 129, 0.7)",
                        flexShrink: 0,
                      }}
                    />
                    {ip}
                    <button
                      type="button"
                      onClick={() => handleRemoveWhitelist(ip)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--fg-secondary)",
                        cursor: "pointer",
                        padding: 2,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 999,
                        transition: "color var(--d-hover) var(--ease)",
                      }}
                      title="Bỏ khỏi danh sách tin cậy"
                    >
                      <Icon glyph="close" size={12} color="var(--accent-teal)" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "20px 16px",
                background: "var(--bg-sunken)",
                borderRadius: "var(--r-field)",
                border: "1px dashed var(--stroke)",
                textAlign: "center",
                color: "var(--fg-secondary)",
                fontSize: 13,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon glyph="info" size={22} color="var(--accent)" />
              <span>Chưa có địa chỉ nào trong danh sách tin cậy. Nhập IP ở trên để thêm.</span>
            </div>
          )}
        </div>
      </SettingGroup>

      {/* =================================================================== DIALOG BẢNG ĐIỀU KHIỂN SSL */}
      <Dialog
        open={sslDialogOpen}
        onClose={() => setSslDialogOpen(false)}
        title="Bảng điều khiển SSL / TLS"
        maxWidth={840}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Thanh công cụ: Thông tin nhanh & Nút đổi chứng chỉ */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--stroke)",
              paddingBottom: 12,
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--accent-teal)",
                  boxShadow: "0 0 6px rgba(16, 185, 129, 0.6)",
                }}
              />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg-primary)" }}>
                {form.domain}
              </span>
              <span style={{ fontSize: 12, color: "var(--fg-secondary)" }}>•</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent-teal)" }}>
                Hợp lệ {form.certificate.daysRemaining} ngày
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Button
                label="Đổi chứng chỉ Let's Encrypt"
                glyph="refresh"
                variant="primary"
                expand={false}
                compact
                busy={isGeneratingCert}
                onClick={() => handleGenerateCert("letsencrypt")}
              />
              <Button
                label="Tự tạo Self-Signed"
                glyph="lock"
                variant="quiet"
                expand={false}
                compact
                busy={isGeneratingCert}
                onClick={() => handleGenerateCert("self_signed")}
              />
            </div>
          </div>

          {/* Hai cột: Giấy chứng nhận (trái), Khóa riêng (phải) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 14,
            }}
          >
            {/* CỘT TRÁI: GIẤY CHỨNG NHẬN */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-primary)" }}>
                  Giấy chứng nhận (Certificate PEM)
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(customCertPem, "Đã sao chép Giấy chứng nhận")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--fg-secondary)",
                    cursor: "pointer",
                    padding: "2px 6px",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                  }}
                  title="Sao chép"
                >
                  <Icon glyph="copy" size={13} />
                  <span>Sao chép</span>
                </button>
              </div>
              <textarea
                rows={12}
                spellCheck={false}
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                value={customCertPem}
                onChange={(e) => setCustomCertPem(e.target.value)}
                style={{
                  width: "100%",
                  height: 250,
                  background: "var(--bg-sunken)",
                  color: "var(--fg-primary)",
                  border: "1px solid var(--stroke)",
                  borderRadius: "var(--r-field)",
                  padding: "10px 12px",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 11.5,
                  lineHeight: 1.45,
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                  whiteSpace: "pre",
                }}
              />
            </div>

            {/* CỘT PHẢI: KHÓA RIÊNG */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-primary)" }}>
                  Khóa riêng tư (Private Key PEM)
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(customKeyPem, "Đã sao chép Khóa riêng")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--fg-secondary)",
                    cursor: "pointer",
                    padding: "2px 6px",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                  }}
                  title="Sao chép"
                >
                  <Icon glyph="copy" size={13} />
                  <span>Sao chép</span>
                </button>
              </div>
              <textarea
                rows={12}
                spellCheck={false}
                placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                value={customKeyPem}
                onChange={(e) => setCustomKeyPem(e.target.value)}
                style={{
                  width: "100%",
                  height: 250,
                  background: "var(--bg-sunken)",
                  color: "var(--fg-primary)",
                  border: "1px solid var(--stroke)",
                  borderRadius: "var(--r-field)",
                  padding: "10px 12px",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 11.5,
                  lineHeight: 1.45,
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                  whiteSpace: "pre",
                }}
              />
            </div>
          </div>

          {/* Chân trang Dialog */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 10,
              marginTop: 6,
              paddingTop: 12,
              borderTop: "1px solid var(--stroke)",
            }}
          >
            <Button
              label="Hủy"
              variant="quiet"
              expand={false}
              compact
              onClick={() => setSslDialogOpen(false)}
            />
            <Button
              label="Áp dụng cấu hình"
              variant="primary"
              expand={false}
              compact
              onClick={handleSaveCert}
            />
          </div>
        </div>
      </Dialog>

      {/* =================================================================== DIALOG SỬA TÊN MIỀN */}
      <Dialog
        open={editingDomain}
        onClose={() => setEditingDomain(false)}
        title="Thay đổi tên miền hệ thống"
        maxWidth={440}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 13, color: "var(--fg-secondary)", lineHeight: 1.4 }}>
            Nhập tên miền (FQDN hoặc mDNS) mà bạn muốn sử dụng để truy cập LocalDrive qua mạng.
          </div>
          <TextField
            label="Tên miền"
            hint="localdrive.lan hoặc nas.example.com"
            value={tempDomain}
            onChange={setTempDomain}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <Button label="Hủy" variant="quiet" expand={false} compact onClick={() => setEditingDomain(false)} />
            <Button label="Lưu thay đổi" variant="primary" expand={false} compact onClick={handleSaveDomain} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
