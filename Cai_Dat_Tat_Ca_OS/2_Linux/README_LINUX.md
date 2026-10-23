# HƯỚNG DẪN CÀI ĐẶT LOCAL DRIVE TRÊN LINUX & CÁC NỀN TẢNG

---

## 1. CÀI ĐẶT TRÊN LINUX BẰNG 1 LỆNH DUY NHẤT (TỰ ĐỘNG 100%)

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

### Script `install.sh` sẽ tự động thực hiện mọi thứ:
1. Tự động nhận diện kiến trúc CPU: **AMD64/x86_64** hoặc **ARM64** (Raspberry Pi, VPS ARM).
2. Tự động cài đặt file nhị phân vào `/usr/local/bin/localdrive` và phân quyền thực thi.
3. Tự động tạo thư mục dữ liệu chuẩn `/var/lib/localdrive/data`.
4. Tự động đăng ký dịch vụ nền **Systemd (`localdrive.service`)** để server tự động bật khi khởi động lại máy và chạy ngầm vĩnh viễn.
5. Tự động cấu hình mở cổng **5437 (Web UI), 9683 (Server API), 80, 443** trên tường lửa (UFW / Firewalld).
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

- Tệp cài đặt Android: **`LocalDrive.apk`**
- **Đường dẫn cục bộ**: `e:\DATA\source\Nas\LocalDrive\LocalDrive.apk`
- **Tải trực tiếp qua trình duyệt**:
  ```
  http://<IP_MÁY_CHỦ>:5437/LocalDrive.apk
  ```
- Sau khi tải về điện thoại hoặc máy tính bảng Android, chỉ cần bấm cài đặt và nhập địa chỉ máy chủ (vd: `http://192.168.1.100:9683` hoặc `kinas//`) để đồng bộ tệp và thư mục.

---

## 4. TỔNG HỢP CÁC TỆP ĐÓNG GÓI SẴN

| Tệp tin | Nền tảng | Chức năng |
| :--- | :--- | :--- |
| `install.sh` | Linux | Script cài đặt 1 lệnh tự động 100% |
| `localdrive-linux-amd64` | Linux x86_64 | Bản thực thi máy chủ cho VPS / PC Intel & AMD |
| `localdrive-linux-arm64` | Linux ARM64 | Bản thực thi cho Raspberry Pi / VPS ARM |
| `localdrive.exe` | Windows 64-bit | Bản thực thi máy chủ cho Windows |
| `LocalDrive.apk` | Android | Ứng dụng di động kết nối đám mây |
| `web-client/` | Web Browser | Giao diện quản trị, tải thư mục, Bảng điều khiển, Bảo mật & SSL |
