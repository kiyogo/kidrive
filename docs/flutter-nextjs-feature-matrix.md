# Ma trận Tính năng: Flutter Web Client ↔ Next.js Web Client

| Feature ID | Màn hình | Thành phần / Tính năng | Hành vi Flutter (Source of Truth) | Hành vi Next.js tương ứng | Trạng thái |
|---|---|---|---|---|---|
| F-01 | Shell | Thanh điều hướng dưới điện thoại | `LdBottomNav` 5 nút: Home, Gallery, Create (+), Shared, Settings | Đã triển khai `BottomItem` + nút tròn Create (+) | VERIFIED |
| F-02 | Shell | Sidebar máy tính | 9 mục: Files, Gallery, Videos, Shared, Recent, Starred, Trash, Storage, Settings | Đã triển khai đầy đủ 9 mục | VERIFIED |
| F-03 | Shell | Quota footer ở Sidebar | Thanh tiến trình dung lượng, tính toán mức giới hạn đĩa và tài khoản | Đã triển khai `QuotaBar` đo tỉ lệ chính xác | VERIFIED |
| F-04 | Shell | Nút tải lên nhanh (+) | Mở sheet/dialog chọn "Tải tệp lên" hoặc "Tạo thư mục mới" | Đã triển khai `Sheet` + input tải file | VERIFIED |
| F-05 | Files | Chế độ hiển thị Grid / List | Nút chuyển đổi view chế độ lưới và danh sách | Đã triển khai đầy đủ cả 2 chế độ | VERIFIED |
| F-06 | Files | Sắp xếp tệp (Sort) | Theo tên (A-Z, Z-A), thời gian cập nhật (Mới nhất, Cũ nhất), dung lượng | Đã triển khai Menu Sort tương ứng | VERIFIED |
| F-07 | Files | Tìm kiếm lọc nhanh | Lọc danh sách tệp trực tiếp theo tên gõ vào | Đã triển khai filter live | VERIFIED |
| F-08 | Files | Tạo thư mục mới | Dialog nhập tên thư mục, gọi API `POST /nodes` | Đã triển khai `Dialog` tạo thư mục | VERIFIED |
| F-09 | Files | Tải tệp lên (Upload) | Hỗ trợ chọn tệp, kéo thả (Drag & Drop), xử lý trùng tên | Đã triển khai drag overlay & `DuplicateClashSheet` | VERIFIED |
| F-10 | Files | Menu chuột phải (Context Menu) | Mở, Tải xuống, Gắn sao, Chia sẻ, Đổi tên, Đổi màu, Thùng rác | Cần tích hợp Đổi màu thư mục (`recolor`) & Di chuyển (`move`) | P1 IN-PROGRESS |
| F-11 | Files | Bảng chi tiết tệp (Details Pane) | Hiển thị thông số metadata, lịch sử phiên bản, hành động nhanh | Cần thay `window.prompt` bằng `RenameDialog`, thêm `recolor` | P1 IN-PROGRESS |
| F-12 | Files | Thanh chọn nhiều (Selection Bar) | Chọn tất cả, đếm số lượng, xóa hàng loạt vào thùng rác | Đã triển khai selection floating bar | VERIFIED |
| F-13 | Files | Kéo thả di chuyển (Drag & Drop Move) | Kéo tệp thả vào thư mục để di chuyển | Đã triển khai qua `dragProps` & `folderProps` | VERIFIED |
| F-14 | Gallery | Nhóm ảnh theo ngày | Nhóm "Hôm nay", "Hôm qua", hoặc định dạng ngày tháng cụ thể | Đã triển khai nhóm ngày trong `GalleryScreen` | VERIFIED |
| F-15 | Gallery | Thay đổi kích thước cột | Nút điều chỉnh kích thước lưới ảnh | Đã triển khai chuyển đổi số cột | VERIFIED |
| F-16 | Gallery | Trình xem ảnh toàn màn hình | Xem ảnh, phím mũi tên trái/phải, phóng to thu nhỏ | Đã triển khai `Preview` kèm thanh công cụ cuộn ngang | VERIFIED |
| F-17 | Videos | Danh sách video | Lưới video với thời lượng, nhãn dung lượng, bộ lọc sắp xếp | Đã triển khai trong `VideosScreen` | VERIFIED |
| F-18 | Preview | Trình xem đa định dạng | Hỗ trợ Ảnh, Video, Âm thanh, PDF, Markdown, Text/Code số dòng | Đã triển khai đầy đủ các viewer | VERIFIED |
| F-19 | Share | Hộp thoại Chia sẻ (Share Sheet) | Tạo link công khai, mật khẩu, thời hạn, cho phép tải, thu hồi | Đã triển khai `ShareSheet` | VERIFIED |
| F-20 | Trash | Khôi phục & Xóa vĩnh viễn | Khôi phục tệp, xóa vĩnh viễn, dọn sạch thùng rác | Đã triển khai đầy đủ | VERIFIED |
| F-21 | Search | Tìm kiếm toàn diện (Omnisearch) | Ô tìm kiếm có debounce, phím tắt, gợi ý trạng thái rỗng, kết quả tệp | Chưa có component `SearchScreen` độc lập | P1 IN-PROGRESS |
| F-22 | Settings | Chuyển đổi Theme | Hỗ trợ 3 chế độ: Hệ thống (System), Sáng (Light), Tối (Dark) | Đã triển khai `ThemeProvider` & `ThemeToggle` | VERIFIED |
| F-23 | Settings | Ngôn ngữ | Hỗ trợ Tiếng Việt, Tiếng Anh, Tiếng Ả Rập | Đã triển khai `useL10n` | VERIFIED |
| F-24 | Settings | Quản lý thiết bị | Danh sách thiết bị hiện tại, phê duyệt/thu hồi phiên đăng nhập | Đã triển khai trong `SettingsScreen` | VERIFIED |
| F-25 | Settings | Quản lý thành viên (Admin) | Tạo mã mời, danh sách thành viên, đổi quyền, xóa người dùng | Đã triển khai trong `SettingsScreen` | VERIFIED |
| F-26 | Settings | Cài đặt Ngoại tuyến | Thống kê dung lượng Cache, cảnh báo Soft Cap, xóa bộ nhớ đệm | Đã triển khai đầy đủ qua Cache Storage | VERIFIED |
