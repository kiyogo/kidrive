# Bản đồ Đối chiếu Màn hình: Flutter Web Client ↔ Next.js Web Client

Bảng đối chiếu toàn bộ các màn hình, đường dẫn và trạng thái kiểm kê giữa Flutter Web Client (Source of Truth) và Next.js Web Client.

| STT | Flutter Screen | Flutter Route | Next.js Component / Route | Visual Status | Functional Status | Parity Status |
|---|---|---|---|---|---|---|
| 1 | `WelcomePage` | `/welcome` | `WelcomeScreen` (`AuthScreens.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 2 | `LanguagePage` | `/language` | `LanguageScreen` (`AuthScreens.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 3 | `ConnectPage` | `/connect` | `ConnectScreen` (`AuthScreens.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 4 | `SetupPage` | `/setup` | `SetupScreen` (`AuthScreens.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 5 | `SignInPage` | `/signin` | `SignInScreen` (`AuthScreens.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 6 | `SignInPage(create)` | `/create-account` | `SignInScreen(createMode)` | 100% Khớp | 100% Hoạt động | VERIFIED |
| 7 | `PendingApprovalPage` | `/pending` | `PendingApprovalScreen` (`AuthScreens.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 8 | `ChangePasswordPage` | `/change-password` | `MustChangePassword` (`page.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 9 | `TwoFactorSetupPage` | `/two-factor` | `TwoFactorSetup` (`TwoFactorSetup.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 10 | `FilesPage` (Root) | `/files` | `FilesBrowser` (`FilesBrowser.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 11 | `FilesPage` (Folder) | `/files/:id` | `FilesBrowser` + `Breadcrumb` | 100% Khớp | 100% Hoạt động | VERIFIED |
| 12 | `GalleryPage` | `/image` hoặc `/gallery` | `GalleryScreen` (`Gallery.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 13 | `PhotoViewerPage` | `/image/:id` | `Preview` (`Preview.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 14 | `VideosPage` | `/videos` | `VideosScreen` (`VideosScreen.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 15 | `SharedPage` | `/shared` | `FilesBrowser(filter: shared)` | 100% Khớp | 100% Hoạt động | VERIFIED |
| 16 | `StarredPage` | `/starred` | `FilesBrowser(filter: starred)` | 100% Khớp | 100% Hoạt động | VERIFIED |
| 17 | `RecentPage` | `/recent` | `FilesBrowser(filter: recent)` | 100% Khớp | 100% Hoạt động | VERIFIED |
| 18 | `TrashPage` | `/trash` | `FilesBrowser(filter: trash)` | 100% Khớp | 100% Hoạt động | VERIFIED |
| 19 | `SearchPage` | `/search` | `SearchScreen` (`SearchScreen.tsx`) | Đang hoàn thiện | Đang kết nối | P1 IN-PROGRESS |
| 20 | `ActivityPage` | `/activity` | `ActivityScreen` (`Settings.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 21 | `StoragePage` | `/storage` | `StorageScreen` (`Settings.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 22 | `TransfersPage` | `/transfers` | `TransfersScreen` (`Gallery.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 23 | `SettingsPage` | `/settings` | `SettingsScreen` (`Settings.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 24 | `AboutPage` | `/settings/about` | `AboutSection` (`Settings.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 25 | `PreviewPage` (File) | `/preview/:id` | `Preview` (`Preview.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
| 26 | `PublicSharePage` | `/s/:token` | `Preview` (`Preview.tsx`) | 100% Khớp | 100% Hoạt động | VERIFIED |
