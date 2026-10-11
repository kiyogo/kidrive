# Tài liệu Khám phá Kiến trúc: Flutter Web Client → Next.js Web Client
**Dự án:** Local Drive (Self-hosted Alternative to Google Drive)  
**Ngày thực hiện:** 11/10/2026  
**Tác giả:** Principal Migration Specialist & UI/UX Architect  

---

## 1. TỔNG QUAN HỆ THỐNG

Local Drive là nền tảng lưu trữ đám mây riêng tư tự lưu trữ (self-hosted) gồm 2 thành phần chính:
- **Server:** Go binary duy nhất (`server/`), chạy với SQLite thuần Go (zero CGO runtime), phục vụ toàn bộ REST API và WebSocket realtime.
- **Client:**
  - **Flutter Web Client gốc (`localdrive/`):** SOURCE OF TRUTH (Bản chuẩn quy chiếu tuyệt đối).
  - **Next.js Web Client (`web-client/`):** Ứng dụng web hiện đại xây dựng bằng Next.js 16 (App Router), React 19, TypeScript, Semantic HTML và CSS variables.

---

## 2. KIẾN TRÚC FLUTTER WEB CLIENT (SOURCE OF TRUTH)

### 2.1. Quản lý trạng thái và DI
- Sử dụng **Flutter Riverpod** (`flutter_riverpod`):
  - `sessionProvider`: Quản lý phiên đăng nhập và các giai đoạn (`SessionStage`: `restoring`, `noNode`, `signedOut`, `pendingApproval`, `mustEnableTotp`, `mustChangePassword`, `ready`).
  - `filesProviders`: Quản lý danh sách thư mục `folderProvider(query)`, chọn lọc `selectionProvider`, sắp xếp và lọc.
  - `galleryProviders`: Quản lý ảnh nhóm theo ngày.
  - `videosProviders`: Quản lý danh sách video.
  - `offlineControllerProvider`: Quản lý tệp lưu trữ ngoại tuyến.
  - `transferControllerProvider`: Quản lý hàng đợi tải lên/tải xuống qua TUS protocol.

### 2.2. Điều hướng và Định tuyến (Routing)
- Sử dụng **GoRouter** (`app_router.dart`):
  - Khởi tạo tại `Routes.files` (`/files`).
  - Gated navigation: Tự động điều hướng người dùng dựa trên `SessionStage`.
  - Hỗ trợ deep linking: `/files/:id`, `/image/:id`, `/preview/:id`, `/s/:token` (Public share).
  - Các nhánh điều hướng chính trong `ShellRoute`:
    - `/files` (Tệp của tôi)
    - `/image` hoặc `/gallery` (Thư viện ảnh)
    - `/videos` (Video)
    - `/shared` (Được chia sẻ với tôi)
    - `/recent` (Gần đây)
    - `/starred` (Gắn sao)
    - `/trash` (Thùng rác)
    - `/search` (Tìm kiếm)
    - `/activity` (Nhật ký hoạt động)
    - `/storage` (Bộ nhớ và phân vùng đĩa)
    - `/transfers` (Tiến trình truyền tệp)
    - `/settings` (Cài đặt hệ thống và tài khoản)

### 2.3. Design System & Typography
- **Quy tắc thiết kế tuyệt đối:** Flat design, viền 1px (`1px solid`), KHÔNG đổ bóng (`no shadows`), KHÔNG dải chuyển màu (`no gradients`) trừ scrim bảo vệ chữ trên ảnh.
- **Màu sắc (`LdColors`):**
  - Dark Theme: Nền chính `#141414`, Nền nổi `#202020`, Nền chìm `#0E0E0E`, Chữ chính `#FFFFFF`, Chữ phụ `#909090`, Viền `#3D3D3D`.
  - Light Theme: Nền chính `#F6F7F9`, Nền nổi `#FFFFFF`, Nền chìm `#ECEEF1`, Chữ chính `#111111`, Chữ phụ `#666666`, Viền `#E1E4E8`.
  - Brand Accents: Accent chính `#4C8DFF`, Cảnh báo/Xóa `#EE7759`.
  - File Category Colors: Document `#4C8DFF`, Spreadsheet `#4CAF6D`, Presentation `#E8935C`, PDF `#E5646B`, Code `#9B7BEF`, Media `#4CC6C6`.
  - Folder Swatches: `neutral` (#6E6E6E), `blue` (#4C8DFF), `green` (#4CAF6D), `orange` (#E8935C), `red` (#E5646B), `purple` (#9B7BEF), `teal` (#4CC6C6).
- **Typography (`LdTypography`):**
  - **Tiếng Việt (`vi`):** Sử dụng font **Plus Jakarta Sans** để hiển thị dấu thanh và ký tự tiếng Việt hoàn hảo, không bị lỗi baseline.
  - **Latin/Tiếng Anh (`en`):** Sử dụng font **Space Grotesk**.
  - **Tiếng Ả Rập (`ar`):** Sử dụng font **IBM Plex Sans Arabic**.
- **Bo góc (`LdRadii`):** Card 16px, Pill 24px, Sheet 16px, Field 12px, Chip 10px, Tile 14px.

---

## 3. KIẾN TRÚC NEXT.JS WEB CLIENT

### 3.1. Cấu trúc hiện tại
- **Framework:** Next.js 16 (Turbopack, App Router).
- **Quản lý phiên (`session.tsx`):** `SessionProvider` lưu access token và refresh token trong `localStorage`, theo dõi lifecycle tương ứng `SessionStage` của Flutter.
- **Theme (`theme.tsx`):** `ThemeProvider` hỗ trợ `system`, `dark`, `light`, lưu vào `localStorage.getItem("ld.theme")`, cập nhật thuộc tính `data-theme` trên thẻ `<html>` và xử lý FOUC.
- **Localization (`l10n.tsx`):** Đọc trực tiếp từ file ARB của Flutter qua `scripts/gen-l10n.mjs`, xuất file `l10n.generated.ts` với đầy đủ 415 chuỗi văn bản cho `vi`, `en`, `ar`.
- **CSS Tokens (`globals.css`):** Thiết lập toàn bộ CSS Custom Properties (`--bg-primary`, `--bg-elevated`, `--stroke`, `--accent`, `--warning`,...) khớp 100% với `LdColors`.

### 3.2. Điểm cần hoàn thiện để đạt 100% Parity
1. **Typography:** Cần bổ sung font `Plus_Jakarta_Sans` cho tiếng Việt trong `layout.tsx` và `globals.css`.
2. **Màn hình Tìm kiếm (`/search`):** Chưa có component `SearchScreen`, khi chọn tìm kiếm bị hiển thị rỗng.
3. **Đổi màu thư mục (`recolor`):** Chưa có bảng chọn màu thư mục (7 màu swatch) trong menu chuột phải và DetailsPane.
4. **Hộp thoại Di chuyển (`move`):** Cần bổ sung dialog chọn thư mục đích để di chuyển tệp.
5. **Hộp thoại Đổi tên (`rename`):** Cần thay thế `window.prompt` bằng `RenameDialog` đồng bộ giao diện.
6. **Đồng bộ hóa URL:** Cần đồng bộ URL parameters với state điều hướng để hỗ trợ nút Back/Forward và Bookmark trình duyệt.
