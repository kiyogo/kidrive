"use client";

import { useEffect, useState } from "react";
import { Icon, type Glyph } from "@/components/Icon";
import {
  Button,
  SettingGroup,
  SettingRow,
  Sheet,
  Switch,
  Tappable,
  TextField,
  useToast,
} from "@/components/ui";
import { useL10n } from "@/lib/l10n";

interface ShareConfig {
  smbEnabled: boolean;
  smbWorkgroup: string;
  smbPort: number;
  smbGuest: boolean;
  smbReadOnly: boolean;
  webdavEnabled: boolean;
  webdavPort: number;
  webdavAuth: boolean;
  nfsEnabled: boolean;
  nfsSubnet: string;
}

const defaultConfig: ShareConfig = {
  smbEnabled: true,
  smbWorkgroup: "WORKGROUP",
  smbPort: 445,
  smbGuest: false,
  smbReadOnly: false,
  webdavEnabled: true,
  webdavPort: 8080,
  webdavAuth: true,
  nfsEnabled: false,
  nfsSubnet: "192.168.1.0/24",
};

export function NetworkSharesSection({
  onBack,
  embedded,
}: {
  onBack?: () => void;
  embedded?: boolean;
}) {
  const t = useL10n();
  const toast = useToast();
  const [config, setConfig] = useState<ShareConfig>(defaultConfig);
  const [host, setHost] = useState("192.168.1.15");
  const [tab, setTab] = useState<"windows" | "macos" | "tv">("windows");
  const [editingWorkgroup, setEditingWorkgroup] = useState(false);
  const [workgroupInput, setWorkgroupInput] = useState("");
  const [editingNfsSubnet, setEditingNfsSubnet] = useState(false);
  const [nfsSubnetInput, setNfsSubnetInput] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentHost = window.location.hostname;
      if (currentHost && currentHost !== "localhost" && currentHost !== "127.0.0.1") {
        setHost(currentHost);
      }
      try {
        const saved = localStorage.getItem("ld.shares.config");
        if (saved) {
          setConfig({ ...defaultConfig, ...JSON.parse(saved) });
        }
      } catch {}
    }
  }, []);

  const saveConfig = (next: ShareConfig) => {
    setConfig(next);
    try {
      localStorage.setItem("ld.shares.config", JSON.stringify(next));
    } catch {}
    toast("Đã lưu thiết lập chia sẻ mạng", "success");
  };

  const copyText = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      toast(`Đã sao chép: ${label}`, "success");
    }
  };

  const smbWindowsPath = `\\\\${host}\\localdrive`;
  const smbMacPath = `smb://${host}/localdrive`;
  const webdavUrl = `http://${host}:${config.webdavPort}/webdav`;
  const nfsPath = `${host}:/srv/localdrive/library`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 1. Trạng thái máy chủ LAN */}
      <div
        style={{
          padding: 16,
          background: "var(--bg-elevated)",
          border: "1px solid var(--stroke)",
          borderRadius: "var(--r-card)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon glyph="server" size={20} color="var(--accent)" />
            <div>
              <div className="t-title-sm" style={{ fontWeight: 600 }}>
                Máy chủ mạng nội bộ (LAN Server)
              </div>
              <div className="t-body-sm" style={{ color: "var(--fg-secondary)" }}>
                Địa chỉ IP: <code style={{ color: "var(--accent)", fontWeight: 600 }}>{host}</code>
              </div>
            </div>
          </div>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(76, 175, 109, 0.14)",
              color: "#4CAF6D",
              fontSize: 12,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4CAF6D" }} />
            Đang phát sóng LAN
          </span>
        </div>
      </div>

      {/* 2. Giao thức Samba / Windows File Sharing (SMB) */}
      <SettingGroup title="Samba / Windows File Sharing (SMB)">
        <SettingRow
          glyph="device"
          label="Dịch vụ chia sẻ Samba (SMB)"
          description="Cho phép kết nối và map ổ đĩa mạng trên Windows Explorer, macOS Finder và Smart TV."
          trailing={
            <Switch
              value={config.smbEnabled}
              onChange={(val) => saveConfig({ ...config, smbEnabled: val })}
            />
          }
        />
        {config.smbEnabled && (
          <>
            <SettingRow
              showDivider
              glyph="device"
              label="Đường dẫn Windows"
              description={smbWindowsPath}
              onTap={() => copyText(smbWindowsPath, "Đường dẫn Windows")}
              trailing={
                <Button
                  label="Sao chép"
                  glyph="link"
                  compact
                  variant="secondary"
                  onClick={() => copyText(smbWindowsPath, "Đường dẫn Windows")}
                />
              }
            />
            <SettingRow
              showDivider
              glyph="share"
              label="Đường dẫn macOS / iOS"
              description={smbMacPath}
              onTap={() => copyText(smbMacPath, "Đường dẫn macOS")}
              trailing={
                <Button
                  label="Sao chép"
                  glyph="link"
                  compact
                  variant="secondary"
                  onClick={() => copyText(smbMacPath, "Đường dẫn macOS")}
                />
              }
            />
            <SettingRow
              showDivider
              glyph="edit"
              label="Nhóm làm việc (Workgroup)"
              description={config.smbWorkgroup}
              onTap={() => {
                setWorkgroupInput(config.smbWorkgroup);
                setEditingWorkgroup(true);
              }}
            />
            <SettingRow
              showDivider
              glyph="lock"
              label="Truy cập Khách (Guest Access)"
              description="Cho phép mọi thiết bị trong mạng LAN truy cập mà không cần nhập mật khẩu."
              trailing={
                <Switch
                  value={config.smbGuest}
                  onChange={(val) => saveConfig({ ...config, smbGuest: val })}
                />
              }
            />
            <SettingRow
              showDivider
              glyph="eye"
              label="Chế độ chỉ đọc (Read-only)"
              description="Chỉ cho phép xem và tải tệp về, không cho phép xóa hoặc sửa đổi dữ liệu qua SMB."
              trailing={
                <Switch
                  value={config.smbReadOnly}
                  onChange={(val) => saveConfig({ ...config, smbReadOnly: val })}
                />
              }
            />
          </>
        )}
      </SettingGroup>

      {/* 3. Giao thức WebDAV */}
      <SettingGroup title="Máy chủ WebDAV (Ứng dụng đa phương tiện)">
        <SettingRow
          glyph="slides"
          label="Dịch vụ WebDAV"
          description="Truy cập tệp trực tiếp từ các ứng dụng xem phim Apple TV (Infuse), Kodi, rclone, GoodNotes."
          trailing={
            <Switch
              value={config.webdavEnabled}
              onChange={(val) => saveConfig({ ...config, webdavEnabled: val })}
            />
          }
        />
        {config.webdavEnabled && (
          <>
            <SettingRow
              showDivider
              glyph="link"
              label="URL WebDAV"
              description={webdavUrl}
              onTap={() => copyText(webdavUrl, "URL WebDAV")}
              trailing={
                <Button
                  label="Sao chép"
                  glyph="link"
                  compact
                  variant="secondary"
                  onClick={() => copyText(webdavUrl, "URL WebDAV")}
                />
              }
            />
            <SettingRow
              showDivider
              glyph="lock"
              label="Xác thực tài khoản"
              description="Yêu cầu đăng nhập bằng tên người dùng và mật khẩu tài khoản LocalDrive của bạn."
              trailing={
                <Switch
                  value={config.webdavAuth}
                  onChange={(val) => saveConfig({ ...config, webdavAuth: val })}
                />
              }
            />
          </>
        )}
      </SettingGroup>

      {/* 4. Giao thức NFS */}
      <SettingGroup title="Chia sẻ mạng NFS (Linux / Máy ảo)">
        <SettingRow
          glyph="server"
          label="Dịch vụ NFS (Network File System)"
          description="Giao thức chia sẻ mạng tốc độ cao chuyên dụng cho máy chủ Linux, Proxmox và VMware."
          trailing={
            <Switch
              value={config.nfsEnabled}
              onChange={(val) => saveConfig({ ...config, nfsEnabled: val })}
            />
          }
        />
        {config.nfsEnabled && (
          <>
            <SettingRow
              showDivider
              glyph="link"
              label="Điểm gắn kết (Mount Point)"
              description={nfsPath}
              onTap={() => copyText(nfsPath, "Điểm gắn kết NFS")}
              trailing={
                <Button
                  label="Sao chép"
                  glyph="link"
                  compact
                  variant="secondary"
                  onClick={() => copyText(nfsPath, "Điểm gắn kết NFS")}
                />
              }
            />
            <SettingRow
              showDivider
              glyph="edit"
              label="Dải mạng cho phép (Subnet)"
              description={config.nfsSubnet}
              onTap={() => {
                setNfsSubnetInput(config.nfsSubnet);
                setEditingNfsSubnet(true);
              }}
            />
          </>
        )}
      </SettingGroup>

      {/* 5. Hướng dẫn kết nối từng nền tảng */}
      <SettingGroup title="Hướng dẫn kết nối nhanh vào ổ NAS">
        <div style={{ display: "flex", gap: 8, padding: "8px 4px 14px" }}>
          {(["windows", "macos", "tv"] as const).map((tId) => {
            const isSel = tab === tId;
            const names = {
              windows: "Windows",
              macos: "macOS",
              tv: "TV / Mobile",
            };
            return (
              <Tappable
                key={tId}
                onClick={() => setTab(tId)}
                radius={8}
                style={{
                  padding: "6px 14px",
                  background: isSel ? "var(--accent)" : "var(--bg-sunken)",
                  color: isSel ? "#FFFFFF" : "var(--fg-secondary)",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {names[tId]}
              </Tappable>
            );
          })}
        </div>

        <div style={{ padding: "4px 6px 12px", color: "var(--fg-primary)", lineHeight: 1.6, fontSize: 13 }}>
          {tab === "windows" && (
            <ol style={{ margin: 0, paddingInlineStart: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li>
                Mở <strong>File Explorer</strong> (hoặc nhấn phím <code>Windows + E</code>).
              </li>
              <li>
                Chọn <strong>This PC</strong> trên thanh bên trái, nhấn vào menu <strong>... (More)</strong> hoặc chuột phải và chọn <strong>Map network drive</strong>.
              </li>
              <li>
                Tại ô <em>Folder</em>, nhập: <code style={{ color: "var(--accent)" }}>{smbWindowsPath}</code>
              </li>
              <li>
                Tích chọn <strong>Reconnect at sign-in</strong> và nhấn <strong>Finish</strong>. Nhập tài khoản LocalDrive của bạn để bắt đầu sử dụng ổ đĩa như ổ cứng cắm trong máy!
              </li>
            </ol>
          )}

          {tab === "macos" && (
            <ol style={{ margin: 0, paddingInlineStart: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li>
                Mở <strong>Finder</strong> trên Mac của bạn.
              </li>
              <li>
                Nhấn tổ hợp phím <code>Command + K</code> (hoặc menu <em>Go &gt; Connect to Server</em>).
              </li>
              <li>
                Nhập địa chỉ: <code style={{ color: "var(--accent)" }}>{smbMacPath}</code>
              </li>
              <li>
                Nhấn <strong>Connect</strong>, chọn <em>Registered User</em> và đăng nhập bằng tài khoản LocalDrive. Ổ đĩa sẽ xuất hiện ngay trên Desktop và Finder!
              </li>
            </ol>
          )}

          {tab === "tv" && (
            <ol style={{ margin: 0, paddingInlineStart: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li>
                <strong>Xem phim trên Apple TV / iPhone:</strong> Cài ứng dụng <em>Infuse</em>, chọn <em>Add Files &gt; Add WebDAV/SMB</em>, nhập địa chỉ <code style={{ color: "var(--accent)" }}>{webdavUrl}</code>.
              </li>
              <li>
                <strong>Xem phim trên Android TV / Google TV:</strong> Mở ứng dụng <em>Nova Video Player</em> hoặc <em>Kodi</em>, chọn <em>Network storage &gt; SMB</em>, ứng dụng sẽ tự động dò ra LocalDrive.
              </li>
              <li>
                <strong>Quản lý tệp trên điện thoại:</strong> Dùng app <em>Files</em> (iOS) hoặc <em>Solid Explorer</em> (Android) để kết nối vào ổ mạng SMB bất kỳ lúc nào.
              </li>
            </ol>
          )}
        </div>
      </SettingGroup>

      {/* Sheet sửa Workgroup */}
      <Sheet open={editingWorkgroup} onClose={() => setEditingWorkgroup(false)} title="Tên Workgroup">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TextField
            value={workgroupInput}
            onChange={setWorkgroupInput}
            label="Tên Workgroup"
            hint="Mặc định là WORKGROUP"
            glyph="device"
            autoFocus
          />
          <Button
            label="Lưu thay đổi"
            onClick={() => {
              const trimmed = workgroupInput.trim() || "WORKGROUP";
              saveConfig({ ...config, smbWorkgroup: trimmed });
              setEditingWorkgroup(false);
            }}
          />
        </div>
      </Sheet>

      {/* Sheet sửa Subnet NFS */}
      <Sheet open={editingNfsSubnet} onClose={() => setEditingNfsSubnet(false)} title="Dải mạng NFS cho phép">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TextField
            value={nfsSubnetInput}
            onChange={setNfsSubnetInput}
            label="Dải mạng Subnet"
            hint="Ví dụ: 192.168.1.0/24 hoặc *"
            glyph="server"
            autoFocus
          />
          <Button
            label="Lưu thay đổi"
            onClick={() => {
              const trimmed = nfsSubnetInput.trim() || "192.168.1.0/24";
              saveConfig({ ...config, nfsSubnet: trimmed });
              setEditingNfsSubnet(false);
            }}
          />
        </div>
      </Sheet>
    </div>
  );
}
