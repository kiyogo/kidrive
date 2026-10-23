# KiDrive v1.0.0

Official release of KiDrive (LocalDrive), an open-source, self-hosted personal cloud storage and NAS platform based on [LocalDrive by MultiX0](https://github.com/MultiX0/LocalDrive).

### 🚀 Highlights & Features
- **1-Line Linux Installer:**
  ```bash
  curl -fsSL https://raw.githubusercontent.com/kiyogo/kidrive/main/install.sh | sudo bash
  ```
- **Windows File Explorer Integration (KiyoDrive):** Mounts directly into **This PC**.
- **Embedded Web UI (Port 5437):** Modern Next.js 16 client bundled directly into Go server binaries.
- **High-Performance Go Backend (Port 9683):** SQLite, chunked uploads, live WebSockets.
- **Custom Update Support:** Configured for `https://drive.kiyo.vn` with fallback to GitHub Releases.
- **Cross-Platform:** Available for Linux, Windows, macOS, Android, and Docker.

### 📦 Installation Packages & Binaries
| File | Platform | Architecture | Description |
|---|---|---|---|
| `LocalDrive-win-x64-Setup.exe` | Windows | x64 | Full desktop client installer + KiyoDrive Explorer |
| `localdrive-win-x64.exe` | Windows | x64 | Standalone server with embedded Web UI |
| `localdrive-linux-x64` | Linux | x64 | Server binary for Ubuntu, Debian, CentOS, Alma, Rocky... |
| `localdrive-linux-arm64` | Linux | arm64 | Server binary for Raspberry Pi & ARM VPS |
| `localdrive-linux.tar.gz` | Linux | x64 / arm64 | Offline package archive with install.sh |
| `localdrive-macos-x64` | macOS | x64 | macOS Intel server binary |
| `localdrive-macos-arm64` | macOS | arm64 | macOS Apple Silicon (M1/M2/M3/M4) server binary |
| `LocalDrive-android.apk` | Android | Universal | Android mobile application |
| `SHA256SUMS.txt` | All | - | Cryptographic SHA256 checksums |

---

### ⚖️ Attribution & License
Built upon [LocalDrive by MultiX0](https://github.com/MultiX0/LocalDrive). Distributed under the [MIT License](LICENSE).
