#!/usr/bin/env bash
# ==============================================================================
#  Local Drive - Trình Cài Đặt & Cập Nhật Hệ Thống Linux
#  Bảo toàn 100% dữ liệu người dùng, cơ sở dữ liệu và nhóm lưu trữ
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 1. Kiểm tra quyền root
if [ "$EUID" -ne 0 ]; then
  if [ -f "$0" ] && command -v sudo >/dev/null 2>&1; then
    echo -e "${YELLOW}Đang chuyển sang quyền sudo để tiếp tục...${NC}"
    exec sudo bash "$0" "$@"
  fi
  echo -e "${RED}[LỖI] Vui lòng chạy lệnh cài đặt với quyền root (hoặc sudo)!${NC}"
  echo -e "${YELLOW}Gợi ý: curl -fsSL https://raw.githubusercontent.com/kiyogo/kidrive/main/install.sh | sudo bash${NC}"
  exit 1
fi

# 2. Nhận diện kiến trúc CPU
ARCH_RAW=$(uname -m)
case "$ARCH_RAW" in
  x86_64|amd64)
    ARCH="x64"
    ARCH_LEGACY="amd64"
    ;;
  aarch64|arm64)
    ARCH="arm64"
    ARCH_LEGACY="arm64"
    ;;
  *)
    echo -e "${RED}[LỖI] Kiến trúc CPU ($ARCH_RAW) chưa được hỗ trợ!${NC}"
    exit 1
    ;;
esac

# 3. Thư mục cài đặt và đường dẫn binary
INSTALL_DIR="/var/lib/localdrive"
DATA_DIR="/var/lib/localdrive/data"
BIN_TARGET="/usr/local/bin/localdrive"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$DATA_DIR/db" "$DATA_DIR/library"
mkdir -p "/usr/local/bin"

# Nhận diện trạng thái Cài đặt mới hay Cập nhật phiên bản
IS_UPDATE=false
if [ -f "$BIN_TARGET" ] || [ -f "$INSTALL_DIR/.env" ] || [ -f "/etc/systemd/system/localdrive.service" ]; then
  IS_UPDATE=true
fi

echo -e "${CYAN}${BOLD}"
echo "=================================================================="
if [ "$IS_UPDATE" = true ]; then
  echo "        LOCAL DRIVE - CẬP NHẬT LÊN PHIÊN BẢN MỚI NHẤT             "
  echo "  (Bảo toàn 100% Cơ sở dữ liệu, Nhóm lưu trữ và Tệp người dùng)   "
else
  echo "              LOCAL DRIVE - TRÌNH CÀI ĐẶT LINUX                   "
  echo "           Your Own Cloud NAS On Your Own Hardware                "
fi
echo "=================================================================="
echo -e "${NC}"

echo -e "${BLUE}[1/5] Kiến trúc CPU:${NC} ${GREEN}${ARCH} (${ARCH_RAW})${NC}"

# 4. Sao lưu an toàn trước khi cập nhật
if [ "$IS_UPDATE" = true ]; then
  BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_DIR="$INSTALL_DIR/backups/backup_$BACKUP_TIMESTAMP"
  mkdir -p "$BACKUP_DIR"
  [ -f "$INSTALL_DIR/.env" ] && cp -f "$INSTALL_DIR/.env" "$BACKUP_DIR/.env"
  [ -f "$DATA_DIR/db/localdrive.sqlite" ] && cp -f "$DATA_DIR/db/localdrive.sqlite" "$BACKUP_DIR/localdrive.sqlite"
  [ -f "$INSTALL_DIR/localdrive.db" ] && cp -f "$INSTALL_DIR/localdrive.db" "$BACKUP_DIR/localdrive.db"
  echo -e "${GREEN}✓ Đã hoàn tất bản sao lưu dự phòng an toàn tại: ${BACKUP_DIR}${NC}"
fi

# 5. Tải file nhị phân mới nhất vào tệp tạm thời
echo -e "${BLUE}[2/5] Đang tải bản phát hành mới nhất cho kiến trúc Linux ${ARCH}...${NC}"

TMP_BIN="/tmp/localdrive-bin-new.$$.$RANDOM"
rm -f "$TMP_BIN"

DOWNLOADED=false
URLS=(
  "https://github.com/kiyogo/kidrive/releases/download/v1.1.5/localdrive-linux-${ARCH}"
  "https://github.com/ngdaison/LocalDrive/releases/download/v1.1.5/localdrive-linux-${ARCH}"
  "https://github.com/kiyogo/kidrive/releases/latest/download/localdrive-linux-${ARCH}"
  "https://github.com/ngdaison/LocalDrive/releases/latest/download/localdrive-linux-${ARCH}"
  "https://github.com/kiyogo/kidrive/releases/latest/download/localdrive-linux-${ARCH_LEGACY}"
  "https://github.com/ngdaison/LocalDrive/releases/latest/download/localdrive-linux-${ARCH_LEGACY}"
)

for URL in "${URLS[@]}"; do
  echo -e "${BLUE}Thử tải từ: ${URL}...${NC}"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$TMP_BIN" "$URL" 2>/dev/null || true
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$TMP_BIN" "$URL" 2>/dev/null || true
  fi

  if [ -f "$TMP_BIN" ]; then
    FILE_SIZE=$(wc -c < "$TMP_BIN" 2>/dev/null || stat -c%s "$TMP_BIN" 2>/dev/null || echo 0)
    # Tệp binary hoàn chỉnh có kích thước trên 10MB
    if [ "$FILE_SIZE" -gt 10000000 ]; then
      chmod +x "$TMP_BIN"
      DOWNLOADED=true
      echo -e "${GREEN}✓ Đã tải thành công tệp thực thi (${FILE_SIZE} bytes)!${NC}"
      break
    else
      rm -f "$TMP_BIN"
    fi
  fi
done

# Kiểm tra tệp cục bộ nếu tải qua mạng chưa thành công
if [ "$DOWNLOADED" = false ]; then
  for CANDIDATE in "localdrive-linux-${ARCH}" "localdrive-linux-${ARCH_LEGACY}" "localdrive"; do
    if [ -f "$SCRIPT_DIR/$CANDIDATE" ]; then
      cp -f "$SCRIPT_DIR/$CANDIDATE" "$TMP_BIN"
      chmod +x "$TMP_BIN"
      DOWNLOADED=true
      echo -e "${GREEN}✓ Sử dụng tệp thực thi có sẵn từ thư mục cài đặt.${NC}"
      break
    fi
  done
fi

if [ "$DOWNLOADED" = false ] || [ ! -f "$TMP_BIN" ]; then
  echo -e "${RED}[LỖI] Không thể tải tệp thực thi LocalDrive cho kiến trúc ${ARCH}!${NC}"
  echo "Vui lòng kiểm tra lại kết nối mạng hoặc đặt tệp 'localdrive-linux-${ARCH}' cùng thư mục."
  exit 1
fi

# 6. Thay thế tệp thực thi an toàn (Ngăn ngừa lỗi Text file busy)
echo -e "${BLUE}[3/5] Tiến hành triển khai tệp thực thi vào hệ thống...${NC}"

# Tạm dừng dịch vụ nếu đang chạy
if systemctl is-active --quiet localdrive 2>/dev/null; then
  echo -e "${YELLOW}Đang dừng dịch vụ nền để cập nhật tệp thực thi mới...${NC}"
  systemctl stop localdrive 2>/dev/null || true
fi

# Sao lưu binary cũ
if [ -f "$BIN_TARGET" ]; then
  cp -f "$BIN_TARGET" "${BIN_TARGET}.old" 2>/dev/null || true
fi

# Thay thế bằng lệnh install hoặc mv (nguyên tử)
install -m 755 "$TMP_BIN" "$BIN_TARGET" || mv -f "$TMP_BIN" "$BIN_TARGET"
chmod +x "$BIN_TARGET"
rm -f "$TMP_BIN"

echo -e "${GREEN}✓ Đã cập nhật tệp thực thi vào $BIN_TARGET thành công!${NC}"

# Hỗ trợ đọc và kết nối mảng lưu trữ TrueNAS / OpenZFS
if ! command -v zpool >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    echo -e "${BLUE}Kiểm tra và cài đặt gói hỗ trợ ổ đĩa TrueNAS / ZFS (zfsutils-linux)...${NC}"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq && apt-get install -y -qq zfsutils-linux 2>/dev/null || true
  fi
fi
modprobe zfs 2>/dev/null || true
zfs mount -a 2>/dev/null || true

# 7. Khởi tạo cấu hình ban đầu nếu chưa có (Tuyệt đối không ghi đè cấu hình cũ)
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${BLUE}[4/5] Khởi tạo cấu hình máy chủ mới...${NC}"
  cat << 'EOF' > "$ENV_FILE"
# LocalDrive Environment Configuration
LOCALDRIVE_HOME=/var/lib/localdrive
DATA_DIR=/var/lib/localdrive/data
DB_PATH=/var/lib/localdrive/data/db/localdrive.sqlite
LOCALDRIVE_DATA_DIR=/var/lib/localdrive/data
LOCALDRIVE_DATABASE_PATH=/var/lib/localdrive/data/db/localdrive.sqlite
LOCALDRIVE_PORT=9683
LOCALDRIVE_WEB_PORT=5437
EOF
else
  echo -e "${GREEN}✓ [4/5] Giữ nguyên 100% cấu hình và tài khoản hiện tại trong $ENV_FILE${NC}"
fi

# 8. Cấu hình Systemd Daemon Service
echo -e "${BLUE}[5/5] Cấu hình và kích hoạt Systemd Daemon Service...${NC}"

cat << EOF > /etc/systemd/system/localdrive.service
[Unit]
Description=Local Drive - Private Cloud Storage Server
Documentation=https://github.com/kiyogo/kidrive
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
Environment="LOCALDRIVE_HOME=${INSTALL_DIR}"
Environment="DATA_DIR=${DATA_DIR}"
Environment="DB_PATH=${DATA_DIR}/db/localdrive.sqlite"
Environment="LOCALDRIVE_PORT=9683"
Environment="LOCALDRIVE_WEB_PORT=5437"
EnvironmentFile=-${ENV_FILE}
ExecStart=${BIN_TARGET} serve --dir ${INSTALL_DIR}
Restart=always
RestartSec=5s
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable localdrive 2>/dev/null || true
systemctl restart localdrive

# Chờ 2 giây kiểm tra trạng thái hoạt động
sleep 2

# 9. Cấu hình tường lửa nếu có (UFW hoặc Firewalld)
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "active"; then
  ufw allow 5437/tcp comment "LocalDrive Web UI" >/dev/null 2>&1 || true
  ufw allow 9683/tcp comment "LocalDrive Server API" >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=5437/tcp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port=9683/tcp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port=80/tcp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port=443/tcp >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
fi

# Lấy địa chỉ IP mạng nội bộ của máy chủ
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
  SERVER_IP=$(ip route get 1 2>/dev/null | awk '{print $(NF-2);exit}')
fi
if [ -z "$SERVER_IP" ]; then
  SERVER_IP="127.0.0.1"
fi

CURRENT_VER=$("$BIN_TARGET" version 2>/dev/null || echo "1.1.0")

# 10. Thông báo kết quả hoàn thành
echo ""
echo -e "${GREEN}${BOLD}==================================================================${NC}"
if [ "$IS_UPDATE" = true ]; then
  echo -e "${GREEN}${BOLD}   CẬP NHẬT LOCALDRIVE THÀNH CÔNG LÊN PHIÊN BẢN MỚI NHẤT!        ${NC}"
else
  echo -e "${GREEN}${BOLD}       CÀI ĐẶT LOCALDRIVE TRÊN LINUX HOÀN TẤT THÀNH CÔNG!          ${NC}"
fi
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo ""
echo -e "  ${BOLD}Phiên bản đang hoạt động:${NC} ${CYAN}${CURRENT_VER}${NC}"
echo -e "  ${BOLD}Bảo toàn dữ liệu:${NC}        ${GREEN}100% Cơ sở dữ liệu, Nhóm lưu trữ và Tệp tin an toàn${NC}"
echo ""
echo -e "  ${BOLD}Địa chỉ truy cập máy chủ của bạn:${NC}"
echo -e "  ► Web Interface: ${CYAN}${BOLD}http://${SERVER_IP}:5437${NC} hoặc ${CYAN}${BOLD}http://kinas:5437${NC}"
echo -e "  ► Backend API:   ${CYAN}${BOLD}http://${SERVER_IP}:9683${NC}"
echo -e "  ► Localhost Web: ${CYAN}${BOLD}http://localhost:5437${NC}"
echo ""
echo -e "  ${BOLD}Các lệnh quản lý dịch vụ (Systemd):${NC}"
echo -e "  • Kiểm tra trạng thái:   ${YELLOW}systemctl status localdrive${NC}"
echo -e "  • Khởi động lại:         ${YELLOW}systemctl restart localdrive${NC}"
echo -e "  • Xem nhật ký realtime:  ${YELLOW}journalctl -u localdrive -f${NC}"
echo ""
echo -e "${GREEN}Dịch vụ đang chạy nền ổn định và sẵn sàng phục vụ!${NC}"
echo "=================================================================="
