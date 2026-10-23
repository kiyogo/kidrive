package httpapi

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/MultiX0/LocalDrive/server/internal/updater"
)

type systemUpdateCheckResponse struct {
	HasUpdate      bool   `json:"has_update"`
	CurrentVersion string `json:"current_version"`
	LatestVersion  string `json:"latest_version"`
	Notes          string `json:"notes,omitempty"`
	URL            string `json:"url,omitempty"`
	Size           int64  `json:"size,omitempty"`
	Domain         string `json:"domain,omitempty"`
}

var (
	updateMu        sync.Mutex
	isUpdatingState bool
)

func (a *API) handleSystemUpdateCheck(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
	defer cancel()

	release, err := updater.Check(ctx, Version)
	if err != nil || release == nil {
		writeJSON(w, http.StatusOK, systemUpdateCheckResponse{
			HasUpdate:      false,
			CurrentVersion: Version,
			LatestVersion:  Version,
			Notes:          "Hệ thống đang chạy phiên bản mới nhất.",
			Domain:         updater.GetUpdateBaseURL(),
		})
		return
	}

	writeJSON(w, http.StatusOK, systemUpdateCheckResponse{
		HasUpdate:      true,
		CurrentVersion: Version,
		LatestVersion:  release.Version,
		Notes:          release.Notes,
		URL:            release.URL,
		Size:           release.Size,
		Domain:         updater.GetUpdateBaseURL(),
	})
}

func (a *API) handleSystemUpdateApply(w http.ResponseWriter, r *http.Request) {
	updateMu.Lock()
	if isUpdatingState {
		updateMu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "in_progress",
			"message": "Quá trình cập nhật đang diễn ra...",
		})
		return
	}
	isUpdatingState = true
	updateMu.Unlock()

	go func() {
		defer func() {
			updateMu.Lock()
			isUpdatingState = false
			updateMu.Unlock()
		}()

		time.Sleep(1 * time.Second)
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		defer cancel()

		release, err := updater.Check(ctx, Version)
		if err != nil || release == nil {
			return
		}

		if _, err := updater.Apply(ctx, release); err != nil {
			return
		}

		time.Sleep(1 * time.Second)
		_ = updater.TriggerRestart()
	}()

	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "started",
		"message": "Đang tải và cập nhật phiên bản mới. Máy chủ sẽ khởi động lại sau vài giây.",
	})
}
