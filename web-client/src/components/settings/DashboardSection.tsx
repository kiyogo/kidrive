"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  Button,
  RadioRow,
  SettingGroup,
  SettingRow,
  TextField,
  useToast,
} from "@/components/ui";
import {
  useSystemDashboard,
  type DashboardSettings,
} from "@/lib/systemSettings";

export function DashboardSection({
  onBack: _onBack,
  embedded: _embedded,
}: {
  onBack?: () => void;
  embedded?: boolean;
}) {
  const toast = useToast();
  const { dashboard, updateDashboard } = useSystemDashboard();

  const [form, setForm] = useState<DashboardSettings>(dashboard);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes("image") && !file.name.endsWith(".ico")) {
      toast("Vui lòng chọn tệp ảnh hợp lệ (ICO, PNG, SVG, JPG)", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setForm((prev) => ({ ...prev, faviconUrl: dataUrl }));
      toast("Đã nạp biểu tượng trang mới!", "info");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSave = () => {
    setIsSaving(true);
    try {
      updateDashboard(form);
      toast("Đã lưu cấu hình bảng điều khiển thành công!", "success");
    } catch {
      toast("Lỗi khi lưu cấu hình", "error");
    } finally {
      setTimeout(() => setIsSaving(false), 200);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, width: "100%" }}>
      {/* 1. Ngôn ngữ mặc định */}
      <SettingGroup title="Ngôn ngữ hệ thống">
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "2px 0" }}>
          <RadioRow
            label="Tự động phát hiện theo vùng (GeoIP)"
            selected={form.language === "auto_geoip"}
            onTap={() => setForm((p) => ({ ...p, language: "auto_geoip" }))}
          />
          <RadioRow
            label="Tiếng Việt (Mặc định)"
            selected={form.language === "vi"}
            onTap={() => setForm((p) => ({ ...p, language: "vi" }))}
          />
          <RadioRow
            label="English (US)"
            selected={form.language === "en"}
            onTap={() => setForm((p) => ({ ...p, language: "en" }))}
          />
          <RadioRow
            label="العربية (Arabic)"
            selected={form.language === "ar"}
            onTap={() => setForm((p) => ({ ...p, language: "ar" }))}
          />
        </div>
      </SettingGroup>

      {/* 2. Giao diện */}
      <SettingGroup title="Giao diện hiển thị">
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "2px 0" }}>
          <RadioRow
            label="Tự động theo hệ điều hành"
            selected={form.theme === "system"}
            onTap={() => setForm((p) => ({ ...p, theme: "system" }))}
          />
          <RadioRow
            label="Giao diện Sáng (Light Mode)"
            selected={form.theme === "light"}
            onTap={() => setForm((p) => ({ ...p, theme: "light" }))}
          />
          <RadioRow
            label="Giao diện Tối (Dark Mode)"
            selected={form.theme === "dark"}
            onTap={() => setForm((p) => ({ ...p, theme: "dark" }))}
          />
        </div>
      </SettingGroup>

      {/* 3. Thông tin web */}
      <SettingGroup title="Thông tin máy chủ & Nhãn hiệu">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "6px 0" }}>
          <TextField
            label="Tiêu đề trang (Site Title)"
            hint="LocalDrive - Đám mây lưu trữ riêng tư"
            value={form.siteTitle}
            onChange={(val) => setForm((p) => ({ ...p, siteTitle: val }))}
          />
          <TextField
            label="Mô tả tóm tắt (Meta Description)"
            hint="Nền tảng lưu trữ đám mây cá nhân tốc độ cao"
            value={form.siteDescription}
            onChange={(val) => setForm((p) => ({ ...p, siteDescription: val }))}
          />
          <TextField
            label="Từ khóa tìm kiếm (Meta Keywords)"
            hint="localdrive, nas, private cloud, luu tru"
            value={form.siteKeywords}
            onChange={(val) => setForm((p) => ({ ...p, siteKeywords: val }))}
          />
          <SettingRow
            glyph="image"
            label="Biểu tượng Favicon"
            description="Hiển thị trên tab trình duyệt và bookmark"
            trailing={
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "var(--r-chip)",
                    background: "var(--bg-sunken)",
                    border: "1px solid var(--stroke)",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                  }}
                >
                  {form.faviconUrl ? (
                    <img
                      src={form.faviconUrl}
                      alt="Favicon"
                      style={{ width: 22, height: 22, objectFit: "contain" }}
                    />
                  ) : (
                    <Icon glyph="folder" size={16} color="var(--accent)" />
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/x-icon,image/png,image/svg+xml,image/jpeg"
                  style={{ display: "none" }}
                  onChange={handleFaviconUpload}
                />

                <Button
                  label="Tải lên"
                  glyph="upload"
                  expand={false}
                  compact
                  onClick={() => fileInputRef.current?.click()}
                />

                {form.faviconUrl && (
                  <Button
                    label="Xóa"
                    variant="quiet"
                    expand={false}
                    compact
                    onClick={() => setForm((p) => ({ ...p, faviconUrl: "" }))}
                  />
                )}
              </div>
            }
          />
        </div>
      </SettingGroup>

      {/* Nút lưu */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <Button
          label="Lưu thay đổi"
          glyph="check"
          variant="primary"
          busy={isSaving}
          expand={false}
          onClick={handleSave}
        />
      </div>
    </div>
  );
}
