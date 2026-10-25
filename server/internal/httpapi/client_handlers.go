package httpapi

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type clientUpdateResponse struct {
	HasUpdate   bool   `json:"has_update"`
	Version     string `json:"version"`
	Notes       string `json:"notes"`
	DownloadURL string `json:"download_url,omitempty"`
	Size        int64  `json:"size,omitempty"`
}

func (a *API) handleClientUpdate(w http.ResponseWriter, r *http.Request) {
	// Vô hiệu hóa 100% thông báo cập nhật phiên bản 0.0.2 theo yêu cầu người dùng
	writeJSON(w, http.StatusOK, clientUpdateResponse{
		HasUpdate: false,
		Version:   Version,
		Notes:     "Hệ thống đang hoạt động ở phiên bản mới nhất.",
	})
}

func (a *API) handleClientDownload(w http.ResponseWriter, r *http.Request) {
	platform := strings.ToLower(r.URL.Query().Get("platform"))

	candidates := []string{}
	switch platform {
	case "android":
		candidates = []string{"LocalDrive.apk", "localdrive-client.apk"}
	case "windows":
		candidates = []string{"localdrive-client-windows.zip", "setup.exe", "localdrive-windows.zip"}
	case "linux":
		candidates = []string{"localdrive-client-linux.tar.gz", "localdrive-linux.tar.gz"}
	default:
		candidates = []string{"LocalDrive.apk", "localdrive-client.apk"}
	}

	execDir := ""
	if exe, err := os.Executable(); err == nil {
		execDir = filepath.Dir(exe)
	}

	var foundFile string
	for _, name := range candidates {
		pathsToTry := []string{
			name,
			filepath.Join("downloads", name),
			filepath.Join("public", name),
		}
		if execDir != "" {
			pathsToTry = append(pathsToTry,
				filepath.Join(execDir, name),
				filepath.Join(execDir, "downloads", name),
				filepath.Join(execDir, "..", name),
			)
		}

		for _, p := range pathsToTry {
			if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
				foundFile = p
				break
			}
		}
		if foundFile != "" {
			break
		}
	}

	if foundFile == "" {
		writeError(w, http.StatusNotFound, "not_found", "client installer file not found on server")
		return
	}

	w.Header().Set("Content-Disposition", "attachment; filename=\""+filepath.Base(foundFile)+"\"")
	http.ServeFile(w, r, foundFile)
}
