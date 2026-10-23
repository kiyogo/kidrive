#!/usr/bin/env bash
# ==============================================================================
#  Local Drive - 1-Line Linux Installer
#  Hỗ trợ cài đặt toàn diện cho Ubuntu, Debian, CentOS, AlmaLinux, Rocky, Alpine...
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "=================================================================="
echo "              LOCAL DRIVE - TRÌNH CÀI ĐẶT LINUX                   "
echo "           Your Own Cloud NAS On Your Own Hardware                "
echo "=================================================================="
echo -e "${NC}"

# 1. Kiểm tra quyền root
if [ "$EUID" -ne 0 ]; then
  if [ -f "$0" ] && command -v sudo >/dev/null 2>&1; then
    echo -e "${YELLOW}Đang chuyển sang quyền sudo để tiếp tục cài đặt...${NC}"
    exec sudo bash "$0" "$@"
  fi
  echo -e "${RED}[LỖI] Vui lòng chạy lệnh cài đặt với quyền root (hoặc sudo)!${NC}"
  echo -e "${YELLOW}Gợi ý: sudo bash install.sh  hoặc  curl -fsSL <URL> | sudo bash${NC}"
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

echo -e "${BLUE}[1/5] Kiến trúc CPU phát hiện:${NC} ${GREEN}${ARCH} (${ARCH_RAW})${NC}"

# 3. Thư mục cài đặt và binary
INSTALL_DIR="/var/lib/localdrive"
DATA_DIR="/var/lib/localdrive/data"
BIN_TARGET="/usr/local/bin/localdrive"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

mkdir -p "$INSTALL_DIR" "$DATA_DIR"
mkdir -p "/usr/local/bin"

echo -e "${BLUE}[2/5] Đang nạp tệp thực thi LocalDrive...${NC}"

# Tìm binary có sẵn trong thư mục cục bộ trước
FOUND_LOCAL=false
for CANDIDATE in "localdrive-linux-${ARCH}" "localdrive-linux-${ARCH_LEGACY}" "localdrive"; do
  if [ -f "$SCRIPT_DIR/$CANDIDATE" ]; then
    cp -f "$SCRIPT_DIR/$CANDIDATE" "$BIN_TARGET"
    FOUND_LOCAL=true
    break
  elif [ -f "./$CANDIDATE" ]; then
    cp -f "./$CANDIDATE" "$BIN_TARGET"
    FOUND_LOCAL=true
    break
  fi
done

# Nếu không có file local, tải trực tiếp từ GitHub Releases
if [ "$FOUND_LOCAL" = false ]; then
  echo -e "${YELLOW}Đang tải file nhị phân cho kiến trúc Linux ${ARCH}...${NC}"
  URLS=(
    "https://github.com/kiyogo/kidrive/releases/latest/download/localdrive-linux-${ARCH}"
    "https://github.com/ngdaison/LocalDrive/releases/latest/download/localdrive-linux-${ARCH}"
    "https://github.com/kiyogo/kidrive/releases/latest/download/localdrive-linux-${ARCH_LEGACY}"
    "https://github.com/ngdaison/LocalDrive/releases/latest/download/localdrive-linux-${ARCH_LEGACY}"
  )
  for URL in "${URLS[@]}"; do
    echo -e "${BLUE}Thử tải từ: ${URL}...${NC}"
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL -o "$BIN_TARGET" "$URL" || true
    elif command -v wget >/dev/null 2>&1; then
      wget -qO "$BIN_TARGET" "$URL" || true
    fi
    if [ -f "$BIN_TARGET" ] && [ -s "$BIN_TARGET" ]; then
      echo -e "${GREEN}✓ Đã tải thành công binary!${NC}"
      break
    fi
  done
fi

if [ ! -f "$BIN_TARGET" ] || [ ! -s "$BIN_TARGET" ]; then
  echo -e "${RED}[LỖI] Không thể tìm thấy hoặc tải binary localdrive-linux-${ARCH}!${NC}"
  echo "Vui lòng đặt tệp 'localdrive-linux-${ARCH}' cùng thư mục với install.sh rồi chạy lại."
  exit 1
fi

chmod +x "$BIN_TARGET"
echo -e "${GREEN}✓ Đã cài đặt binary vào $BIN_TARGET thành công!${NC}"

# 4. Khởi tạo cấu hình ban đầu nếu chưa có
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${BLUE}[3/5] Khởi tạo cấu hình máy chủ...${NC}"
  cat << 'EOF' > "$ENV_FILE"
# LocalDrive Environment Configuration
LOCALDRIVE_PORT=9683
LOCALDRIVE_WEB_PORT=5437
LOCALDRIVE_DATA_DIR=/var/lib/localdrive/data
LOCALDRIVE_DATABASE_PATH=/var/lib/localdrive/localdrive.db
EOF
fi

# 5. Cài đặt Systemd Daemon Service
echo -e "${BLUE}[4/5] Đăng ký Systemd Daemon Service cùng hệ thống...${NC}"

cat << EOF > /etc/systemd/system/localdrive.service
[Unit]
Description=Local Drive - Private Cloud Storage Server
Documentation=https://github.com/MultiX0/LocalDrive
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=-${ENV_FILE}
ExecStart=${BIN_TARGET} serve
Restart=always
RestartSec=5s
LimitNOFILE=65536

# Bảo mật tầng dịch vụ
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=${INSTALL_DIR}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable localdrive
systemctl restart localdrive

# 6. Mở tường lửa nếu có (UFW hoặc Firewalld)
echo -e "${BLUE}[5/5] Cấu hình tường lửa cho cổng 5437 (Web UI) và 9683 (Server API)...${NC}"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "active"; then
  ufw allow 5437/tcp comment "LocalDrive Web UI" >/dev/null 2>&1 || true
  ufw allow 9683/tcp comment "LocalDrive Server API" >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  echo -e "${GREEN}✓ Đã mở cổng 5437, 9683, 80, 443 trên UFW Firewall${NC}"
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=5437/tcp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port=9683/tcp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port=80/tcp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port=443/tcp >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
  echo -e "${GREEN}✓ Đã mở cổng 5437, 9683, 80, 443 trên Firewalld${NC}"
fi

# Lấy địa chỉ IP mạng nội bộ của máy chủ
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
  SERVER_IP=$(ip route get 1 2>/dev/null | awk '{print $(NF-2);exit}')
fi
if [ -z "$SERVER_IP" ]; then
  SERVER_IP="127.0.0.1"
fi

# 7. Thông báo kết quả hoàn thành
echo ""
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo -e "${GREEN}${BOLD}       CÀI ĐẶT LOCALDRIVE TRÊN LINUX HOÀN TẤT THÀNH CÔNG!          ${NC}"
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo ""
echo -e "  ${BOLD}Địa chỉ truy cập máy chủ của bạn:${NC}"
echo -e "  ► Web Interface: ${CYAN}${BOLD}http://${SERVER_IP}:5437${NC} hoặc ${CYAN}${BOLD}http://kinas:5437${NC}"
echo -e "  ► Backend API:   ${CYAN}${BOLD}http://${SERVER_IP}:9683${NC}"
echo -e "  ► Localhost Web: ${CYAN}${BOLD}http://localhost:5437${NC}"
echo ""
echo -e "  ${BOLD}Các lệnh quản lý dịch vụ (Systemd):${NC}"
echo -e "  • Kiểm tra trạng thái:   ${YELLOW}systemctl status localdrive${NC}"
echo -e "  • Khởi động lại:         ${YELLOW}systemctl restart localdrive${NC}"
echo -e "  • Tạm dừng:              ${YELLOW}systemctl stop localdrive${NC}"
echo -e "  • Xem nhật ký realtime:  ${YELLOW}journalctl -u localdrive -f${NC}"
echo ""
echo -e "  ${BOLD}Dữ liệu và tệp lưu trữ:${NC}"
echo -e "  • Thư mục dữ liệu:       ${CYAN}/var/lib/localdrive/data${NC}"
echo -e "  • Cơ sở dữ liệu:         ${CYAN}/var/lib/localdrive/localdrive.db${NC}"
echo ""
echo -e "${GREEN}Dịch vụ đã được kích hoạt chạy nền liên tục cùng hệ điều hành!${NC}"
echo "=================================================================="
