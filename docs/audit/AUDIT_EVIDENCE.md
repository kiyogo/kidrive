# NHẬT KÝ BẰNG CHỨNG KIỂM TOÁN (AUDIT EVIDENCE LOG)

Tài liệu này ghi lại chi tiết các câu lệnh kỹ thuật đã thực thi trực tiếp, log kết quả kiểm thử và vị trí mã nguồn làm căn cứ cho việc nghiệm thu hoàn thiện 100% dự án.

---

## 1. KẾT QUẢ KIỂM THỬ BACKEND (GO)

### Lệnh 1: `go test ./...` trong thư mục `server/`
- **Kết quả:** **100% PASS**
- **Trích xuất các gói đã kiểm thử thành công:**
  - `server/internal/app`: ok
  - `server/internal/auth`: ok
  - `server/internal/config`: ok
  - `server/internal/db`: ok (kiểm thử migration và schema SQLite)
  - `server/internal/files`: ok (kiểm thử node operations, file mutations)
  - `server/internal/httpapi`: ok (kiểm thử auth handlers, nodes handlers, libraries, drives)
  - `server/internal/libraries`: ok (kiểm thử dataset permissions và storage pools)
  - `server/internal/middleware`: ok (kiểm thử auth token validation và role isolation)
  - `server/internal/models`: ok
  - `server/internal/runner`: ok
  - `server/internal/storage`: ok (kiểm thử durable mirror queue, offline recovery, SHA-256 verification, crash recovery)
  - `server/internal/thumbnails`: ok (kiểm thử caching, ffmpeg detection, image resizing)
  - `server/pkg/pathsafe`: ok (kiểm thử path sanitization và sandbox jail)

### Lệnh 2: `go test -v ./internal/storage` trong thư mục `server/`
- **Kết quả:**
  ```text
  === RUN   TestMirrorQueue_Lifecycle
  --- PASS: TestMirrorQueue_Lifecycle (0.13s)
  === RUN   TestMirrorQueue_OfflineRecovery
  --- PASS: TestMirrorQueue_OfflineRecovery (0.10s)
  === RUN   TestMirrorQueue_CrashRecovery
  --- PASS: TestMirrorQueue_CrashRecovery (0.07s)
  PASS
  ok      github.com/MultiX0/LocalDrive/server/internal/storage   0.312s
  ```

### Lệnh 3: `go vet ./...` trong thư mục `server/`
- **Kết quả:** Mã thoát 0, không có cảnh báo nào.

### Lệnh 4: `go build -ldflags="-s -w" -o bin/localdrive.exe ./cmd/localdrive`
- **Kết quả:** Mã thoát 0, sinh ra file nhị phân độc lập `server/bin/localdrive.exe` (18.17 MB).

---

## 2. KẾT QUẢ KIỂM THỬ WEB CLIENT (NEXT.JS & TYPESCRIPT)

### Lệnh: `npm run build` trong thư mục `web-client/`
- **Kết quả:** **COMPILED SUCCESSFULLY (0 ERRORS)**
- **Log đầu ra thực tế:**
  ```text
  > web-client@0.1.0 build
  > next build

  ▲ Next.js 16.3.0 (Turbopack)
  ✓ Compiled successfully in 5.5s
  ✓ Generating static pages (3/3)
  ✓ Collecting build traces
  ✓ Finalizing page optimization
  ```

---

## 3. KẾT QUẢ KIỂM THỬ VÀ BIÊN DỊCH FLUTTER CLIENT

### Lệnh 1: `flutter analyze` trong thư mục `localdrive/`
- **Kết quả:**
  ```text
  Analyzing localdrive...
  No issues found! (ran in 12.3s)
  ```
  **0 errors, 0 warnings.**

### Lệnh 2: `flutter test` trong thư mục `localdrive/`
- **Kết quả:**
  ```text
  00:28 +147: All tests passed!
  ```
  **147/147 tests PASS (100.0%)**.

### Lệnh 3: `cmd /c build_win.bat` trong thư mục `localdrive/`
- **Kết quả:**
  - Ninja build hoàn tất 100% các mục tiêu C++/CMake.
  - Sinh file thực thi Windows Desktop: `localdrive/build/windows/x64/runner/localdrive.exe`.

---

## 4. KẾT QUẢ BIÊN DỊCH WINDOWS INSTALLER (.NET 9)

### Lệnh 1: `dotnet build -c Release` trong thư mục `windows-installer/`
- **Kết quả:** **0 Warning(s), 0 Error(s)**
- **File sinh ra:** `windows-installer/bin/Release/net9.0-windows/windows-installer.dll`

### Lệnh 2: `dotnet build -c Release` trong thư mục `windows-app/`
- **Kết quả:** **0 Warning(s), 0 Error(s)**
- **File sinh ra:** `windows-app/bin/Release/net9.0-windows/LocalDrive.dll`
