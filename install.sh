#!/usr/bin/env bash
# ==============================================================================
#  Local Drive - Trình Cài Đặt & Cập Nhật Hệ Thống Linux
#  Bảo toàn 100% dữ liệu người dùng, cơ sở dữ liệu và nhóm lưu trữ
# ==============================================================================

main() {
  # Không dùng set -e để tránh bị ngắt script giữa chừng khi chạy qua curl | bash
  export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"
  
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
    [ -f "$INSTALL_DIR/.env" ] && cp -f "$INSTALL_DIR/.env" "$BACKUP_DIR/.env" 2>/dev/null || true
    [ -f "$DATA_DIR/db/localdrive.sqlite" ] && cp -f "$DATA_DIR/db/localdrive.sqlite" "$BACKUP_DIR/localdrive.sqlite" 2>/dev/null || true
    [ -f "$INSTALL_DIR/localdrive.db" ] && cp -f "$INSTALL_DIR/localdrive.db" "$BACKUP_DIR/localdrive.db" 2>/dev/null || true
    echo -e "${GREEN}✓ Đã hoàn tất bản sao lưu dự phòng an toàn tại: ${BACKUP_DIR}${NC}"
  fi

  # 5. Tải file nhị phân mới nhất vào tệp tạm thời
  echo -e "${BLUE}[2/5] Đang tải bản phát hành mới nhất cho kiến trúc Linux ${ARCH}...${NC}"

  TMP_BIN="/tmp/localdrive-bin-new.$$.$RANDOM"
  rm -f "$TMP_BIN"

  DOWNLOADED=false
  URLS=(
    "https://github.com/kiyogo/kidrive/releases/latest/download/localdrive-linux-${ARCH}"
    "https://github.com/kiyogo/kidrive/releases/latest/download/localdrive-linux-${ARCH_LEGACY}"
    "https://github.com/kiyogo/kidrive/releases/download/v1.2.0/localdrive-linux-${ARCH}"
    "https://github.com/kiyogo/kidrive/releases/download/v1.2.0/localdrive-linux-${ARCH_LEGACY}"
    "https://github.com/kiyogo/kidrive/releases/download/v1.1.9/localdrive-linux-${ARCH}"
    "https://github.com/kiyogo/kidrive/releases/download/v1.1.9/localdrive-linux-${ARCH_LEGACY}"
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
      if [ "$FILE_SIZE" -gt 10000000 ]; then
        chmod +x "$TMP_BIN"
        DOWNLOADED=true
        echo -e "${GREEN}✓ Tải thành công từ: ${URL}${NC}"
        break
      fi
    fi
    rm -f "$TMP_BIN"
  done

  # Kiểm tra tệp cục bộ nếu tải qua mạng chưa thành công
  if [ "$DOWNLOADED" = false ]; then
    for CANDIDATE in "localdrive-linux-${ARCH}" "localdrive-linux-${ARCH_LEGACY}" "localdrive"; do
      if [ -f "$SCRIPT_DIR/$CANDIDATE" ]; then
        cp -f "$SCRIPT_DIR/$CANDIDATE" "$TMP_BIN" 2>/dev/null || true
        chmod +x "$TMP_BIN" 2>/dev/null || true
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
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet localdrive 2>/dev/null; then
    echo -e "${YELLOW}Đang dừng dịch vụ nền để cập nhật tệp thực thi mới...${NC}"
    systemctl stop localdrive 2>/dev/null || true
  fi

  # Giải phóng các tiến trình treo trên cổng 9683 và 5437
  if command -v fuser >/dev/null 2>&1; then
    fuser -k 9683/tcp 2>/dev/null || true
    fuser -k 5437/tcp 2>/dev/null || true
  fi
  pkill -9 -f "localdrive serve" 2>/dev/null || true

  # Sao lưu binary cũ
  if [ -f "$BIN_TARGET" ]; then
    cp -f "$BIN_TARGET" "${BIN_TARGET}.old" 2>/dev/null || true
  fi

  # Thay thế bằng lệnh install hoặc mv (nguyên tử)
  install -m 755 "$TMP_BIN" "$BIN_TARGET" 2>/dev/null || mv -f "$TMP_BIN" "$BIN_TARGET"
  chmod +x "$BIN_TARGET"
  rm -f "$TMP_BIN"

  echo -e "${GREEN}✓ Đã cập nhật tệp thực thi vào $BIN_TARGET thành công!${NC}"

  # Mở cổng tường lửa UFW và Firewalld NGAY LẬP TỨC (không điều kiện, tránh lỗi ngôn ngữ locale)
  if command -v ufw >/dev/null 2>&1; then
    ufw allow 5437/tcp comment "LocalDrive Web UI" >/dev/null 2>&1 || true
    ufw allow 9683/tcp comment "LocalDrive Server API" >/dev/null 2>&1 || true
    ufw allow 445/tcp comment "Samba SMB" >/dev/null 2>&1 || true
    ufw allow 139/tcp comment "Samba NetBIOS" >/dev/null 2>&1 || true
    ufw allow 137:138/udp comment "Samba Name/Datagram" >/dev/null 2>&1 || true
    ufw allow 80/tcp >/dev/null 2>&1 || true
    ufw allow 443/tcp >/dev/null 2>&1 || true
  fi
  if command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-service=samba >/dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=445/tcp >/dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=139/tcp >/dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=5437/tcp >/dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=9683/tcp >/dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=80/tcp >/dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=443/tcp >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
  fi

  # Hỗ trợ đọc và kết nối mảng lưu trữ TrueNAS / OpenZFS
  if ! command -v zpool >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      echo -e "${BLUE}Kiểm tra và cài đặt gói hỗ trợ ổ đĩa TrueNAS / ZFS (zfsutils-linux)...${NC}"
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -qq < /dev/null 2>/dev/null || true
      apt-get install -y -qq zfsutils-linux < /dev/null 2>/dev/null || true
    fi
  fi
  modprobe zfs 2>/dev/null || true
  if command -v zpool >/dev/null 2>&1; then
    echo -e "${BLUE}Kiểm tra và mở khóa toàn diện quyền ghi trên các mảng ZFS...${NC}"
    zpool import -f -a 2>/dev/null || true
    zpool import -f -R /mnt/zfs-recovery DATA 2>/dev/null || true
    if zpool get -H -o value readonly DATA 2>/dev/null | grep -q 'on'; then
      echo -e "${YELLOW}Phát hiện mảng DATA bị khóa readonly ở cấp Pool, đang thử chuyển sang read-write...${NC}"
      zpool set readonly=off DATA 2>/dev/null || true
      zfs set -r readonly=off DATA 2>/dev/null || true
      if zpool get -H -o value readonly DATA 2>/dev/null | grep -q 'on'; then
        systemctl stop smbd nmbd localdrive 2>/dev/null || true
        for bm in $(awk '{print $2}' /proc/mounts 2>/dev/null | grep -E '^/DATA|^/mnt/DATA|^/mnt/zfs-recovery' | awk '{ print length, $0 }' | sort -rn | cut -d" " -f2-); do
          umount -l "$bm" 2>/dev/null || true
        done
        zfs unmount -f -a 2>/dev/null || true
        if zpool export -f DATA 2>/dev/null; then
          echo -e "${GREEN}✓ Đã export mảng DATA thành công, đang re-import read-write...${NC}"
          zpool import -f -o readonly=off -R /mnt/zfs-recovery DATA 2>/dev/null || \
            zpool import -f -d /dev -o readonly=off -R /mnt/zfs-recovery DATA 2>/dev/null || \
            zpool import -f -o readonly=on -R /mnt/zfs-recovery DATA 2>/dev/null || true
        else
          echo -e "${YELLOW}Mảng DATA đang bận, sẽ dùng OverlayFS để đảm bảo quyền ghi trực tiếp.${NC}"
        fi
      fi
    fi
    for p in $(zpool list -H -o name 2>/dev/null); do
      zpool set readonly=off "$p" 2>/dev/null || true
      zfs set -r readonly=off "$p" 2>/dev/null || true
    done
  fi
  if command -v zfs >/dev/null 2>&1; then
    for ds in $(zfs list -H -o name 2>/dev/null); do
      zfs set readonly=off "$ds" 2>/dev/null || true
    done
    zfs set -r readonly=off DATA 2>/dev/null || true
    zfs mount -a 2>/dev/null || true
  fi
  mount -o remount,rw /mnt/zfs-recovery 2>/dev/null || true
  mount -o remount,rw /mnt/zfs-recovery/DATA 2>/dev/null || true
  for m in $(cat /proc/mounts 2>/dev/null | grep -E "zfs|zfs-recovery|DATA|KiyoVN" | awk '{print $2}'); do
    mount -o remount,rw "$m" 2>/dev/null || true
    chmod 777 "$m" 2>/dev/null || true
  done

  # Dự phòng OverlayFS nếu tập dữ liệu ZFS vẫn ở chế độ chỉ đọc do khóa phần cứng/recovery
  modprobe overlay 2>/dev/null || true
  for root_cand in "/mnt/zfs-recovery/DATA/KiyoVN" "/DATA/KiyoVN" "/mnt/zfs-recovery/DATA" "/DATA"; do
    if [ -d "$root_cand" ]; then
      for d in "$root_cand"/*; do
        if [ -d "$d" ]; then
          if ! touch "$d/.ld_rw_test" 2>/dev/null; then
            echo -e "${YELLOW}Kích hoạt OverlayFS Read-Write cho $d...${NC}"
            SAFE_ID=$(echo "$d" | tr '/: ' '___')
            OV_BASE="/var/lib/localdrive/overlay/${SAFE_ID}"
            mkdir -p "${OV_BASE}/lower" "${OV_BASE}/upper" "${OV_BASE}/work" 2>/dev/null || true
            rm -rf "${OV_BASE}/work" 2>/dev/null || true
            mkdir -p "${OV_BASE}/work" 2>/dev/null || true
            if [ -z "$(ls -A "${OV_BASE}/lower" 2>/dev/null)" ]; then
              mount --bind "$d" "${OV_BASE}/lower" 2>/dev/null || true
            fi
            mount -t overlay overlay -o "lowerdir=${OV_BASE}/lower,upperdir=${OV_BASE}/upper,workdir=${OV_BASE}/work" "$d" 2>/dev/null || true
            chmod 777 "$d" 2>/dev/null || true
            if touch "$d/.ld_rw_test" 2>/dev/null; then
              rm -f "$d/.ld_rw_test" 2>/dev/null || true
              echo -e "${GREEN}✓ Đã mở khóa ghi (Read-Write) thành công cho $d!${NC}"
            else
              echo -e "${RED}[CẢNH BÁO] Không thể mount overlay cho $d${NC}"
            fi
          else
            rm -f "$d/.ld_rw_test" 2>/dev/null || true
          fi
        fi
      done
    fi
  done

  # Cài đặt và cấu hình dịch vụ chia sẻ mạng nội bộ Samba (SMB) với quyền Guest
  if ! command -v smbd >/dev/null 2>&1; then
    echo -e "${BLUE}Cài đặt dịch vụ chia sẻ mạng nội bộ Samba (SMB)...${NC}"
    if command -v apt-get >/dev/null 2>&1; then
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -qq < /dev/null 2>/dev/null || true
      apt-get install -y -qq samba smbclient acl attr < /dev/null 2>/dev/null || true
    elif command -v yum >/dev/null 2>&1; then
      yum install -y -q samba samba-client < /dev/null 2>/dev/null || true
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y -q samba samba-client < /dev/null 2>/dev/null || true
    fi
  fi

  # Xác định thư mục chia sẻ mạng nội bộ thực tế
  TARGET_SHARE_DIR="/DATA/KiyoVN"
  mkdir -p "$TARGET_SHARE_DIR" "/DATA" 2>/dev/null || true
  chmod 0755 "$TARGET_SHARE_DIR" "/DATA" 2>/dev/null || true
  chown root:root "$TARGET_SHARE_DIR" "/DATA" 2>/dev/null || true
  mkdir -p /var/lib/samba/usershares 2>/dev/null || true
  chmod 1777 /var/lib/samba/usershares 2>/dev/null || true

  # Nếu OpenZFS pool DATA được import tại /mnt/zfs-recovery
  if [ -d "/mnt/zfs-recovery/DATA/KiyoVN" ]; then
    mount --rbind /mnt/zfs-recovery/DATA/KiyoVN /DATA/KiyoVN 2>/dev/null || true
  fi

  # Tự động liên kết các tập dữ liệu thực (1DATA, DaoKy_5, Long_4, NgLoc_6, NgSon_1) vào KiyoVN bằng bind mount
  DATASET_NAMES=("1DATA" "DaoKy_5" "Long_4" "NgLoc_6" "NgSon_1")

  for ds in "${DATASET_NAMES[@]}"; do
    SRC=""
    # 1. Ưu tiên các đường dẫn chứa tệp thực tế
    for cand in \
      "/mnt/zfs-recovery/DATA/KiyoVN/$ds" \
      "/mnt/zfs-recovery/DATA/$ds" \
      "/mnt/DATA/KiyoVN/$ds" \
      "/mnt/DATA/$ds" \
      "/mnt/DỮ LIỆU/KiyoVN/$ds" \
      "/mnt/DỮ LIỆU/$ds" \
      "/mnt/$ds" \
      "/DATA/KiyoVN/$ds" \
      "/DATA/$ds"; do
      if [ -d "$cand" ] && [ ! -L "$cand" ] && [ "$(ls -A "$cand" 2>/dev/null)" ]; then
        SRC="$cand"
        break
      fi
    done

    # 2. Nếu chưa thấy đường dẫn có file, tìm đường dẫn tồn tại
    if [ -z "$SRC" ]; then
      for cand in \
        "/mnt/zfs-recovery/DATA/KiyoVN/$ds" \
        "/mnt/zfs-recovery/DATA/$ds" \
        "/mnt/DATA/KiyoVN/$ds" \
        "/mnt/DATA/$ds" \
        "/mnt/DỮ LIỆU/KiyoVN/$ds" \
        "/mnt/DỮ LIỆU/$ds" \
        "/mnt/$ds"; do
        if [ -d "$cand" ] && [ ! -L "$cand" ]; then
          SRC="$cand"
          break
        fi
      done
    fi

    # 3. Quét sâu bằng find nếu cần
    if [ -z "$SRC" ]; then
      SRC=$(find /mnt/zfs-recovery /DATA /mnt /srv /var /home -maxdepth 5 -type d -name "$ds" 2>/dev/null | grep -v "/DATA/KiyoVN/$ds" | grep -v "/DATA/$ds" | head -n 1)
    fi

    if [ -n "$SRC" ]; then
      echo -e "${GREEN}✓ Đã nhận diện tập dữ liệu $ds -> $SRC${NC}"
      mkdir -p "/DATA/KiyoVN/$ds" "/DATA/$ds" 2>/dev/null || true
      chmod -R 777 "/DATA/KiyoVN/$ds" "/DATA/$ds" 2>/dev/null || true

      # Bind mount trực tiếp vào /DATA/KiyoVN/$ds
      if [ "$SRC" != "/DATA/KiyoVN/$ds" ] && ! mount | grep -q "/DATA/KiyoVN/$ds "; then
        mount --bind "$SRC" "/DATA/KiyoVN/$ds" 2>/dev/null || true
      fi

      # Bind mount trực tiếp vào /DATA/$ds
      if [ "$SRC" != "/DATA/$ds" ] && ! mount | grep -q "/DATA/$ds "; then
        mount --bind "$SRC" "/DATA/$ds" 2>/dev/null || true
      fi

      for test_target in "/DATA/KiyoVN/$ds" "/DATA/$ds"; do
        if [ -d "$test_target" ]; then
          if ! touch "$test_target/.ld_rw_test" 2>/dev/null; then
            SAFE_ID=$(echo "$test_target" | tr '/: ' '___')
            OV_BASE="/var/lib/localdrive/overlay/${SAFE_ID}"
            mkdir -p "${OV_BASE}/lower" "${OV_BASE}/upper" "${OV_BASE}/work" 2>/dev/null || true
            rm -rf "${OV_BASE}/work" 2>/dev/null || true
            mkdir -p "${OV_BASE}/work" 2>/dev/null || true
            if [ -z "$(ls -A "${OV_BASE}/lower" 2>/dev/null)" ]; then
              mount --bind "$test_target" "${OV_BASE}/lower" 2>/dev/null || true
            fi
            mount -t overlay overlay -o "lowerdir=${OV_BASE}/lower,upperdir=${OV_BASE}/upper,workdir=${OV_BASE}/work" "$test_target" 2>/dev/null || true
            chmod 777 "$test_target" 2>/dev/null || true
            rm -f "$test_target/.ld_rw_test" 2>/dev/null || true
          else
            rm -f "$test_target/.ld_rw_test" 2>/dev/null || true
          fi
        fi
      done

      if [ -f /etc/fstab ]; then
        if ! grep -q "/DATA/KiyoVN/$ds" /etc/fstab 2>/dev/null; then
          echo "$SRC /DATA/KiyoVN/$ds none bind 0 0" >> /etc/fstab 2>/dev/null || true
        fi
        if ! grep -q "/DATA/$ds" /etc/fstab 2>/dev/null; then
          echo "$SRC /DATA/$ds none bind 0 0" >> /etc/fstab 2>/dev/null || true
        fi
      fi
    else
      echo -e "${YELLOW}  [LƯU Ý] Chưa thấy tập dữ liệu: $ds${NC}"
    fi
  done

  # Cấu hình Samba với phân quyền chặt chẽ theo POSIX ACL và tài khoản người dùng
  mkdir -p /etc/samba
  if [ -f /etc/samba/smb.conf ]; then
    # Gỡ bỏ các cờ nguy hiểm guest account = root và force user = root
    sed -i '/guest account = root/d' /etc/samba/smb.conf 2>/dev/null || true
    sed -i '/force user = root/d' /etc/samba/smb.conf 2>/dev/null || true
    sed -i '/guest only = yes/d' /etc/samba/smb.conf 2>/dev/null || true

    # Xóa section KiyoVN & DATA cũ một cách an toàn bằng awk
    awk '
      BEGIN { skip = 0 }
      /^\[(KiyoVN|DATA)\]/ { skip = 1; next }
      /^\[/ { skip = 0 }
      skip == 0 { print }
    ' /etc/samba/smb.conf > /etc/samba/smb.conf.tmp 2>/dev/null && mv /etc/samba/smb.conf.tmp /etc/samba/smb.conf 2>/dev/null || true

    # Đảm bảo [global] hỗ trợ VFS POSIX ACL
    if ! grep -q "vfs objects = acl_xattr" /etc/samba/smb.conf 2>/dev/null; then
      sed -i '/\[global\]/a \   vfs objects = acl_xattr\n   map acl inherit = yes\n   store dos attributes = yes\n   inherit acls = yes\n   inherit permissions = yes\n   guest account = nobody\n   follow symlinks = yes\n   wide links = yes\n   unix extensions = no\n   allow insecure wide links = yes' /etc/samba/smb.conf 2>/dev/null || true
    fi

    cat << EOF >> /etc/samba/smb.conf

[KiyoVN]
   comment = LocalDrive KiyoVN Share
   path = $TARGET_SHARE_DIR
   browseable = yes
   writable = yes
   guest ok = no
   read only = no
   inherit acls = yes
   inherit permissions = yes
   create mask = 0660
   directory mask = 0770
   follow symlinks = yes
   wide links = yes
EOF
  else
    cat << EOF > /etc/samba/smb.conf
[global]
   workgroup = WORKGROUP
   server string = LocalDrive NAS
   security = user
   map to guest = Bad User
   guest account = nobody
   vfs objects = acl_xattr
   map acl inherit = yes
   store dos attributes = yes
   inherit acls = yes
   inherit permissions = yes
   usershare path = /var/lib/samba/usershares
   usershare max shares = 100
   usershare allow guests = yes
   usershare owner only = false
   follow symlinks = yes
   wide links = yes
   unix extensions = no
   allow insecure wide links = yes

[KiyoVN]
   comment = LocalDrive KiyoVN Share
   path = $TARGET_SHARE_DIR
   browseable = yes
   writable = yes
   guest ok = no
   read only = no
   inherit acls = yes
   inherit permissions = yes
   create mask = 0660
   directory mask = 0770
   follow symlinks = yes
   wide links = yes
EOF
  fi

  # Kích hoạt và khởi động lại dịch vụ Samba
  systemctl enable smbd 2>/dev/null || systemctl enable smb 2>/dev/null || true
  systemctl restart smbd smb nmbd 2>/dev/null || systemctl restart smbd 2>/dev/null || systemctl restart smb 2>/dev/null || service smbd restart 2>/dev/null || true

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

  if command -v systemctl >/dev/null 2>&1; then
    cat << EOF > /etc/systemd/system/localdrive.service
[Unit]
Description=Local Drive - Private Cloud Storage Server
Documentation=https://github.com/kiyogo/kidrive
After=network.target network-online.target
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
RestartSec=3s
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

    # Tự động gỡ bỏ cờ read-only trên ZFS và Linux mount
    if command -v zpool >/dev/null 2>&1; then
      for p in $(zpool list -H -o name 2>/dev/null); do
        zpool set readonly=off "$p" 2>/dev/null || true
        zfs set -r readonly=off "$p" 2>/dev/null || true
      done
    fi
    if command -v zfs >/dev/null 2>&1; then
      for ds in $(zfs list -H -o name 2>/dev/null); do
        zfs set readonly=off "$ds" 2>/dev/null || true
      done
      zfs set -r readonly=off DATA 2>/dev/null || true
      zfs mount -a 2>/dev/null || true
    fi
    mount -o remount,rw /mnt/zfs-recovery 2>/dev/null || true
    mount -o remount,rw /mnt/zfs-recovery/DATA 2>/dev/null || true
    for m in $(cat /proc/mounts 2>/dev/null | grep -E "zfs|zfs-recovery|DATA|KiyoVN" | awk '{print $2}'); do
      mount -o remount,rw "$m" 2>/dev/null || true
    done

    systemctl daemon-reload 2>/dev/null || true
    systemctl reset-failed localdrive 2>/dev/null || true
    systemctl enable localdrive 2>/dev/null || true
    systemctl restart localdrive 2>/dev/null || true
    sleep 2
    # Đồng bộ phân quyền POSIX ACL cho toàn bộ tập dữ liệu và chia sẻ Samba
    ${BIN_TARGET} sync-shares --dir ${INSTALL_DIR} 2>/dev/null || true
    sleep 1
  fi

  # Kiểm tra tự động xem cổng 5437 đã hoạt động chưa
  IS_RUNNING=false
  for i in 1 2 3 4 5; do
    if command -v ss >/dev/null 2>&1 && ss -tulpn 2>/dev/null | grep -q ':5437'; then
      IS_RUNNING=true
      break
    elif command -v netstat >/dev/null 2>&1 && netstat -tulpn 2>/dev/null | grep -q ':5437'; then
      IS_RUNNING=true
      break
    elif command -v curl >/dev/null 2>&1 && curl -sI http://127.0.0.1:5437 >/dev/null 2>&1; then
      IS_RUNNING=true
      break
    fi
    sleep 1
  done

  # Nếu systemd chưa khởi chạy được, chạy tiến trình nền daemon trực tiếp dự phòng
  if [ "$IS_RUNNING" = false ]; then
    echo -e "${YELLOW}Dịch vụ qua systemd chưa phản hồi, kích hoạt khởi chạy daemon nền trực tiếp...${NC}"
    if command -v journalctl >/dev/null 2>&1; then
      journalctl -u localdrive -n 15 --no-pager 2>/dev/null || true
    fi
    nohup "$BIN_TARGET" serve --dir "$INSTALL_DIR" > "$INSTALL_DIR/localdrive.log" 2>&1 &
    sleep 3
  fi

  # Lấy địa chỉ IP mạng nội bộ của máy chủ
  SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  if [ -z "$SERVER_IP" ]; then
    SERVER_IP=$(ip route get 1 2>/dev/null | awk '{print $(NF-2);exit}')
  fi
  if [ -z "$SERVER_IP" ]; then
    SERVER_IP="127.0.0.1"
  fi

  CURRENT_VER=$("$BIN_TARGET" version 2>/dev/null || echo "1.1.8")

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
  echo -e "  ► Samba SMB:     ${CYAN}${BOLD}\\\\${SERVER_IP}\\KiyoVN${NC}"
  echo ""
  echo -e "  ${BOLD}Các lệnh quản lý dịch vụ (Systemd):${NC}"
  echo -e "  • Kiểm tra trạng thái:   ${YELLOW}systemctl status localdrive${NC}"
  echo -e "  • Khởi động lại:         ${YELLOW}systemctl restart localdrive${NC}"
  echo -e "  • Xem nhật ký realtime:  ${YELLOW}journalctl -u localdrive -f${NC}"
  echo -e "  • Đổi mật khẩu Admin:    ${YELLOW}localdrive reset-admin <mật_khẩu_mới>${NC}"
  echo ""
  echo -e "${GREEN}✓ Dịch vụ đang chạy và cổng 5437 đã sẵn sàng nhận kết nối!${NC}"
  echo "=================================================================="
}

main "$@"
