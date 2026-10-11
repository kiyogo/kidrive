# Ma trận Trực quan: Flutter Web Client ↔ Next.js Web Client

| Yếu tố Thiết kế | Chuẩn mực Flutter (Source of Truth) | Triển khai Next.js | Mức độ tương thích | Ghi chú & Khắc phục |
|---|---|---|---|---|
| **Dark Nền chính** | `#141414` (`darkBackgroundPrimary`) | `var(--bg-primary): #141414` | 100% Khớp | Đã kiểm chứng |
| **Dark Nền nổi** | `#202020` (`darkBackgroundElevated`) | `var(--bg-elevated): #202020` | 100% Khớp | Dùng cho card, sidebar, dialog |
| **Dark Nền chìm** | `#0E0E0E` (`darkBackgroundSunken`) | `var(--bg-sunken): #0e0e0e` | 100% Khớp | Dùng cho ô input, khung preview |
| **Dark Chữ chính** | `#FFFFFF` (`darkForegroundPrimary`) | `var(--fg-primary): #ffffff` | 100% Khớp | Dùng cho tiêu đề, nhãn chính |
| **Dark Chữ phụ** | `#909090` (`darkForegroundSecondary`) | `var(--fg-secondary): #909090` | 100% Khớp | Dùng cho mô tả, kích thước tệp |
| **Dark Viền viền** | `#3D3D3D` (`darkStrokeOutline`) | `var(--stroke): #3d3d3d` | 100% Khớp | Độ dày viền luôn là 1px flat |
| **Light Nền chính** | `#F6F7F9` (`lightBackgroundPrimary`) | `var(--bg-primary): #f6f7f9` | 100% Khớp | Kiểm chứng qua `data-theme="light"` |
| **Light Nền nổi** | `#FFFFFF` (`lightBackgroundElevated`) | `var(--bg-elevated): #ffffff` | 100% Khớp | Dùng cho card, sidebar nền sáng |
| **Light Nền chìm** | `#ECEEF1` (`lightBackgroundSunken`) | `var(--bg-sunken): #eceef1` | 100% Khớp | Dùng cho input nền sáng |
| **Light Chữ chính** | `#111111` (`lightForegroundPrimary`) | `var(--fg-primary): #111111` | 100% Khớp | Tương phản hoàn hảo trên nền sáng |
| **Light Chữ phụ** | `#666666` (`lightForegroundSecondary`) | `var(--fg-secondary): #666666` | 100% Khớp | Đọc rõ, không gây mỏi mắt |
| **Light Viền viền** | `#E1E4E8` (`lightStrokeOutline`) | `var(--stroke): #e1e4e8` | 100% Khớp | Đường nét sắc sảo 1px |
| **Màu tương tác** | `#4C8DFF` (`accentPrimary`) | `var(--accent): #4c8dff` | 100% Khớp | Nút chính, tab chọn, link |
| **Màu cảnh báo/xóa** | `#EE7759` (`accentWarning`) | `var(--warning): #ee7759` | 100% Khớp | Thùng rác, nút hủy, cảnh báo |
| **Font Tiếng Việt** | Plus Jakarta Sans (`_vietnameseBase`) | Đang dùng Space Grotesk | Cần cập nhật | Thêm `Plus_Jakarta_Sans` cho tiếng Việt |
| **Font Tiếng Anh** | Space Grotesk (`_latinBase`) | Space Grotesk | 100% Khớp | Đã nạp qua `next/font/google` |
| **Font Tiếng Ả Rập** | IBM Plex Sans Arabic (`_arabicBase`) | IBM Plex Sans Arabic | 100% Khớp | Đã nạp qua `next/font/google` |
| **Bo góc Card** | 16px (`LdRadii.card`) | `var(--r-card): 16px` | 100% Khớp | Đồng nhất toàn hệ thống |
| **Bo góc Pill** | 24px (`LdRadii.pill`) | `var(--r-pill): 24px` | 100% Khớp | Nút nhấn hình con nhộng |
| **Bo góc Sheet** | 16px top-left/right (`LdRadii.sheet`) | `var(--r-sheet): 16px` | 100% Khớp | Đáy kéo lên trên mobile |
| **Bo góc Input** | 12px (`LdRadii.field`) | `var(--r-field): 12px` | 100% Khớp | Ô nhập liệu |
| **Bóng đổ (Shadows)** | Không có (0px elevation flat) | Không có bóng đổ | 100% Khớp | Thiết kế phẳng thuần túy |
| **Dải màu (Gradients)** | Không có gradient trang trí | Không có gradient trang trí | 100% Khớp | Chỉ có gradient đen mờ trong ảnh |
