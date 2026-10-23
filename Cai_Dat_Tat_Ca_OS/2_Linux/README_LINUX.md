# HƯỚNG DẪN CÀI ĐẶT LOCAL DRIVE TRÊN LINUX & CÁC NỀN TẢNG

---

## 1. CÀI ĐẶT TRÊN LINUX BẰNG 1 LỆNH DUY NHẤT

Nếu bạn đang kết nối SSH vào máy chủ Linux (Ubuntu, Debian, CentOS, Rocky Linux, AlmaLinux, Alpine, Raspberry Pi OS...):

### Cách 1: Cài đặt 1 lệnh từ GitHub (Khuyên dùng - giống aaPanel/Docker)
```bash
curl -fsSL https://raw.githubusercontent.com/kiyogo/kidrive/main/install.sh -o install.sh && sudo bash install.sh
```
*Hoặc chạy trực tiếp qua pipe:*
```bash
curl -fsSL https://raw.githubusercontent.com/kiyogo/kidrive/main/install.sh | sudo bash
```

### Cách 2: Chạy trực tiếp từ thư mục tệp sau khi tải về
```bash
sudo bash install.sh
```

### Cách 3: Chạy từ xa trong mạng nội bộ (LAN) qua Web UI LocalDrive
```bash
curl -fsSL http://<IP_MÁY_CHỦ>:5437/install.sh | sudo bash
```

### Trình cài đặt `install.sh` sẽ thực hiện:
1. Nhận diện kiến trúc CPU: **x64** (Intel/AMD) hoặc **arm64** (Raspberry Pi, VPS ARM).
2. Thiết lập tệp thực thi vào `/usr/local/bin/localdrive` và phân quyền.
3. Tạo thư mục dữ liệu chuẩn `/var/lib/localdrive/data`.
4. Đăng ký dịch vụ nền **Systemd (`localdrive.service`)** chạy liên tục cùng hệ điều hành.
5. Cấu hình mở cổng **5437 (Web UI), 9683 (Server API), 80, 443** trên tường lửa (UFW / Firewalld).
6. In ra đường dẫn truy cập Web (`http://<IP>:5437` hoặc `http://kinas:5437`) và API (`http://<IP>:9683`).

---

## 2. QUẢN LÝ DỊCH VỤ TRÊN LINUX (SYSTEMD)

Sau khi cài đặt xong, bạn có thể điều khiển LocalDrive dễ dàng bằng các lệnh:

- **Kiểm tra trạng thái đang chạy**:
  ```bash
  systemctl status localdrive
  ```
- **Khởi động lại máy chủ**:
  ```bash
  sudo systemctl restart localdrive
  ```
- **Tạm dừng máy chủ**:
  ```bash
  sudo systemctl stop localdrive
  ```
- **Xem nhật ký hoạt động thời gian thực (Live logs)**:
  ```bash
  journalctl -u localdrive -f
  ```

---

## 3. FILE ỨNG DỤNG ANDROID (APK)

- Tệp cài đặt Android: **`LocalDrive-android.apk`**
- Sau khi tải về điện thoại hoặc máy tính bảng Android, chỉ cần cài đặt và nhập địa chỉ máy chủ (vd: `http://192.168.1.100:9683` hoặc `kinas//`) để kết nối.

---

## 4. TỔNG HỢP CÁC TỆP ĐÓNG GÓI CHUẨN

| Tệp tin | Nền tảng | Chức năng |
| :--- | :--- | :--- |
| `install.sh` | Linux | Script cài đặt 1 lệnh chuẩn hóa |
| `localdrive-linux-x64` | Linux x64 | Bản thực thi máy chủ cho VPS / PC Intel & AMD 64-bit |
| `localdrive-linux-arm64` | Linux ARM64 | Bản thực thi cho Raspberry Pi / VPS ARM |
| `localdrive-win-x64.exe` | Windows x64 | Bản thực thi máy chủ cho Windows 64-bit |
| `LocalDrive-win-x64-Setup.exe` | Windows x64 | Bộ cài đặt ứng dụng máy tính và KiyoDrive Explorer |
| `localdrive-macos-x64` | macOS x64 | Bản thực thi máy chủ cho máy Mac chip Intel |
| `localdrive-macos-arm64` | macOS ARM64 | Bản thực thi máy chủ cho máy Mac chip Apple Silicon |
| `LocalDrive-android.apk` | Android | Ứng dụng di động kết nối đám mây |
| `localdrive-linux.tar.gz` | Linux All | Gói nén cài đặt Linux offline |
| `SHA256SUMS.txt` | All | Bảng mã băm xác thực tính toàn vẹn của tệp |
