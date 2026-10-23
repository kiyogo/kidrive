<div align="center">

<img src="docs/assets/mark.svg" width="96" alt="KiDrive / LocalDrive Logo">

# KiDrive (LocalDrive)

**Your Own Private Cloud NAS On Your Own Hardware.**  
*Một giải pháp máy chủ đám mây cá nhân hoàn chỉnh, bảo mật và tốc độ cao trên phần cứng của riêng bạn.*

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.25-00ADD8.svg)](server/go.mod)
[![Flutter](https://img.shields.io/badge/Flutter-3.44-02569B.svg)](localdrive/pubspec.yaml)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](web-client/package.json)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS%20%7C%20Android%20%7C%20Docker-lightgrey.svg)](#hệ-điều-hành-hỗ-trợ)

[Cài Đặt Nhanh](#-cài-đặt-nhanh) ·
[Kiến Trúc Dự Án](#-kiến-trúc-dự-án) ·
[Tính Năng Nổi Bật](#-tính-năng-nổi-bật) ·
[Tài Liệu Cài Đặt OS](Cai_Dat_Tat_Ca_OS/HUONG_DAN_CAI_DAT_TAT_CA_OS.txt) ·
[Bản Quyền & Ghi Công](#-bản-quyền--ghi-công-attribution)

</div>

---

## ⚡ Cài Đặt Nhanh (Quick Start)

### 🐧 1. Linux Server (Cài đặt bằng 1 lệnh duy nhất - giống aaPanel & Docker)

Hỗ trợ tự động 100% cho **Ubuntu, Debian, CentOS, AlmaLinux, Rocky Linux, Alpine, Raspberry Pi OS...** (Tự nhận diện CPU **AMD64 / ARM64**, đăng ký **Systemd**, tự mở cổng tường lửa):

**Cách 1 (Khuyên dùng - phong cách aaPanel):**
```bash
curl -fsSL https://raw.githubusercontent.com/kiyogo/kidrive/main/install.sh -o install.sh && sudo bash install.sh
```

**Cách 2 (Piped execution - phong cách Docker / CasaOS):**
```bash
curl -fsSL https://raw.githubusercontent.com/kiyogo/kidrive/main/install.sh | sudo bash
```

Sau khi cài đặt xong, máy chủ sẽ tự khởi động và chạy ngầm vĩnh viễn:
* **Giao diện Web UI**: `http://<IP_MÁY_CHỦ>:5437` hoặc `http://kinas:5437`
* **Backend API**: `http://<IP_MÁY_CHỦ>:9683`

---

### 🪟 2. Windows

* **Dùng Bộ Cài Đặt (Inno Setup Installer)**:
  Tải tệp cài đặt `LocalDrive-Setup.exe` từ [Releases](https://github.com/kiyogo/kidrive/releases). Trình cài đặt tự động tích hợp máy chủ chạy ngầm, ứng dụng Desktop và ổ đĩa mạng **KiyoDrive** ngay trong **This PC (File Explorer)**.
* **Hoặc Chạy Từ Mã Nguồn (PowerShell)**:
  ```powershell
  cd server
  go run ./cmd/localdrive serve
  ```

---

### 🐳 3. Docker & Docker Compose

Khởi động hệ thống tức thì với Docker Compose:
```bash
cd Cai_Dat_Tat_Ca_OS/5_Docker
docker compose up -d
```

---

## 🌟 Tính Năng Nổi Bật (Key Features)

* 🛡️ **Dữ Liệu Thuộc Về Bạn 100%**: Lưu trữ hoàn toàn trên phần cứng của bạn, không gửi file qua bất kỳ máy chủ bên thứ ba nào, không giới hạn dung lượng và không tốn phí thuê bao hàng tháng.
* 🌐 **Giao Diện Web UI Tích Hợp (Cổng 5437)**: Thiết kế hiện đại xây dựng trên Next.js 15, hỗ trợ đầy đủ chế độ Sáng/Tối (Light/Dark mode), kéo thả tệp/thư mục, xem trước ảnh, video 60 FPS, chia sẻ liên kết an toàn.
* 💻 **Tích Hợp File Explorer (KiyoDrive)**: Hiển thị trực tiếp thư mục lưu trữ như một ổ đĩa mạng chuyên dụng trong `This PC` trên Windows, thao tác mượt mà như ổ cứng gắn trong máy.
* 📱 **Đa Nền Tảng Liền Mạch**: Ứng dụng khách viết bằng Flutter chạy mượt mà trên Windows, macOS, Linux, Android và iOS.
* 🔄 **Upload Tiếp Tục Khi Mất Mạng (Resumable Uploads)**: Cơ chế truyền tải dữ liệu theo khối (chunked transfer) cho phép tiếp tục tải lên ngay tại byte bị ngắt kết nối mà không phải tải lại từ đầu.
* 📸 **Bộ Sưu Tập Hình Ảnh & Video Thông Minh**: Xếp ảnh dạng Masonry theo dòng thời gian chụp thực tế, hỗ trợ zoom mượt, phóng to chi tiết không vỡ hạt.
* 👥 **Phân Quyền & Đa Tài Khoản**: Quản trị viên dễ dàng tạo lời mời cho các thành viên trong gia đình hoặc đồng nghiệp. Mỗi người dùng sở hữu không gian lưu trữ riêng biệt và bảo mật tuyệt đối.
* 🌍 **Hỗ Trợ Đa Ngôn Ngữ**: Bản địa hóa toàn diện tiếng Việt (Vietnamese), tiếng Anh (English) và tiếng Ả Rập (Arabic).

---

## 📁 Cấu Trúc Dự Án (Project Structure)

Kiến trúc mã nguồn được tổ chức sạch sẽ, phân tách rõ ràng giữa server, các client và tài liệu hướng dẫn:

```text
├── Cai_Dat_Tat_Ca_OS/          # Bộ tài liệu hướng dẫn cài đặt toàn diện cho từng OS
│   ├── 1_Windows/              # Hướng dẫn & cấu hình cho Windows
│   ├── 2_Linux/                # Script cài đặt install.sh & tài liệu Linux
│   ├── 3_macOS/                # Hướng dẫn triển khai trên Apple macOS
│   ├── 4_Android/              # Hướng dẫn ứng dụng di động Android
│   ├── 5_Docker/               # File cấu hình docker-compose.yml
│   └── HUONG_DAN_CAI_DAT_TAT_CA_OS.txt
├── server/                     # Backend Go (High-performance Server & Embedded Web UI)
│   ├── cmd/localdrive/         # Điểm khởi chạy chính của CLI & Server daemon
│   ├── internal/               # Core engine: auth, files, httpapi, db, webui, storage
│   └── migrations/             # Cơ sở dữ liệu SQLite schema migrations
├── localdrive/                 # Ứng dụng đa nền tảng Flutter (Desktop / Mobile)
│   ├── lib/features/           # Files, Gallery, Storage, Settings, Onboarding
│   └── windows/                # Native Windows runner & shell integrations
├── web-client/                 # Giao diện Web Next.js 15 hiện đại (TypeScript + Tailwind)
│   ├── src/components/         # Browser, DetailsPane, Settings, Gallery, Auth
│   └── public/                 # Static assets & bundled install.sh
├── docs/                       # Tài liệu kiến trúc, hướng dẫn kỹ thuật chi tiết
├── install.sh                  # 1-Line automated Linux installer script
├── LICENSE                     # Giấy phép mã nguồn mở MIT
└── README.md                   # Tài liệu tổng quan dự án
```

---

## 🔧 Quản Lý Dịch Vụ Server (Linux Systemd)

Khi cài đặt trên Linux bằng `install.sh`, dịch vụ được quản lý qua Systemd:

```bash
# Kiểm tra trạng thái máy chủ
systemctl status localdrive

# Khởi động lại máy chủ
sudo systemctl restart localdrive

# Tạm dừng máy chủ
sudo systemctl stop localdrive

# Bật lại máy chủ
sudo systemctl start localdrive

# Xem nhật ký hoạt động thời gian thực (realtime logs)
sudo journalctl -u localdrive -f
```

---

## 🔗 Liên Kết & Kho Mã Nguồn (Repositories)

* 🌟 **Repository Chính (Primary)**: [https://github.com/kiyogo/kidrive](https://github.com/kiyogo/kidrive)
* 🔄 **Repository Phụ (Backup / Mirror)**: [https://github.com/ngdaison/LocalDrive](https://github.com/ngdaison/LocalDrive)
* 🏛️ **Dự án Gốc (Upstream Origin)**: [https://github.com/MultiX0/LocalDrive](https://github.com/MultiX0/LocalDrive)

---

## ⚖️ Bản Quyền & Ghi Công (Attribution & License)

Dự án này được phát triển và nâng cấp dựa trên mã nguồn mở ban đầu từ [**MultiX0/LocalDrive**](https://github.com/MultiX0/LocalDrive). 

Chúng tôi xin chân thành cảm ơn tác giả **MultiX0** cùng toàn thể các lập trình viên đóng góp cho dự án gốc đã tạo nên nền tảng tuyệt vời này.

Toàn bộ dự án được phân phối dưới giấy phép **[MIT License](LICENSE)**:
* Copyright (c) 2026 **MultiX0** ([https://github.com/MultiX0/LocalDrive](https://github.com/MultiX0/LocalDrive))
* Copyright (c) 2026 **KiyoGo / KiDrive** ([https://github.com/kiyogo/kidrive](https://github.com/kiyogo/kidrive))

Bạn hoàn toàn tự do sử dụng, chỉnh sửa, phân phối và triển khai cho mục đích cá nhân cũng như thương mại theo các điều khoản của giấy phép MIT.
