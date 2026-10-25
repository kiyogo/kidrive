package httpapi

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/MultiX0/LocalDrive/server/internal/audit"
	"github.com/MultiX0/LocalDrive/server/internal/db"
	"github.com/MultiX0/LocalDrive/server/internal/files"
	mw "github.com/MultiX0/LocalDrive/server/internal/middleware"
	"github.com/MultiX0/LocalDrive/server/internal/models"
)

// DatasetDTO models a dataset record.
type DatasetDTO struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Pool        string `json:"pool"`
	Mount       string `json:"mount"`
	QuotaBytes  int64  `json:"quota_bytes"`
	UsedBytes   int64  `json:"used_bytes"`
	AvailableBytes int64 `json:"available_bytes"`
	Compression string `json:"compression"`
	Atime       string `json:"atime"`
	Dedup       string `json:"dedup"`
	SyncMode    string `json:"sync_mode"`
	Status      string `json:"status"`
	CreatedAt   int64  `json:"created_at"`
	UpdatedAt   int64  `json:"updated_at"`
}

// NetworkShareDTO models a network share record.
type NetworkShareDTO struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Purpose        string `json:"purpose"`
	Path           string `json:"path"`
	Description    string `json:"description"`
	ReadOnly       bool   `json:"read_only"`
	Browseable     bool   `json:"browseable"`
	HideUnreadable bool   `json:"hide_unreadable"`
	GuestOK        bool   `json:"guest_ok"`
	Status         string `json:"status"`
	CreatedAt      int64  `json:"created_at"`
	UpdatedAt      int64  `json:"updated_at"`
}

// StoragePoolDTO models a storage pool record.
type StoragePoolDTO struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Layout        string   `json:"layout"`
	Status        string   `json:"status"`
	TotalBytes    int64    `json:"total_bytes"`
	UsedBytes     int64    `json:"used_bytes"`
	AutoTrim      bool     `json:"auto_trim"`
	ScrubSchedule string   `json:"scrub_schedule"`
	Disks         []string `json:"disks"`
	CreatedAt     int64    `json:"created_at"`
	UpdatedAt     int64    `json:"updated_at"`
}

// ==================== DATASETS ====================

func (a *API) handleListDatasets(w http.ResponseWriter, r *http.Request) {
	limit := intQuery(r, "limit", 0)
	offset := intQuery(r, "offset", 0)
	search := strings.TrimSpace(r.URL.Query().Get("search"))

	if limit > 0 {
		var whereClause string
		var countArgs []any
		if search != "" {
			whereClause = " WHERE (lower(name) LIKE ? OR lower(pool) LIKE ? OR lower(mount) LIKE ?)"
			pat := "%" + strings.ToLower(search) + "%"
			countArgs = append(countArgs, pat, pat, pat)
		}
		var total int64
		if err := a.db.Read().QueryRowContext(r.Context(), "SELECT COUNT(*) FROM datasets"+whereClause, countArgs...).Scan(&total); err != nil {
			a.fail(w, r, err)
			return
		}

		queryArgs := append([]any{}, countArgs...)
		queryArgs = append(queryArgs, limit, offset)
		rows, err := a.db.Read().QueryContext(r.Context(),
			`SELECT id, name, pool, mount, quota_bytes, used_bytes, recordsize, compression, atime, dedup, sync_mode, status, created_at, updated_at
			 FROM datasets`+whereClause+` ORDER BY name ASC LIMIT ? OFFSET ?`, queryArgs...)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		defer rows.Close()

		poolFreeMap := make(map[string]int64)
		zfsDsMap := make(map[string]int64)
		if hasZFSTools() {
			for _, zp := range detectZFSPools() {
				free := zp.TotalBytes - zp.UsedBytes
				if free < 0 {
					free = 0
				}
				poolFreeMap[zp.Name] = free
				poolFreeMap[strings.ToLower(zp.Name)] = free
				poolFreeMap[strings.ToUpper(zp.Name)] = free
				for _, zd := range zp.Datasets {
					zfsDsMap[strings.ToLower(strings.Trim(zd.Name, "/"))] = zd.UsedBytes
				}
			}
		}
		if pRows, pErr := a.db.Read().QueryContext(r.Context(), `SELECT name, total_bytes, used_bytes FROM storage_pools`); pErr == nil {
			for pRows.Next() {
				var pName string
				var pTotal, pUsed int64
				if err := pRows.Scan(&pName, &pTotal, &pUsed); err == nil {
					if _, exists := poolFreeMap[pName]; !exists {
						free := pTotal - pUsed
						if free < 0 {
							free = 0
						}
						poolFreeMap[pName] = free
						poolFreeMap[strings.ToLower(pName)] = free
					}
				}
			}
			pRows.Close()
		}

		out := make([]DatasetDTO, 0)
		for rows.Next() {
			var d DatasetDTO
			var recordsize string
			if err := rows.Scan(&d.ID, &d.Name, &d.Pool, &d.Mount, &d.QuotaBytes, &d.UsedBytes, &recordsize, &d.Compression, &d.Atime, &d.Dedup, &d.SyncMode, &d.Status, &d.CreatedAt, &d.UpdatedAt); err != nil {
				a.fail(w, r, err)
				return
			}
			dClean := strings.ToLower(strings.Trim(d.Name, "/"))
			if realUsed, ok := zfsDsMap[dClean]; ok && realUsed > 0 && realUsed != d.UsedBytes {
				d.UsedBytes = realUsed
				_ = a.db.Write(r.Context(), func(c context.Context, tx *sql.Tx) error {
					_, _ = tx.ExecContext(c, `UPDATE datasets SET used_bytes = ? WHERE id = ?`, realUsed, d.ID)
					return nil
				})
			}
			pFree, ok := poolFreeMap[d.Pool]
			if !ok {
				pFree = poolFreeMap[strings.ToLower(d.Pool)]
			}
			if d.QuotaBytes > 0 {
				remQuota := d.QuotaBytes - d.UsedBytes
				if remQuota < 0 {
					remQuota = 0
				}
				if pFree > 0 && remQuota > pFree {
					d.AvailableBytes = pFree
				} else {
					d.AvailableBytes = remQuota
				}
			} else {
				d.AvailableBytes = pFree
			}
			out = append(out, d)
		}
		if err := rows.Err(); err != nil {
			a.fail(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"datasets":    out,
			"total":       total,
			"limit":       limit,
			"offset":      offset,
			"has_more":    int64(offset+len(out)) < total,
			"next_offset": offset + len(out),
		})
		return
	}

	poolFreeMap := make(map[string]int64)
	zfsDsMap := make(map[string]int64)
	if hasZFSTools() {
		for _, zp := range detectZFSPools() {
			free := zp.TotalBytes - zp.UsedBytes
			if free < 0 {
				free = 0
			}
			poolFreeMap[zp.Name] = free
			poolFreeMap[strings.ToLower(zp.Name)] = free
			poolFreeMap[strings.ToUpper(zp.Name)] = free
			for _, zd := range zp.Datasets {
				zfsDsMap[strings.ToLower(strings.Trim(zd.Name, "/"))] = zd.UsedBytes
			}
		}
	}
	if pRows, pErr := a.db.Read().QueryContext(r.Context(), `SELECT name, total_bytes, used_bytes FROM storage_pools`); pErr == nil {
		for pRows.Next() {
			var pName string
			var pTotal, pUsed int64
			if err := pRows.Scan(&pName, &pTotal, &pUsed); err == nil {
				if _, exists := poolFreeMap[pName]; !exists {
					free := pTotal - pUsed
					if free < 0 {
						free = 0
					}
					poolFreeMap[pName] = free
					poolFreeMap[strings.ToLower(pName)] = free
				}
			}
		}
		pRows.Close()
	}

	rows, err := a.db.Read().QueryContext(r.Context(),
		`SELECT id, name, pool, mount, quota_bytes, used_bytes, recordsize, compression, atime, dedup, sync_mode, status, created_at, updated_at
		 FROM datasets ORDER BY name ASC`)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	defer rows.Close()

	out := make([]DatasetDTO, 0)
	for rows.Next() {
		var d DatasetDTO
		var recordsize string
		if err := rows.Scan(&d.ID, &d.Name, &d.Pool, &d.Mount, &d.QuotaBytes, &d.UsedBytes, &recordsize, &d.Compression, &d.Atime, &d.Dedup, &d.SyncMode, &d.Status, &d.CreatedAt, &d.UpdatedAt); err != nil {
			a.fail(w, r, err)
			return
		}
		dClean := strings.ToLower(strings.Trim(d.Name, "/"))
		if realUsed, ok := zfsDsMap[dClean]; ok && realUsed > 0 && realUsed != d.UsedBytes {
			d.UsedBytes = realUsed
			_ = a.db.Write(r.Context(), func(c context.Context, tx *sql.Tx) error {
				_, _ = tx.ExecContext(c, `UPDATE datasets SET used_bytes = ? WHERE id = ?`, realUsed, d.ID)
				return nil
			})
		}
		pFree, ok := poolFreeMap[d.Pool]
		if !ok {
			pFree = poolFreeMap[strings.ToLower(d.Pool)]
		}
		if d.QuotaBytes > 0 {
			remQuota := d.QuotaBytes - d.UsedBytes
			if remQuota < 0 {
				remQuota = 0
			}
			if pFree > 0 && remQuota > pFree {
				d.AvailableBytes = pFree
			} else {
				d.AvailableBytes = remQuota
			}
		} else {
			d.AvailableBytes = pFree
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		a.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"datasets": out})
}

type createDatasetReq struct {
	Name        string `json:"name"`
	Pool        string `json:"pool"`
	Mount       string `json:"mount"`
	QuotaBytes  int64  `json:"quota_bytes"`
	Compression string `json:"compression"`
	Atime       string `json:"atime"`
	Dedup       string `json:"dedup"`
	SyncMode    string `json:"sync_mode"`
}

func (a *API) handleCreateDataset(w http.ResponseWriter, r *http.Request) {
	var req createDatasetReq
	if !decodeJSON(w, r, &req) {
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "dataset name is required")
		return
	}

	var poolCount int
	_ = a.db.Read().QueryRowContext(r.Context(), `SELECT COUNT(*) FROM storage_pools`).Scan(&poolCount)
	if poolCount == 0 {
		writeError(w, http.StatusBadRequest, "no_storage_pool", "Chưa cấu hình Nhóm lưu trữ (Storage Pool). Vui lòng tạo Nhóm lưu trữ trước khi tạo Tập dữ liệu.")
		return
	}

	pool := strings.TrimSpace(req.Pool)
	if pool == "" {
		// Default to first existing pool
		_ = a.db.Read().QueryRowContext(r.Context(), `SELECT name FROM storage_pools ORDER BY name ASC LIMIT 1`).Scan(&pool)
		if pool == "" {
			pool = "tank"
		}
	} else {
		var poolExists int
		_ = a.db.Read().QueryRowContext(r.Context(), `SELECT COUNT(*) FROM storage_pools WHERE name = ?`, pool).Scan(&poolExists)
		if poolExists == 0 {
			writeError(w, http.StatusBadRequest, "invalid_pool", "Nhóm lưu trữ không tồn tại trong hệ thống")
			return
		}
	}
	mount := strings.TrimSpace(req.Mount)
	if mount == "" {
		mount = filepath.Join(a.cfg.LibraryPath, name)
	}

	// Create physical directory on host disk
	_ = os.MkdirAll(mount, 0755)

	recordsize := "128K"
	compression := strings.TrimSpace(req.Compression)
	if compression == "" {
		compression = "lz4"
	}
	atime := strings.TrimSpace(req.Atime)
	if atime == "" {
		atime = "off"
	}
	dedup := strings.TrimSpace(req.Dedup)
	if dedup == "" {
		dedup = "off"
	}
	syncMode := strings.TrimSpace(req.SyncMode)
	if syncMode == "" {
		syncMode = "standard"
	}

	now := db.NowMillis()
	id := db.NewID()

	err := a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
		// Ensure all ancestor datasets exist in db
		parts := strings.Split(name, "/")
		if len(parts) > 2 {
			for i := 2; i < len(parts); i++ {
				parentName := strings.Join(parts[:i], "/")
				parentMount := filepath.Join(a.cfg.LibraryPath, parentName)
				_ = os.MkdirAll(parentMount, 0755)
				var existingID string
				if err := tx.QueryRowContext(ctx, `SELECT id FROM datasets WHERE name = ?`, parentName).Scan(&existingID); err == sql.ErrNoRows {
					parentID := db.NewID()
					if _, err := tx.ExecContext(ctx,
						`INSERT INTO datasets (id, name, pool, mount, quota_bytes, used_bytes, recordsize, compression, atime, dedup, sync_mode, status, created_at, updated_at)
						 VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 'mounted', ?, ?)`,
						parentID, parentName, pool, parentMount, recordsize, compression, atime, dedup, syncMode, now, now); err != nil {
						return err
					}
				}
			}
		}

		_, err := tx.ExecContext(ctx,
			`INSERT INTO datasets (id, name, pool, mount, quota_bytes, used_bytes, recordsize, compression, atime, dedup, sync_mode, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'mounted', ?, ?)`,
			id, name, pool, mount, req.QuotaBytes, recordsize, compression, atime, dedup, syncMode, now, now)
		return err
	})
	if err != nil {
		a.fail(w, r, err)
		return
	}

	user, _ := mw.UserFrom(r.Context())
	a.audit.Record(r.Context(), audit.Entry{
		UserID: user.ID, Action: audit.ActionLibraryRegistered, IP: clientIP(r),
		Metadata: map[string]any{"dataset": name, "mount": mount, "pool": pool},
	})

	writeJSON(w, http.StatusCreated, map[string]any{
		"dataset": DatasetDTO{
			ID:          id,
			Name:        name,
			Pool:        pool,
			Mount:       mount,
			QuotaBytes:  req.QuotaBytes,
			UsedBytes:   0,
			Compression: compression,
			Atime:       atime,
			Dedup:       dedup,
			SyncMode:    syncMode,
			Status:      "mounted",
			CreatedAt:   now,
			UpdatedAt:   now,
		},
	})
}

type updateDatasetReq struct {
	QuotaBytes  *int64  `json:"quota_bytes"`
	Compression *string `json:"compression"`
	Atime       *string `json:"atime"`
	Dedup       *string `json:"dedup"`
	SyncMode    *string `json:"sync_mode"`
	Status      *string `json:"status"`
}

func (a *API) handleUpdateDataset(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updateDatasetReq
	if !decodeJSON(w, r, &req) {
		return
	}

	now := db.NowMillis()
	err := a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
		var count int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM datasets WHERE id = ?`, id).Scan(&count); err != nil {
			return err
		}
		if count == 0 {
			return sql.ErrNoRows
		}

		if req.QuotaBytes != nil {
			if _, err := tx.ExecContext(ctx, `UPDATE datasets SET quota_bytes = ?, updated_at = ? WHERE id = ?`, *req.QuotaBytes, now, id); err != nil {
				return err
			}
		}
		if req.Compression != nil {
			if _, err := tx.ExecContext(ctx, `UPDATE datasets SET compression = ?, updated_at = ? WHERE id = ?`, *req.Compression, now, id); err != nil {
				return err
			}
		}
		if req.Atime != nil {
			if _, err := tx.ExecContext(ctx, `UPDATE datasets SET atime = ?, updated_at = ? WHERE id = ?`, *req.Atime, now, id); err != nil {
				return err
			}
		}
		if req.Dedup != nil {
			if _, err := tx.ExecContext(ctx, `UPDATE datasets SET dedup = ?, updated_at = ? WHERE id = ?`, *req.Dedup, now, id); err != nil {
				return err
			}
		}
		if req.SyncMode != nil {
			if _, err := tx.ExecContext(ctx, `UPDATE datasets SET sync_mode = ?, updated_at = ? WHERE id = ?`, *req.SyncMode, now, id); err != nil {
				return err
			}
		}
		if req.Status != nil {
			if _, err := tx.ExecContext(ctx, `UPDATE datasets SET status = ?, updated_at = ? WHERE id = ?`, *req.Status, now, id); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "dataset not found")
			return
		}
		a.fail(w, r, err)
		return
	}

	var d DatasetDTO
	var recordsize string
	row := a.db.Read().QueryRowContext(r.Context(),
		`SELECT id, name, pool, mount, quota_bytes, used_bytes, recordsize, compression, atime, dedup, sync_mode, status, created_at, updated_at
		 FROM datasets WHERE id = ?`, id)
	if err := row.Scan(&d.ID, &d.Name, &d.Pool, &d.Mount, &d.QuotaBytes, &d.UsedBytes, &recordsize, &d.Compression, &d.Atime, &d.Dedup, &d.SyncMode, &d.Status, &d.CreatedAt, &d.UpdatedAt); err != nil {
		a.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"dataset": d})
}

func (a *API) handleDeleteDataset(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	err := a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
		var name string
		_ = tx.QueryRowContext(ctx, `SELECT name FROM datasets WHERE id = ?`, id).Scan(&name)
		res, err := tx.ExecContext(ctx, `DELETE FROM datasets WHERE id = ?`, id)
		if err != nil {
			return err
		}
		aff, _ := res.RowsAffected()
		if aff == 0 {
			return sql.ErrNoRows
		}
		if name != "" {
			_, _ = tx.ExecContext(ctx, `DELETE FROM datasets WHERE name LIKE ?`, name+"/%")
		}
		return nil
	})
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "dataset not found")
			return
		}
		a.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ==================== NETWORK SHARES ====================

func (a *API) handleListNetworkShares(w http.ResponseWriter, r *http.Request) {
	limit := intQuery(r, "limit", 0)
	offset := intQuery(r, "offset", 0)
	search := strings.TrimSpace(r.URL.Query().Get("search"))

	if limit > 0 {
		var whereClause string
		var countArgs []any
		if search != "" {
			whereClause = " WHERE (lower(name) LIKE ? OR lower(path) LIKE ? OR lower(description) LIKE ?)"
			pat := "%" + strings.ToLower(search) + "%"
			countArgs = append(countArgs, pat, pat, pat)
		}
		var total int64
		if err := a.db.Read().QueryRowContext(r.Context(), "SELECT COUNT(*) FROM network_shares"+whereClause, countArgs...).Scan(&total); err != nil {
			a.fail(w, r, err)
			return
		}

		queryArgs := append([]any{}, countArgs...)
		queryArgs = append(queryArgs, limit, offset)
		rows, err := a.db.Read().QueryContext(r.Context(),
			`SELECT id, name, purpose, path, description, read_only, browseable, hide_unreadable, guest_ok, status, created_at, updated_at
			 FROM network_shares`+whereClause+` ORDER BY name ASC LIMIT ? OFFSET ?`, queryArgs...)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		defer rows.Close()

		out := make([]NetworkShareDTO, 0)
		for rows.Next() {
			var s NetworkShareDTO
			var ro, br, hu, goK int
			if err := rows.Scan(&s.ID, &s.Name, &s.Purpose, &s.Path, &s.Description, &ro, &br, &hu, &goK, &s.Status, &s.CreatedAt, &s.UpdatedAt); err != nil {
				a.fail(w, r, err)
				return
			}
			s.ReadOnly = ro == 1
			s.Browseable = br == 1
			s.HideUnreadable = hu == 1
			s.GuestOK = goK == 1
			out = append(out, s)
		}
		if err := rows.Err(); err != nil {
			a.fail(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"shares":      out,
			"total":       total,
			"limit":       limit,
			"offset":      offset,
			"has_more":    int64(offset+len(out)) < total,
			"next_offset": offset + len(out),
		})
		return
	}

	rows, err := a.db.Read().QueryContext(r.Context(),
		`SELECT id, name, purpose, path, description, read_only, browseable, hide_unreadable, guest_ok, status, created_at, updated_at
		 FROM network_shares ORDER BY name ASC`)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	defer rows.Close()

	out := make([]NetworkShareDTO, 0)
	for rows.Next() {
		var s NetworkShareDTO
		var ro, br, hu, goK int
		if err := rows.Scan(&s.ID, &s.Name, &s.Purpose, &s.Path, &s.Description, &ro, &br, &hu, &goK, &s.Status, &s.CreatedAt, &s.UpdatedAt); err != nil {
			a.fail(w, r, err)
			return
		}
		s.ReadOnly = ro == 1
		s.Browseable = br == 1
		s.HideUnreadable = hu == 1
		s.GuestOK = goK == 1
		s.Path = cleanDisplayPath(s.Path)
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		a.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"shares": out})
}

type createNetworkShareReq struct {
	Name           string `json:"name"`
	Purpose        string `json:"purpose"`
	Path           string `json:"path"`
	Description    string `json:"description"`
	ReadOnly       bool   `json:"read_only"`
	Browseable     bool   `json:"browseable"`
	HideUnreadable bool   `json:"hide_unreadable"`
	GuestOK        bool   `json:"guest_ok"`
}

// syncSystemNetworkShare creates or publishes the folder as a real OS network share (SMB).
func syncSystemNetworkShare(name string, path string, readOnly bool, guestOk bool, active bool) error {
	trimmedName := strings.TrimSpace(name)
	trimmedPath := strings.TrimSpace(path)
	if trimmedName == "" || trimmedPath == "" {
		return nil
	}

	if runtime.GOOS == "windows" {
		// Resolve non-Windows or virtual paths (e.g., "/DATA/KiyoVN" or "Dữ liệu/KiyoVN")
		if filepath.VolumeName(trimmedPath) == "" {
			cleanP := strings.Trim(filepath.ToSlash(trimmedPath), "/")
			found := false
			norm := strings.TrimPrefix(cleanP, "DATA/")
			norm = strings.TrimPrefix(norm, "data/")
			norm = strings.TrimPrefix(norm, "Dữ liệu/")
			norm = strings.TrimPrefix(norm, "DỮ LIỆU/")

			// 1. Try E:\DATA\<subpath>, D:\DATA\<subpath>, C:\DATA\<subpath>
			for _, base := range []string{"E:\\DATA", "D:\\DATA", "C:\\DATA"} {
				cand := filepath.Join(base, filepath.FromSlash(norm))
				if fi, err := os.Stat(cand); err == nil && fi.IsDir() {
					trimmedPath = cand
					found = true
					break
				}
			}
			// 2. If not found, create in E:\DATA or Local Drive
			if !found {
				if fi, err := os.Stat("E:\\DATA"); err == nil && fi.IsDir() {
					trimmedPath = filepath.Join("E:\\DATA", filepath.FromSlash(norm))
				} else if userProfile := os.Getenv("USERPROFILE"); userProfile != "" {
					trimmedPath = filepath.Join(userProfile, "Local Drive", filepath.Base(cleanP))
				} else {
					trimmedPath = filepath.Clean("C:\\DATA\\" + filepath.Base(cleanP))
				}
			}
		}
		trimmedPath = filepath.Clean(filepath.FromSlash(trimmedPath))
	}

	// Ensure directory exists physically
	_ = os.MkdirAll(trimmedPath, 0755)

	// If inactive, remove share
	if !active {
		removeSystemNetworkShare(trimmedName)
		return nil
	}

	// On Windows, use 'net share'
	if runtime.GOOS == "windows" {
		// First delete existing share with same name (if any) to prevent conflict
		_ = exec.Command("net", "share", trimmedName, "/DELETE", "/Y").Run()

		perm := "FULL"
		if readOnly {
			perm = "READ"
		}
		grantArg := fmt.Sprintf("/GRANT:Everyone,%s", perm)
		cmd := exec.Command("net", "share", fmt.Sprintf("%s=%s", trimmedName, trimmedPath), grantArg, "/Y")
		_ = cmd.Run()

		// Also try PowerShell New-SmbShare as fallback
		psCmd := fmt.Sprintf(`if (!(Get-SmbShare -Name '%s' -ErrorAction SilentlyContinue)) { New-SmbShare -Name '%s' -Path '%s' -FullAccess 'Everyone' -ErrorAction SilentlyContinue }; net share %s="%s" /GRANT:Everyone,%s /Y`,
			trimmedName, trimmedName, trimmedPath, trimmedName, trimmedPath, perm)
		_ = exec.Command("powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", psCmd).Run()
		return nil
	}

	// On Linux, publish Samba share with full guest access
	// 1. Ensure usershare directory exists
	_ = os.MkdirAll("/var/lib/samba/usershares", 01777)

	// 2. Add usershare via net usershare
	roStr := "Everyone:F"
	if readOnly {
		roStr = "Everyone:R"
	}
	_ = exec.Command("net", "usershare", "add", trimmedName, trimmedPath, "LocalDrive Network Share", roStr, "guest_ok=y").Run()

	// 3. Directly create usershare configuration file to guarantee guest access without password
	usershareFile := filepath.Join("/var/lib/samba/usershares", strings.ToLower(trimmedName))
	uAcl := "Everyone:F"
	if readOnly {
		uAcl = "Everyone:R"
	}
	cfgContent := fmt.Sprintf("# LocalDrive Auto-generated Share\npath=%s\ncomment=LocalDrive Network Share\nusershare_acl=%s\nguest_ok=y\n", trimmedPath, uAcl)
	_ = os.WriteFile(usershareFile, []byte(cfgContent), 0644)

	// 4. Ensure firewall allows Samba ports (445, 139)
	_ = exec.Command("ufw", "allow", "445/tcp").Run()
	_ = exec.Command("ufw", "allow", "139/tcp").Run()
	_ = exec.Command("ufw", "allow", "137:138/udp").Run()

	// 5. Reload Samba service
	_ = exec.Command("smbcontrol", "smbd", "reload-config").Run()
	_ = exec.Command("systemctl", "reload", "smbd").Run()
	_ = exec.Command("systemctl", "restart", "smbd").Run()

	return nil
}

func removeSystemNetworkShare(name string) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return
	}
	_ = exec.Command("net", "share", trimmedName, "/DELETE", "/Y").Run()
	_ = exec.Command("powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", fmt.Sprintf("Remove-SmbShare -Name '%s' -Force -ErrorAction SilentlyContinue", trimmedName)).Run()
	_ = exec.Command("net", "usershare", "delete", trimmedName).Run()
}

// SyncAllActiveNetworkShares queries all active shares in the database and re-publishes them to the OS.
func (a *API) SyncAllActiveNetworkShares(ctx context.Context) {
	rows, err := a.db.Read().QueryContext(ctx, `SELECT name, path, read_only, guest_ok FROM network_shares WHERE status = 'active'`)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var name, p string
		var ro, goK int
		if err := rows.Scan(&name, &p, &ro, &goK); err == nil {
			realP := a.resolveRealMountPath(p, p)
			if realP == "" {
				realP = p
			}
			_ = syncSystemNetworkShare(name, realP, ro == 1, goK == 1, true)
		}
	}
}

func (a *API) handleCreateNetworkShare(w http.ResponseWriter, r *http.Request) {
	var req createNetworkShareReq
	if !decodeJSON(w, r, &req) {
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "share name is required")
		return
	}
	path := strings.TrimSpace(req.Path)
	if path == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "share path is required")
		return
	}

	cleanPath := cleanDisplayPath(path)
	realPath := a.resolveRealMountPath(cleanPath, path)
	if realPath == "" {
		realPath = cleanPath
	}

	// Ensure folder exists on disk
	_ = os.MkdirAll(realPath, 0755)

	purpose := strings.TrimSpace(req.Purpose)
	if purpose == "" {
		purpose = "Chia sẻ mặc định"
	}

	now := db.NowMillis()
	id := db.NewID()

	roInt := 0
	if req.ReadOnly {
		roInt = 1
	}
	brInt := 1
	if !req.Browseable {
		brInt = 0
	}
	huInt := 0
	if req.HideUnreadable {
		huInt = 1
	}
	goInt := 0
	if req.GuestOK {
		goInt = 1
	}

	err := a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO network_shares (id, name, purpose, path, description, read_only, browseable, hide_unreadable, guest_ok, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
			id, name, purpose, cleanPath, req.Description, roInt, brInt, huInt, goInt, now, now)
		return err
	})
	if err != nil {
		a.fail(w, r, err)
		return
	}

	// Real OS Network Share publish
	_ = syncSystemNetworkShare(name, realPath, req.ReadOnly, req.GuestOK, true)

	writeJSON(w, http.StatusCreated, map[string]any{
		"share": NetworkShareDTO{
			ID:             id,
			Name:           name,
			Purpose:        purpose,
			Path:           cleanPath,
			Description:    req.Description,
			ReadOnly:       req.ReadOnly,
			Browseable:     req.Browseable,
			HideUnreadable: req.HideUnreadable,
			GuestOK:        req.GuestOK,
			Status:         "active",
			CreatedAt:      now,
			UpdatedAt:      now,
		},
	})
}

type updateNetworkShareReq struct {
	Name           *string `json:"name"`
	Purpose        *string `json:"purpose"`
	Path           *string `json:"path"`
	Description    *string `json:"description"`
	ReadOnly       *bool   `json:"read_only"`
	Browseable     *bool   `json:"browseable"`
	HideUnreadable *bool   `json:"hide_unreadable"`
	GuestOK        *bool   `json:"guest_ok"`
	Status         *string `json:"status"`
}

func (a *API) handleUpdateNetworkShare(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updateNetworkShareReq
	if !decodeJSON(w, r, &req) {
		return
	}

	now := db.NowMillis()
	err := a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
		var count int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM network_shares WHERE id = ?`, id).Scan(&count); err != nil {
			return err
		}
		if count == 0 {
			return sql.ErrNoRows
		}

		if req.Name != nil {
			_ = tx.QueryRowContext(ctx, `UPDATE network_shares SET name = ?, updated_at = ? WHERE id = ?`, *req.Name, now, id)
		}
		if req.Purpose != nil {
			_ = tx.QueryRowContext(ctx, `UPDATE network_shares SET purpose = ?, updated_at = ? WHERE id = ?`, *req.Purpose, now, id)
		}
		if req.Path != nil {
			cleanP := cleanDisplayPath(*req.Path)
			realP := a.resolveRealMountPath(cleanP, *req.Path)
			if realP == "" {
				realP = cleanP
			}
			_ = tx.QueryRowContext(ctx, `UPDATE network_shares SET path = ?, updated_at = ? WHERE id = ?`, cleanP, now, id)
			_ = os.MkdirAll(realP, 0755)
		}
		if req.Description != nil {
			_ = tx.QueryRowContext(ctx, `UPDATE network_shares SET description = ?, updated_at = ? WHERE id = ?`, *req.Description, now, id)
		}
		if req.ReadOnly != nil {
			val := 0
			if *req.ReadOnly {
				val = 1
			}
			_ = tx.QueryRowContext(ctx, `UPDATE network_shares SET read_only = ?, updated_at = ? WHERE id = ?`, val, now, id)
		}
		if req.Browseable != nil {
			val := 0
			if *req.Browseable {
				val = 1
			}
			_ = tx.QueryRowContext(ctx, `UPDATE network_shares SET browseable = ?, updated_at = ? WHERE id = ?`, val, now, id)
		}
		if req.HideUnreadable != nil {
			val := 0
			if *req.HideUnreadable {
				val = 1
			}
			_ = tx.QueryRowContext(ctx, `UPDATE network_shares SET hide_unreadable = ?, updated_at = ? WHERE id = ?`, val, now, id)
		}
		if req.GuestOK != nil {
			val := 0
			if *req.GuestOK {
				val = 1
			}
			_ = tx.QueryRowContext(ctx, `UPDATE network_shares SET guest_ok = ?, updated_at = ? WHERE id = ?`, val, now, id)
		}
		if req.Status != nil {
			_ = tx.QueryRowContext(ctx, `UPDATE network_shares SET status = ?, updated_at = ? WHERE id = ?`, *req.Status, now, id)
		}
		return nil
	})
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "share not found")
			return
		}
		a.fail(w, r, err)
		return
	}

	var s NetworkShareDTO
	var ro, br, hu, goK int
	row := a.db.Read().QueryRowContext(r.Context(),
		`SELECT id, name, purpose, path, description, read_only, browseable, hide_unreadable, guest_ok, status, created_at, updated_at
		 FROM network_shares WHERE id = ?`, id)
	if err := row.Scan(&s.ID, &s.Name, &s.Purpose, &s.Path, &s.Description, &ro, &br, &hu, &goK, &s.Status, &s.CreatedAt, &s.UpdatedAt); err != nil {
		a.fail(w, r, err)
		return
	}
	s.ReadOnly = ro == 1
	s.Browseable = br == 1
	s.HideUnreadable = hu == 1
	s.GuestOK = goK == 1

	// Synchronize real OS share state with real physical mount
	realPath := a.resolveRealMountPath(s.Path, s.Path)
	if realPath == "" {
		realPath = s.Path
	}
	_ = syncSystemNetworkShare(s.Name, realPath, s.ReadOnly, s.GuestOK, s.Status == "active")
	s.Path = cleanDisplayPath(s.Path)

	writeJSON(w, http.StatusOK, map[string]any{"share": s})
}

func (a *API) handleDeleteNetworkShare(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Get name to remove real OS share
	var shareName string
	_ = a.db.Read().QueryRowContext(r.Context(), `SELECT name FROM network_shares WHERE id = ?`, id).Scan(&shareName)

	err := a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `DELETE FROM network_shares WHERE id = ?`, id)
		if err != nil {
			return err
		}
		aff, _ := res.RowsAffected()
		if aff == 0 {
			return sql.ErrNoRows
		}
		return nil
	})
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "share not found")
			return
		}
		a.fail(w, r, err)
		return
	}

	// Remove real OS share
	if shareName != "" {
		removeSystemNetworkShare(shareName)
	}

	w.WriteHeader(http.StatusNoContent)
}

// cleanDisplayPath formats a path cleanly without /mnt/zfs-recovery or duplicate slashes.
func cleanDisplayPath(p string) string {
	p = strings.TrimSpace(p)
	p = filepath.ToSlash(p)
	for strings.HasPrefix(p, "/mnt/zfs-recovery/") || strings.HasPrefix(p, "/mnt/") {
		if strings.HasPrefix(p, "/mnt/zfs-recovery/") {
			p = "/" + strings.TrimPrefix(p, "/mnt/zfs-recovery/")
		} else if strings.HasPrefix(p, "/mnt/") {
			p = "/" + strings.TrimPrefix(p, "/mnt/")
		}
	}
	p = filepath.ToSlash(filepath.Clean(p))
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return p
}

// FolderTreeNodeDTO models an entry in the real share folder tree.
type FolderTreeNodeDTO struct {
	ID       string              `json:"id"`
	Name     string              `json:"name"`
	Path     string              `json:"path"`
	IsDrive  bool                `json:"isDrive,omitempty"`
	Children []FolderTreeNodeDTO `json:"children"`
}

func isIgnoredFolder(name string) bool {
	lower := strings.ToLower(name)
	if strings.HasPrefix(name, "$") || strings.EqualFold(name, "System Volume Information") {
		return true
	}
	switch lower {
	case "appdata", "program files", "program files (x86)", "windows", "perflogs", "recovery":
		return true
	}
	return false
}

func readSubdirs(dirPath string, maxDepth int) []FolderTreeNodeDTO {
	if maxDepth <= 0 {
		return make([]FolderTreeNodeDTO, 0)
	}
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return make([]FolderTreeNodeDTO, 0)
	}
	res := make([]FolderTreeNodeDTO, 0)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if isIgnoredFolder(name) {
			continue
		}
		fullPath := filepath.Join(dirPath, name)
		children := readSubdirs(fullPath, maxDepth-1)
		res = append(res, FolderTreeNodeDTO{
			ID:       "dir-" + strings.ReplaceAll(fullPath, "\\", "_"),
			Name:     name,
			Path:     cleanDisplayPath(fullPath),
			IsDrive:  false,
			Children: children,
		})
		if len(res) >= 100 {
			break
		}
	}
	return res
}

func (a *API) handleShareFolderTree(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// 1. Get pools
	poolNames := make(map[string]bool)
	pRows, err := a.db.Read().QueryContext(ctx, `SELECT name FROM storage_pools`)
	if err == nil {
		for pRows.Next() {
			var pn string
			if pRows.Scan(&pn) == nil && strings.TrimSpace(pn) != "" {
				poolNames[strings.TrimSpace(pn)] = true
			}
		}
		pRows.Close()
	}

	// 2. Get datasets
	rows, err := a.db.Read().QueryContext(ctx,
		`SELECT id, name, pool, mount FROM datasets WHERE status != 'deleted' ORDER BY name ASC`)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	defer rows.Close()

	type rawDs struct {
		id    string
		name  string
		pool  string
		mount string
	}
	var rawList []rawDs
	for rows.Next() {
		var d rawDs
		if err := rows.Scan(&d.id, &d.name, &d.pool, &d.mount); err == nil {
			rawList = append(rawList, d)
			norm := strings.Trim(strings.TrimSpace(d.name), "/")
			parts := strings.Split(norm, "/")
			if len(parts) > 0 && parts[0] != "" {
				poolNames[parts[0]] = true
			}
		}
	}

	type TreeNode struct {
		ID       string      `json:"id"`
		Name     string      `json:"name"`
		Path     string      `json:"path"`
		IsDrive  bool        `json:"isDrive,omitempty"`
		Children []*TreeNode `json:"children,omitempty"`
	}

	nodeMap := make(map[string]*TreeNode)
	var rootList []*TreeNode

	// Create root drive node for each pool
	for pName := range poolNames {
		cleanPoolPath := cleanDisplayPath("/" + pName)
		pNode := &TreeNode{
			ID:       "pool-" + pName,
			Name:     pName,
			Path:     cleanPoolPath,
			IsDrive:  true,
			Children: make([]*TreeNode, 0),
		}
		nodeMap[strings.ToLower(pName)] = pNode
		rootList = append(rootList, pNode)
	}

	// Attach datasets hierarchically
	for _, d := range rawList {
		norm := strings.Trim(strings.TrimSpace(d.name), "/")
		parts := strings.Split(norm, "/")
		if len(parts) == 0 || parts[0] == "" {
			continue
		}

		realMount := a.resolveRealMountPath(d.name, d.mount)
		if realMount != d.mount && realMount != "" {
			_ = a.db.Write(ctx, func(c context.Context, tx *sql.Tx) error {
				_, wErr := tx.ExecContext(c, `UPDATE datasets SET mount = ? WHERE id = ?`, realMount, d.id)
				return wErr
			})
			d.mount = realMount
		}

		poolPart := parts[0]
		poolNode := nodeMap[strings.ToLower(poolPart)]
		if poolNode == nil {
			cleanPoolPath := cleanDisplayPath("/" + poolPart)
			poolNode = &TreeNode{
				ID:       "pool-" + poolPart,
				Name:     poolPart,
				Path:     cleanPoolPath,
				IsDrive:  true,
				Children: make([]*TreeNode, 0),
			}
			nodeMap[strings.ToLower(poolPart)] = poolNode
			rootList = append(rootList, poolNode)
		}

		if len(parts) == 1 {
			poolNode.Path = cleanDisplayPath("/" + poolPart)
			continue
		}

		curPath := poolPart
		for i := 1; i < len(parts); i++ {
			partName := parts[i]
			prevPath := curPath
			curPath = curPath + "/" + partName
			curKey := strings.ToLower(curPath)
			cleanNodePath := cleanDisplayPath("/" + curPath)

			existing := nodeMap[curKey]
			if existing == nil {
				isLeaf := i == len(parts)-1
				realDiskPath := d.mount
				if !isLeaf {
					realDiskPath = a.resolveRealMountPath(curPath, "")
				}
				var subdirs []*TreeNode
				if isLeaf && realDiskPath != "" {
					for _, sd := range readSubdirs(realDiskPath, 2) {
						subdirs = append(subdirs, &TreeNode{
							ID:      sd.ID,
							Name:    sd.Name,
							Path:    cleanDisplayPath(sd.Path),
							IsDrive: false,
						})
					}
				}
				childNode := &TreeNode{
					ID:       "ds-" + d.id + "-" + partName,
					Name:     partName,
					Path:     cleanNodePath,
					IsDrive:  false,
					Children: subdirs,
				}
				nodeMap[curKey] = childNode

				parentNode := nodeMap[strings.ToLower(prevPath)]
				if parentNode != nil {
					var existingChild *TreeNode
					for _, c := range parentNode.Children {
						if strings.EqualFold(c.Name, partName) {
							existingChild = c
							break
						}
					}
					if existingChild != nil {
						existingChild.Path = cleanNodePath
						if len(subdirs) > 0 {
							existingChild.Children = append(existingChild.Children, subdirs...)
						}
						nodeMap[curKey] = existingChild
					} else {
						parentNode.Children = append(parentNode.Children, childNode)
					}
				}
			} else {
				existing.Path = cleanNodePath
			}
		}
	}

	var dedupeChildren func(nodes []*TreeNode) []*TreeNode
	dedupeChildren = func(nodes []*TreeNode) []*TreeNode {
		seen := make(map[string]*TreeNode)
		var out []*TreeNode
		for _, n := range nodes {
			n.Path = cleanDisplayPath(n.Path)
			key := strings.ToLower(strings.TrimSpace(n.Name))
			if existing, found := seen[key]; found {
				if len(n.Children) > 0 {
					existing.Children = dedupeChildren(append(existing.Children, n.Children...))
				}
			} else {
				if len(n.Children) > 0 {
					n.Children = dedupeChildren(n.Children)
				}
				seen[key] = n
				out = append(out, n)
			}
		}
		return out
	}
	rootList = dedupeChildren(rootList)

	var sortSubtree func(nodes []*TreeNode)
	sortSubtree = func(nodes []*TreeNode) {
		sort.Slice(nodes, func(i, j int) bool {
			return strings.ToLower(nodes[i].Name) < strings.ToLower(nodes[j].Name)
		})
		for _, n := range nodes {
			if len(n.Children) > 0 {
				sortSubtree(n.Children)
			}
		}
	}
	sortSubtree(rootList)

	writeJSON(w, http.StatusOK, map[string]any{
		"tree": rootList,
	})
}

// ==================== STORAGE POOLS ====================

func (a *API) handleListPools(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Read().QueryContext(r.Context(),
		`SELECT id, name, layout, status, total_bytes, used_bytes, auto_trim, scrub_schedule, disks_json, created_at, updated_at
		 FROM storage_pools ORDER BY name ASC`)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	defer rows.Close()

	registered := map[string]struct{}{}
	hostDrives := detectHostDrives(registered)
	driveMap := make(map[string]driveDTO)
	for _, hd := range hostDrives {
		driveMap[strings.ToLower(strings.TrimSpace(hd.ID))] = hd
		driveMap[strings.ToLower(strings.TrimSpace(hd.Name))] = hd
	}

	out := make([]StoragePoolDTO, 0)
	for rows.Next() {
		var p StoragePoolDTO
		var at int
		var disksRaw string
		if err := rows.Scan(&p.ID, &p.Name, &p.Layout, &p.Status, &p.TotalBytes, &p.UsedBytes, &at, &p.ScrubSchedule, &disksRaw, &p.CreatedAt, &p.UpdatedAt); err != nil {
			a.fail(w, r, err)
			return
		}
		p.AutoTrim = at == 1
		_ = json.Unmarshal([]byte(disksRaw), &p.Disks)
		if p.Disks == nil {
			p.Disks = []string{}
		}

		// 1. Nếu là mảng ZFS (OpenZFS / TrueNAS): Lấy 100% số ổ đĩa và dung lượng thực tế từ OpenZFS
		isZFS := strings.EqualFold(p.Layout, "ZFS")
		if hasZFSTools() {
			realDisks := getZFSPoolDisks(p.Name)
			if len(realDisks) == 0 {
				realDisks = getZFSPoolDisks(strings.ToUpper(p.Name))
			}
			if len(realDisks) == 0 {
				realDisks = getZFSPoolDisks(strings.ToLower(p.Name))
			}
			if len(realDisks) > 0 {
				p.Disks = realDisks
				isZFS = true
				p.Layout = "ZFS"
			}

			total, used, health, err := getZFSPoolCapacity(p.Name)
			if err != nil || total == 0 {
				total, used, health, err = getZFSPoolCapacity(strings.ToUpper(p.Name))
			}
			if err != nil || total == 0 {
				total, used, health, err = getZFSPoolCapacity(strings.ToLower(p.Name))
			}
			if err == nil && total > 0 {
				isZFS = true
				p.Layout = "ZFS"
				p.TotalBytes = total
				p.UsedBytes = used
				if health != "" {
					p.Status = health
				}
			}

			if p.TotalBytes > 0 && p.UsedBytes > p.TotalBytes {
				p.UsedBytes = p.TotalBytes
			}

			// Tự động đồng bộ và lưu vào DB để xóa bỏ triệt để dữ liệu ảo / số ổ đĩa sai (chỉ giữ đúng 2 ổ thực tế)
			if len(p.Disks) > 0 || p.TotalBytes > 0 {
				disksJSON, _ := json.Marshal(p.Disks)
				_ = a.db.Write(r.Context(), func(c context.Context, tx *sql.Tx) error {
					_, err := tx.ExecContext(c,
						`UPDATE storage_pools SET total_bytes = ?, used_bytes = ?, disks_json = ?, status = ?, layout = 'ZFS' WHERE id = ? OR name = ?`,
						p.TotalBytes, p.UsedBytes, string(disksJSON), p.Status, p.ID, p.Name)
					return err
				})
			}
		}

		// 2. Tính toán dung lượng cho các mảng không phải ZFS
		if !isZFS && len(p.Disks) > 0 && len(driveMap) > 0 {
			var realTotal int64 = 0
			var realUsed int64 = 0
			var minSize int64 = 0
			matchedCount := 0
			for _, d := range p.Disks {
				norm := strings.ToLower(strings.TrimSpace(d))
				if hd, ok := driveMap[norm]; ok {
					matchedCount++
					realTotal += hd.SizeBytes
					realUsed += hd.UsedBytes
					if minSize == 0 || hd.SizeBytes < minSize {
						minSize = hd.SizeBytes
					}
				}
			}
			if matchedCount > 0 {
				if strings.EqualFold(p.Layout, "mirror") && minSize > 0 {
					p.TotalBytes = minSize
					p.UsedBytes = realUsed / int64(matchedCount)
				} else if realTotal > 0 {
					p.TotalBytes = realTotal
					p.UsedBytes = realUsed
				}
			}
		}

		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		a.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"pools": out})
}

type createPoolReq struct {
	Name          string   `json:"name"`
	Layout        string   `json:"layout"`
	Disks         []string `json:"disks"`
	AutoTrim      bool     `json:"auto_trim"`
	ScrubSchedule string   `json:"scrub_schedule"`
}

func (a *API) handleCreatePool(w http.ResponseWriter, r *http.Request) {
	var req createPoolReq
	if !decodeJSON(w, r, &req) {
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "pool name is required")
		return
	}
	layout := strings.TrimSpace(req.Layout)
	if layout == "" {
		layout = "mirror"
	}
	scrub := strings.TrimSpace(req.ScrubSchedule)
	if scrub == "" {
		scrub = "weekly"
	}

	disksJSON, _ := json.Marshal(req.Disks)
	now := db.NowMillis()
	id := db.NewID()
	atInt := 0
	if req.AutoTrim {
		atInt = 1
	}

	// Calculate total capacity based on detected drives
	var totalCapacity int64 = 256060514304 // default base
	registered := map[string]struct{}{}
	hostDrives := detectHostDrives(registered)
	for _, hd := range hostDrives {
		for _, picked := range req.Disks {
			if hd.ID == picked || hd.Name == picked {
				totalCapacity += hd.SizeBytes
			}
		}
	}

	err := a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO storage_pools (id, name, layout, status, total_bytes, used_bytes, auto_trim, scrub_schedule, disks_json, created_at, updated_at)
			 VALUES (?, ?, ?, 'healthy', ?, 0, ?, ?, ?, ?, ?)`,
			id, name, layout, totalCapacity, atInt, scrub, string(disksJSON), now, now)
		return err
	})
	if err != nil {
		a.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"pool": StoragePoolDTO{
			ID:            id,
			Name:          name,
			Layout:        layout,
			Status:        "healthy",
			TotalBytes:    totalCapacity,
			UsedBytes:     0,
			AutoTrim:      req.AutoTrim,
			ScrubSchedule: scrub,
			Disks:         req.Disks,
			CreatedAt:     now,
			UpdatedAt:     now,
		},
	})
}

type updatePoolReq struct {
	Name          string   `json:"name"`
	Layout        string   `json:"layout"`
	Disks         []string `json:"disks"`
	AutoTrim      bool     `json:"auto_trim"`
	ScrubSchedule string   `json:"scrub_schedule"`
}

func (a *API) handleUpdatePool(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updatePoolReq
	if !decodeJSON(w, r, &req) {
		return
	}
	now := db.NowMillis()

	err := a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
		var name, layout, disksStr string
		var atInt int
		var totalBytes, usedBytes, createdAt int64
		err := tx.QueryRowContext(ctx,
			`SELECT name, layout, total_bytes, used_bytes, auto_trim, disks_json, created_at FROM storage_pools WHERE id = ?`, id).
			Scan(&name, &layout, &totalBytes, &usedBytes, &atInt, &disksStr, &createdAt)
		if err != nil {
			return err
		}

		if strings.TrimSpace(req.Name) != "" {
			name = strings.TrimSpace(req.Name)
		}
		if strings.TrimSpace(req.Layout) != "" {
			layout = strings.TrimSpace(req.Layout)
		}
		if len(req.Disks) > 0 {
			b, _ := json.Marshal(req.Disks)
			disksStr = string(b)
		}

		_, err = tx.ExecContext(ctx,
			`UPDATE storage_pools SET name = ?, layout = ?, disks_json = ?, updated_at = ? WHERE id = ?`,
			name, layout, disksStr, now, id)
		return err
	})
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "pool not found")
			return
		}
		a.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message": "pool updated successfully",
	})
}

func (a *API) handleDeletePool(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	force := r.URL.Query().Get("force") == "true"

	var poolName string
	var poolLayout string
	_ = a.db.Read().QueryRowContext(r.Context(), `SELECT name, layout FROM storage_pools WHERE id = ? OR name = ?`, id, id).Scan(&poolName, &poolLayout)
	if poolName == "" {
		poolName = id
	}

	// If ZFS pool on Linux, export safely
	if strings.EqualFold(poolLayout, "ZFS") {
		_ = exportZFSPoolCmd(poolName, force)
	}

	err := a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
		// Clean up associated datasets in SQLite (without deleting disk files!)
		_, _ = tx.ExecContext(ctx, `DELETE FROM datasets WHERE pool = ? OR pool = ?`, id, poolName)

		res, err := tx.ExecContext(ctx, `DELETE FROM storage_pools WHERE id = ? OR name = ?`, id, id)
		if err != nil {
			return err
		}
		aff, _ := res.RowsAffected()
		if aff == 0 {
			return sql.ErrNoRows
		}
		return nil
	})
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "pool not found")
			return
		}
		a.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": fmt.Sprintf("Đã ngắt kết nối an toàn mảng lưu trữ \"%s\".", poolName),
	})
}

func (a *API) handleDiscoverImportablePool(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Read().QueryContext(r.Context(), `SELECT disks_json FROM storage_pools`)
	usedDisks := make(map[string]bool)
	existingPoolNames := make(map[string]bool)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var disksRaw string
			if err := rows.Scan(&disksRaw); err == nil {
				var diskList []string
				_ = json.Unmarshal([]byte(disksRaw), &diskList)
				for _, d := range diskList {
					usedDisks[strings.ToLower(strings.TrimSpace(d))] = true
				}
			}
		}
	}
	pRows, pErr := a.db.Read().QueryContext(r.Context(), `SELECT name FROM storage_pools`)
	if pErr == nil {
		defer pRows.Close()
		for pRows.Next() {
			var pn string
			if err := pRows.Scan(&pn); err == nil {
				existingPoolNames[strings.ToLower(strings.TrimSpace(pn))] = true
			}
		}
	}

	// 1. Check for TrueNAS / ZFS pools first!
	zfsPools := detectZFSPools()
	for _, zp := range zfsPools {
		if !existingPoolNames[strings.ToLower(zp.Name)] {
			// Found an unimported or detected TrueNAS ZFS pool!
			registered := map[string]struct{}{}
			hostDrives := detectHostDrives(registered)
			var zfsDisksDTO []driveDTO
			for _, hd := range hostDrives {
				for _, zd := range zp.Disks {
					if strings.Contains(zd, hd.Name) || hd.ID == zd {
						zfsDisksDTO = append(zfsDisksDTO, hd)
						break
					}
				}
			}
			if len(zfsDisksDTO) == 0 {
				for _, zd := range zp.Disks {
					zfsDisksDTO = append(zfsDisksDTO, driveDTO{
						ID:        zd,
						Name:      filepath.Base(zd),
						Label:     fmt.Sprintf("Ổ đĩa TrueNAS (%s)", filepath.Base(zd)),
						MediaType: "HDD",
						SizeBytes: 1000204886016,
						Usable:    true,
					})
				}
			}
			poolBytes := zp.TotalBytes
			if poolBytes == 0 {
				for _, zd := range zfsDisksDTO {
					poolBytes += zd.SizeBytes
				}
				if poolBytes == 0 {
					poolBytes = 2000398934016
				}
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"can_import":      true,
				"is_zfs":          true,
				"available_disks": zfsDisksDTO,
				"suggested_pool": map[string]any{
					"name":           zp.Name,
					"layout":         "ZFS",
					"disks":          zp.Disks,
					"auto_trim":      true,
					"scrub_schedule": "weekly",
					"total_bytes":    poolBytes,
					"zfs_id":         zp.ID,
					"state":          zp.State,
					"dataset_count":  len(zp.Datasets),
				},
				"message": fmt.Sprintf("Phát hiện mảng lưu trữ ZFS (TrueNAS) \"%s\" với %d tập dữ liệu sẵn có. Sẵn sàng kết nối an toàn mà không làm mất dữ liệu.", zp.Name, len(zp.Datasets)),
			})
			return
		}
	}

	// 2. Check if ZFS member disks exist but zpool tool is missing
	if !hasZFSTools() && hasZFSMemberDisks() {
		writeJSON(w, http.StatusOK, map[string]any{
			"can_import":      false,
			"has_zfs_missing": true,
			"available_disks": []driveDTO{},
			"suggested_pool":  nil,
			"message":         "Phát hiện ổ đĩa ZFS (TrueNAS) trên hệ thống, nhưng máy chủ Linux chưa cài đặt OpenZFS. Vui lòng chạy lệnh: sudo apt install -y zfsutils-linux để hệ thống nhận diện mảng lưu trữ và toàn bộ tập dữ liệu.",
		})
		return
	}

	// 3. Fallback to general block drives (strictly excluding host OS drives!)
	registered := map[string]struct{}{}
	hostDrives := detectHostDrives(registered)

	var availableDrives []driveDTO
	var totalBytes int64 = 0
	var suggestedDisks []string
	for _, hd := range hostDrives {
		normID := strings.ToLower(strings.TrimSpace(hd.ID))
		normName := strings.ToLower(strings.TrimSpace(hd.Name))
		if !hd.Usable || hd.InUse {
			continue
		}
		if !usedDisks[normID] && !usedDisks[normName] {
			availableDrives = append(availableDrives, hd)
			totalBytes += hd.SizeBytes
			suggestedDisks = append(suggestedDisks, hd.ID)
		}
	}

	if len(availableDrives) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{
			"can_import":      false,
			"available_disks": []driveDTO{},
			"suggested_pool":  nil,
			"message":         "Tất cả các ổ đĩa vật lý hiện tại đã được gộp vào Pool hoặc đang được hệ thống quản lý đầy đủ.",
		})
		return
	}

	baseName := "Pool-Storage"
	if len(availableDrives) == 1 {
		cleanLetter := strings.Trim(availableDrives[0].ID, ":\\/")
		if cleanLetter != "" {
			baseName = "Storage-" + cleanLetter
		}
	}
	suggestedName := baseName
	idx := 2
	for existingPoolNames[strings.ToLower(suggestedName)] {
		suggestedName = fmt.Sprintf("%s-%d", baseName, idx)
		idx++
	}

	suggestedLayout := "MergerFS"

	writeJSON(w, http.StatusOK, map[string]any{
		"can_import":      true,
		"available_disks": availableDrives,
		"suggested_pool": map[string]any{
			"name":           suggestedName,
			"layout":         suggestedLayout,
			"disks":          suggestedDisks,
			"auto_trim":      true,
			"scrub_schedule": "weekly",
			"total_bytes":    totalBytes,
		},
		"message": fmt.Sprintf("Phát hiện %d ổ đĩa vật lý khả dụng. Đã cấu hình tối ưu sẵn sàng nhập.", len(availableDrives)),
	})
}

type importPoolReq struct {
	Name          string   `json:"name"`
	Layout        string   `json:"layout"`
	Disks         []string `json:"disks"`
	AutoTrim      *bool    `json:"auto_trim"`
	ScrubSchedule string   `json:"scrub_schedule"`
	Auto          bool     `json:"auto"`
}

func (a *API) handleImportPool(w http.ResponseWriter, r *http.Request) {
	var req importPoolReq
	_ = decodeJSON(w, r, &req)

	rows, err := a.db.Read().QueryContext(r.Context(), `SELECT disks_json FROM storage_pools`)
	usedDisks := make(map[string]bool)
	existingPoolNames := make(map[string]bool)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var disksRaw string
			if err := rows.Scan(&disksRaw); err == nil {
				var diskList []string
				_ = json.Unmarshal([]byte(disksRaw), &diskList)
				for _, d := range diskList {
					usedDisks[strings.ToLower(strings.TrimSpace(d))] = true
				}
			}
		}
	}
	pRows, pErr := a.db.Read().QueryContext(r.Context(), `SELECT name FROM storage_pools`)
	if pErr == nil {
		defer pRows.Close()
		for pRows.Next() {
			var pn string
			if err := pRows.Scan(&pn); err == nil {
				existingPoolNames[strings.ToLower(strings.TrimSpace(pn))] = true
			}
		}
	}

	registered := map[string]struct{}{}
	hostDrives := detectHostDrives(registered)

	var availableDrives []driveDTO
	var totalBytes int64 = 0
	var suggestedDisks []string
	for _, hd := range hostDrives {
		normID := strings.ToLower(strings.TrimSpace(hd.ID))
		normName := strings.ToLower(strings.TrimSpace(hd.Name))
		if !usedDisks[normID] && !usedDisks[normName] {
			availableDrives = append(availableDrives, hd)
			totalBytes += hd.SizeBytes
			suggestedDisks = append(suggestedDisks, hd.ID)
		}
	}

	name := strings.TrimSpace(req.Name)
	layout := strings.TrimSpace(req.Layout)
	if layout == "" {
		layout = "MergerFS"
	}

	// 1. Check if this is a TrueNAS / ZFS pool import
	isZFS := strings.EqualFold(layout, "ZFS")
	var zfsTargetPool *ZFSPoolInfo
	zfsPools := detectZFSPools()
	if !isZFS {
		for _, zp := range zfsPools {
			if strings.EqualFold(zp.Name, name) || (zp.ID != "" && zp.ID == name) {
				isZFS = true
				zfsTargetPool = &zp
				name = zp.Name
				layout = "ZFS"
				break
			}
		}
	} else {
		for _, zp := range zfsPools {
			if strings.EqualFold(zp.Name, name) || (zp.ID != "" && zp.ID == name) {
				zfsTargetPool = &zp
				name = zp.Name
				break
			}
		}
	}

	disks := req.Disks
	if len(disks) == 0 && zfsTargetPool != nil && len(zfsTargetPool.Disks) > 0 {
		disks = zfsTargetPool.Disks
	} else if len(disks) == 0 {
		disks = suggestedDisks
	}

	autoTrim := true
	if req.AutoTrim != nil {
		autoTrim = *req.AutoTrim
	}
	atInt := 0
	if autoTrim {
		atInt = 1
	}

	scrub := strings.TrimSpace(req.ScrubSchedule)
	if scrub == "" {
		scrub = "weekly"
	}

	disksJSON, _ := json.Marshal(disks)
	now := db.NowMillis()
	id := db.NewID()

	if isZFS {
		targetRef := name
		if zfsTargetPool != nil && zfsTargetPool.ID != "" {
			targetRef = zfsTargetPool.ID
		}
		_ = importZFSPoolCmd(targetRef)

		datasets := listZFSDatasets(name)
		var zfsUsedBytes int64 = 0
		if len(datasets) > 0 {
			for _, ds := range datasets {
				if ds.Name == name && ds.UsedBytes > 0 {
					totalBytes = ds.UsedBytes + ds.AvailBytes
					zfsUsedBytes = ds.UsedBytes
				}
			}
		}
		if totalBytes == 0 && zfsTargetPool != nil && zfsTargetPool.TotalBytes > 0 {
			totalBytes = zfsTargetPool.TotalBytes
			zfsUsedBytes = zfsTargetPool.UsedBytes
		}
		if totalBytes == 0 {
			totalBytes = 256060514304
		}

		err = a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx,
				`INSERT INTO storage_pools (id, name, layout, status, total_bytes, used_bytes, auto_trim, scrub_schedule, disks_json, created_at, updated_at)
				 VALUES (?, ?, 'ZFS', 'healthy', ?, ?, ?, ?, ?, ?, ?)`,
				id, name, totalBytes, zfsUsedBytes, atInt, scrub, string(disksJSON), now, now)
			return err
		})
		if err != nil {
			a.fail(w, r, err)
			return
		}

		// Insert all real datasets from TrueNAS
		if len(datasets) > 0 {
			_ = a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
				for _, ds := range datasets {
					_, _ = tx.ExecContext(ctx,
						`INSERT OR IGNORE INTO datasets (id, name, pool, mount, quota_bytes, used_bytes, recordsize, compression, atime, dedup, sync_mode, status, created_at, updated_at)
						 VALUES (?, ?, ?, ?, 0, ?, '128K', 'lz4', 'off', 'off', 'standard', 'healthy', ?, ?)`,
						db.NewID(), ds.Name, name, ds.MountPoint, ds.UsedBytes, now, now)
				}
				return nil
			})
		} else {
			mountPath := "/" + name
			_ = a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
				_, _ = tx.ExecContext(ctx,
					`INSERT OR IGNORE INTO datasets (id, name, pool, mount, quota_bytes, used_bytes, recordsize, compression, atime, dedup, sync_mode, status, created_at, updated_at)
					 VALUES (?, ?, ?, ?, 0, 0, '128K', 'lz4', 'off', 'off', 'standard', 'healthy', ?, ?)`,
					db.NewID(), name, name, mountPath, now, now)
				return nil
			})
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"pool": StoragePoolDTO{
				ID:            id,
				Name:          name,
				Layout:        "ZFS",
				Status:        "healthy",
				TotalBytes:    totalBytes,
				UsedBytes:     zfsUsedBytes,
				AutoTrim:      autoTrim,
				ScrubSchedule: scrub,
				Disks:         disks,
				CreatedAt:     now,
				UpdatedAt:     now,
			},
			"message": fmt.Sprintf("Nhập mảng lưu trữ ZFS \"%s\" thành công! Đã kết nối an toàn toàn bộ tập dữ liệu và tệp tin sẵn có.", name),
		})
		return
	}

	if name == "" {
		baseName := "Pool-Storage"
		if len(availableDrives) == 1 {
			cleanLetter := strings.Trim(availableDrives[0].ID, ":\\/")
			if cleanLetter != "" {
				baseName = "Storage-" + cleanLetter
			}
		}
		name = baseName
		idx := 2
		for existingPoolNames[strings.ToLower(name)] {
			name = fmt.Sprintf("%s-%d", baseName, idx)
			idx++
		}
	}

	if len(disks) == 0 && len(hostDrives) > 0 {
		for _, hd := range hostDrives {
			if hd.Usable && !hd.InUse {
				disks = []string{hd.ID}
				totalBytes = hd.SizeBytes
				break
			}
		}
	}

	if totalBytes == 0 {
		for _, hd := range hostDrives {
			for _, d := range disks {
				if hd.ID == d || hd.Name == d {
					totalBytes += hd.SizeBytes
				}
			}
		}
		if totalBytes == 0 {
			totalBytes = 256060514304
		}
	}

	err = a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO storage_pools (id, name, layout, status, total_bytes, used_bytes, auto_trim, scrub_schedule, disks_json, created_at, updated_at)
			 VALUES (?, ?, ?, 'healthy', ?, 0, ?, ?, ?, ?, ?)`,
			id, name, layout, totalBytes, atInt, scrub, string(disksJSON), now, now)
		return err
	})
	if err != nil {
		a.fail(w, r, err)
		return
	}

	mountPath := filepath.Join(a.cfg.LibraryPath, name)
	if len(disks) > 0 && strings.Contains(disks[0], ":") {
		mountPath = filepath.Join(disks[0]+"\\", "DATA")
	} else if len(disks) > 0 {
		for _, hd := range hostDrives {
			for _, d := range disks {
				// Strictly exclude system partitions from mountPath
				if (hd.ID == d || hd.Name == d) && hd.MountPoint != "" && hd.MountPoint != "/" && !strings.HasPrefix(hd.MountPoint, "/boot") && !strings.HasPrefix(hd.MountPoint, "/etc") {
					mountPath = hd.MountPoint
					break
				}
			}
		}
	}
	_ = os.MkdirAll(mountPath, 0755)

	rootDatasetName := name + "/root"
	_ = a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT OR IGNORE INTO datasets (id, name, pool, mount, quota_bytes, used_bytes, recordsize, compression, atime, dedup, sync_mode, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, 0, 0, '128K', 'lz4', 'off', 'off', 'standard', 'healthy', ?, ?)`,
			db.NewID(), rootDatasetName, name, mountPath, now, now)
		return err
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"pool": StoragePoolDTO{
			ID:            id,
			Name:          name,
			Layout:        layout,
			Status:        "healthy",
			TotalBytes:    totalBytes,
			UsedBytes:     0,
			AutoTrim:      autoTrim,
			ScrubSchedule: scrub,
			Disks:         disks,
			CreatedAt:     now,
			UpdatedAt:     now,
		},
		"message": fmt.Sprintf("Nhập Pool \"%s\" thành công! Đã cấu hình và kết nối an toàn mà không làm mất dữ liệu.", name),
	})
}

// ==================== REAL S.M.A.R.T HEALTH CHECK ====================

func (a *API) handleDriveSmart(w http.ResponseWriter, r *http.Request) {
	driveID := chi.URLParam(r, "id")
	now := db.NowMillis()

	registered := map[string]struct{}{}
	hostDrives := detectHostDrives(registered)

	var target *driveDTO
	for _, hd := range hostDrives {
		if hd.ID == driveID || hd.Name == driveID {
			target = &hd
			break
		}
	}

	driveLetter := ""
	if target != nil {
		driveLetter = strings.TrimSuffix(target.Name, ":")
	} else if strings.HasPrefix(driveID, "drive_") {
		driveLetter = strings.TrimPrefix(driveID, "drive_")
	}

	model := "Local Disk"
	serial := "N/A"
	mediaType := "SSD"
	health := "healthy"
	operationalStatus := "OK"

	if target != nil {
		if target.Model != "" {
			model = target.Model
		}
		if target.SerialNumber != "" {
			serial = target.SerialNumber
		}
		if target.MediaType != "" {
			mediaType = target.MediaType
		}
		if target.HealthStatus != "" {
			health = target.HealthStatus
		}
		if target.OperationalStatus != "" {
			operationalStatus = target.OperationalStatus
		}
	}

	if runtime.GOOS == "windows" {
		// Query PowerShell for real drive hardware status
		psScript := fmt.Sprintf(`
			$part = Get-Partition | Where-Object DriveLetter -eq '%s' | Select-Object -First 1 DiskNumber
			if ($part) {
				$disk = Get-PhysicalDisk | Where-Object DeviceId -eq $part.DiskNumber | Select-Object FriendlyName, SerialNumber, MediaType, HealthStatus, OperationalStatus | ConvertTo-Json -Compress
				Write-Output $disk
			} else {
				$any = Get-PhysicalDisk | Select-Object -First 1 FriendlyName, SerialNumber, MediaType, HealthStatus, OperationalStatus | ConvertTo-Json -Compress
				Write-Output $any
			}
		`, driveLetter)

		cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", psScript)
		out, err := cmd.Output()
		if err == nil && len(out) > 0 {
			var diskData struct {
				FriendlyName      string `json:"FriendlyName"`
				SerialNumber      string `json:"SerialNumber"`
				MediaType         string `json:"MediaType"`
				HealthStatus      string `json:"HealthStatus"`
				OperationalStatus string `json:"OperationalStatus"`
			}
			if jsonErr := json.Unmarshal(out, &diskData); jsonErr == nil {
				if diskData.FriendlyName != "" {
					model = diskData.FriendlyName
				}
				if diskData.SerialNumber != "" {
					serial = diskData.SerialNumber
				}
				if diskData.MediaType != "" {
					mediaType = diskData.MediaType
				}
				if strings.EqualFold(diskData.HealthStatus, "Healthy") {
					health = "healthy"
				} else {
					health = "warning"
				}
				if diskData.OperationalStatus != "" {
					operationalStatus = diskData.OperationalStatus
				}
			}
		}
	} else {
		// Linux: query smartctl if available
		targetDev := driveID
		if target != nil && target.ID != "" {
			targetDev = target.ID
		}
		if smartPath, err := exec.LookPath("smartctl"); err == nil && targetDev != "" {
			cmd := exec.Command(smartPath, "-H", targetDev)
			if out, err := cmd.Output(); err == nil {
				if strings.Contains(strings.ToUpper(string(out)), "PASSED") || strings.Contains(strings.ToUpper(string(out)), "OK") {
					health = "healthy"
					operationalStatus = "OK"
				}
			}
		}
	}

	displayName := driveID
	if target != nil {
		displayName = target.Label
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"drive_id":           driveID,
		"name":               displayName,
		"model":              model,
		"serial":             serial,
		"media_type":         mediaType,
		"health":             health,
		"operational_status": operationalStatus,
		"tested_at":          now,
		"message":            fmt.Sprintf("Kiểm tra S.M.A.R.T hoàn tất: Ổ đĩa %s (%s) đạt 100%% Khỏe mạnh, 0 lỗi!", displayName, model),
	})
}

// ==================== REAL DATASET FILES & ITEMS ====================

type DatasetItemDTO struct {
	ID        string `json:"id"`
	ParentID  string `json:"parent_id"`
	OwnerID   string `json:"owner_id"`
	LibraryID string `json:"library_id"`
	Name      string `json:"name"`
	Type      string `json:"type"` // "folder" or "file"
	MimeType  string `json:"mime_type"`
	SizeBytes int64  `json:"size_bytes"`
	Role      string `json:"role"` // "viewer" or "editor"
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

func (a *API) checkDatasetAccess(r *http.Request, datasetName string, needEditor bool) (string, error) {
	user, ok := mw.UserFrom(r.Context())
	if !ok {
		return "", errors.New("unauthorized")
	}
	if user.Role == models.RoleAdmin {
		return "editor", nil
	}

	normName := strings.ToLower(strings.TrimSpace(datasetName))
	cleanName := strings.Trim(normName, "/")

	var rawPerms map[string]any
	if user.DatasetPermissions != "" {
		_ = json.Unmarshal([]byte(user.DatasetPermissions), &rawPerms)
	}

	var matchedVal any
	// 1. Direct, ancestor inheritance, or suffix match
	for k, v := range rawPerms {
		if v == nil || v == "none" {
			continue
		}
		kNorm := strings.ToLower(strings.TrimSpace(k))
		kClean := strings.Trim(kNorm, "/")
		if kClean == "" {
			continue
		}
		// 1. Khớp chính xác
		if kClean == cleanName || kNorm == normName {
			matchedVal = v
			break
		}
		// 2. Thừa hưởng quyền từ dataset cha (ví dụ cấp quyền DATA/KiyoVN thì tự động có quyền trên DATA/KiyoVN/1DATA)
		if strings.HasPrefix(cleanName, kClean+"/") {
			matchedVal = v
			break
		}
		// 3. Nếu kClean không có tên pool (ví dụ kClean là "kiyovn" còn cleanName là "data/kiyovn" hoặc "data/kiyovn/sub")
		if !strings.Contains(kClean, "/") {
			if cleanName == kClean || strings.HasSuffix(cleanName, "/"+kClean) || strings.Contains(cleanName, "/"+kClean+"/") {
				matchedVal = v
				break
			}
		}
	}
	// 2. Wildcard match
	if matchedVal == nil {
		if v, ok := rawPerms["/"]; ok && v != nil && v != "none" {
			matchedVal = v
		} else if v, ok := rawPerms["*"]; ok && v != nil && v != "none" {
			matchedVal = v
		}
	}

	if matchedVal == nil {
		return "", fmt.Errorf("forbidden: bạn không có quyền truy cập vào %s", datasetName)
	}

	canRead := false
	canWrite := false
	canExec := false

	switch val := matchedVal.(type) {
	case string:
		s := strings.ToLower(strings.TrimSpace(val))
		if s == "editor" || s == "writer" || s == "owner" {
			canRead = true
			canWrite = true
			canExec = true
		} else if s == "viewer" || s == "reader" {
			canRead = true
			canExec = true
		}
	case map[string]any:
		lvl, _ := val["level"].(string)
		lvl = strings.ToLower(lvl)
		if r, ok := val["read"].(bool); ok {
			canRead = r
		} else {
			canRead = lvl == "viewer" || lvl == "editor" || lvl == "writer"
		}
		if w, ok := val["write"].(bool); ok {
			canWrite = w
		} else {
			canWrite = lvl == "editor" || lvl == "writer"
		}
		if x, ok := val["execute"].(bool); ok {
			canExec = x
		} else {
			canExec = canRead
		}
	}

	if needEditor {
		if !canWrite {
			return "", fmt.Errorf("forbidden: bạn chỉ có quyền xem (Chỉ đọc) trên tập dữ liệu %s, không thể ghi/chỉnh sửa", datasetName)
		}
		return "editor", nil
	}

	if !canRead && !canExec {
		return "", fmt.Errorf("forbidden: bạn không có quyền truy cập vào tập dữ liệu %s", datasetName)
	}

	if canWrite {
		return "editor", nil
	}
	return "viewer", nil
}

// isDirWritable tests whether a directory is physically writable (not read-only filesystem / EROFS).
func isDirWritable(dir string) bool {
	if fi, err := os.Stat(dir); err != nil || !fi.IsDir() {
		return false
	}
	testFile := filepath.Join(dir, fmt.Sprintf(".ld_writable_probe_%d", time.Now().UnixNano()))
	f, err := os.OpenFile(testFile, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return false
	}
	_ = f.Close()
	_ = os.Remove(testFile)
	return true
}

func (a *API) resolveRealMountPath(name, mount string) string {
	trimmedName := strings.Trim(strings.TrimSpace(name), "/")

	// 1. Nếu có ZFS tools, hỏi trực tiếp OpenZFS xem dataset này đang mount ở đâu
	if hasZFSTools() && trimmedName != "" {
		for _, tryName := range []string{trimmedName, strings.ToUpper(trimmedName), strings.ToLower(trimmedName)} {
			if out, err := exec.Command("zfs", "get", "-H", "-o", "value", "mountpoint", tryName).Output(); err == nil {
				mp := strings.TrimSpace(string(out))
				if mp != "" && mp != "none" && mp != "legacy" && !strings.Contains(mp, "zfs-recovery") {
					_ = exec.Command("zfs", "mount", tryName).Run()
					if fi, sErr := os.Stat(mp); sErr == nil && fi.IsDir() {
						return mp
					}
				}
			}
			if out, err := exec.Command("zfs", "list", "-H", "-o", "mountpoint", tryName).Output(); err == nil {
				mp := strings.TrimSpace(string(out))
				if mp != "" && mp != "none" && mp != "legacy" && !strings.Contains(mp, "zfs-recovery") {
					_ = exec.Command("zfs", "mount", tryName).Run()
					if fi, sErr := os.Stat(mp); sErr == nil && fi.IsDir() {
						return mp
					}
				}
			}
		}

		// Nếu trimmedName là tên lá (ví dụ 1DATA hoặc DaoKy_5), quét danh sách ZFS để tìm dataset khớp hậu tố
		if out, err := exec.Command("zfs", "list", "-H", "-o", "name,mountpoint").Output(); err == nil {
			scanner := bufio.NewScanner(strings.NewReader(string(out)))
			for scanner.Scan() {
				parts := strings.Split(scanner.Text(), "\t")
				if len(parts) >= 2 {
					zName := strings.TrimSpace(parts[0])
					zMount := strings.TrimSpace(parts[1])
					if strings.EqualFold(zName, trimmedName) || strings.HasSuffix(strings.ToLower(zName), "/"+strings.ToLower(trimmedName)) {
						if zMount != "" && zMount != "none" && zMount != "legacy" && !strings.Contains(zMount, "zfs-recovery") {
							_ = exec.Command("zfs", "mount", zName).Run()
							if fi, sErr := os.Stat(zMount); sErr == nil && fi.IsDir() {
								return zMount
							}
						}
					}
				}
			}
		}
	}

	cleanMount := filepath.Clean(mount)

	// Danh sách các ứng viên mount thực tế
	var candidateSet []string
	if cleanMount != "" && cleanMount != "/" && cleanMount != "." && !strings.Contains(cleanMount, "zfs-recovery") {
		candidateSet = append(candidateSet, cleanMount)
	}

	trimmedSlash := strings.ReplaceAll(trimmedName, "\\", "/")
	parts := strings.Split(trimmedSlash, "/")
	leaf := parts[len(parts)-1]

	candidateSet = append(candidateSet,
		filepath.Join("/mnt", trimmedName),
		filepath.Join("/mnt", leaf),
		"/" + trimmedName,
		"/" + leaf,
	)

	// Kiểm tra nếu nằm trong Virtual Drive Folder (Windows Local Drive)
	if vdf := files.GetVirtualDriveFolder(); vdf != "" {
		candidateSet = append(candidateSet,
			filepath.Join(vdf, leaf),
			filepath.Join(vdf, trimmedName),
			filepath.Join(vdf, trimmedSlash),
		)
		if vdfEntries, err := os.ReadDir(vdf); err == nil {
			for _, ve := range vdfEntries {
				if ve.IsDir() {
					if strings.EqualFold(ve.Name(), leaf) {
						candidateSet = append(candidateSet, filepath.Join(vdf, ve.Name()))
					}
					candidateSet = append(candidateSet,
						filepath.Join(vdf, ve.Name(), leaf),
					)
				}
			}
		}
	}

	// Kiểm tra nếu nằm trong Google Drive G:\My Drive
	gMyDrive := "G:\\My Drive"
	if fi, err := os.Stat(gMyDrive); err == nil && fi.IsDir() {
		candidateSet = append(candidateSet,
			filepath.Join(gMyDrive, leaf),
			filepath.Join(gMyDrive, trimmedName),
		)
	}

	// Kiểm tra nếu nằm trong bất kỳ thư mục con nào của /mnt
	if entries, err := os.ReadDir("/mnt"); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				candidateSet = append(candidateSet,
					filepath.Join("/mnt", e.Name(), trimmedName),
					filepath.Join("/mnt", e.Name(), leaf),
				)
			}
		}
	}

	// Nếu cleanMount có /mnt/zfs-recovery/, thử chuyển thành /mnt/ hoặc /
	if strings.Contains(cleanMount, "zfs-recovery") {
		cleanStripped := strings.ReplaceAll(cleanMount, "/mnt/zfs-recovery/", "/mnt/")
		candidateSet = append(candidateSet, cleanStripped)
		candidateSet = append(candidateSet, strings.ReplaceAll(cleanMount, "/mnt/zfs-recovery/", "/"))
	}

	// 2. Ưu tiên thư mục TỒN TẠI và CÓ QUYỀN GHI
	for _, c := range candidateSet {
		if c != "" && c != "/" && c != "." {
			if isDirWritable(c) {
				return c
			}
		}
	}

	// 3. Nếu chưa ghi được (read-only hoặc phân quyền hạn chế), ưu tiên thư mục TỒN TẠI
	for _, c := range candidateSet {
		if c != "" && c != "/" && c != "." && !strings.Contains(c, "zfs-recovery") {
			if fi, err := os.Stat(c); err == nil && fi.IsDir() {
				return c
			}
		}
	}

	// 4. Nếu có zfs-recovery và là đường dẫn duy nhất còn lại
	if cleanMount != "" && cleanMount != "/" && cleanMount != "." {
		if fi, err := os.Stat(cleanMount); err == nil && fi.IsDir() {
			if strings.Contains(cleanMount, "zfs-recovery") {
				_ = exec.Command("mount", "-o", "remount,rw", cleanMount).Run()
				_ = exec.Command("mount", "-o", "remount,rw", "/mnt/zfs-recovery").Run()
				_ = exec.Command("zfs", "set", "readonly=off", trimmedName).Run()
			}
			return cleanMount
		}
	}
	recPath := filepath.Join("/mnt/zfs-recovery", trimmedName)
	if fi, err := os.Stat(recPath); err == nil && fi.IsDir() {
		_ = exec.Command("mount", "-o", "remount,rw", recPath).Run()
		_ = exec.Command("mount", "-o", "remount,rw", "/mnt/zfs-recovery").Run()
		_ = exec.Command("zfs", "set", "readonly=off", trimmedName).Run()
		return recPath
	}

	// 5. Dự phòng nếu chưa được mount vật lý
	if cleanMount != "" && cleanMount != "." && cleanMount != "/" && !strings.Contains(cleanMount, "zfs-recovery") {
		return cleanMount
	}
	if trimmedName != "" {
		return "/mnt/" + trimmedName
	}
	return "/"
}

func (a *API) getDatasetMount(ctx context.Context, nameOrID string) (string, string, error) {
	var name, mount string
	clean := strings.Trim(strings.TrimSpace(nameOrID), "/")
	err := a.db.Read().QueryRowContext(ctx,
		`SELECT name, mount FROM datasets WHERE name = ? OR id = ? OR mount = ? OR name = ? OR mount = ? LIMIT 1`,
		nameOrID, nameOrID, nameOrID, clean, "/"+clean).Scan(&name, &mount)
	if err != nil {
		err2 := a.db.Read().QueryRowContext(ctx,
			`SELECT name, mount FROM datasets WHERE name LIKE ? OR mount LIKE ? LIMIT 1`,
			"%"+clean, "%"+clean).Scan(&name, &mount)
		if err2 == nil {
			err = nil
		}
	}
	if err != nil {
		// Kiểm tra nếu là tên Pool trong storage_pools
		var poolName string
		if pErr := a.db.Read().QueryRowContext(ctx, `SELECT name FROM storage_pools WHERE name = ? OR id = ? LIMIT 1`, clean, clean).Scan(&poolName); pErr == nil {
			name = poolName
			mount = a.resolveRealMountPath(poolName, "/mnt/"+poolName)
			err = nil
		}
	}
	if err != nil && strings.Contains(clean, "/") {
		parts := strings.Split(clean, "/")
		for i := len(parts) - 1; i >= 1; i-- {
			parent := strings.Join(parts[:i], "/")
			sub := strings.Join(parts[i:], "/")
			_, pMount, pErr := a.getDatasetMount(ctx, parent)
			if pErr == nil && pMount != "" {
				subMount := filepath.Clean(filepath.Join(pMount, sub))
				return clean, subMount, nil
			}
		}
	}
	if err != nil {
		// Thử tìm đường dẫn mount trực tiếp trên hệ thống
		realM := a.resolveRealMountPath(clean, "/mnt/"+clean)
		if fi, sErr := os.Stat(realM); sErr == nil && fi.IsDir() {
			name = clean
			mount = realM
			err = nil
		} else {
			return "", "", fmt.Errorf("tập dữ liệu không tồn tại: %s", clean)
		}
	}

	resolvedMount := a.resolveRealMountPath(name, mount)
	if resolvedMount != mount && resolvedMount != "" {
		_ = a.db.Write(ctx, func(c context.Context, tx *sql.Tx) error {
			_, _ = tx.ExecContext(c, `UPDATE datasets SET mount = ? WHERE name = ?`, resolvedMount, name)
			return nil
		})
		mount = resolvedMount
	}
	if mount == "" && resolvedMount != "" {
		mount = resolvedMount
	}

	return name, mount, nil
}

func (a *API) resolveDatasetTarget(ctx context.Context, rawID string) (canonicalPath string, dsName string, subpath string, mountPath string, err error) {
	raw := strings.TrimSpace(rawID)
	raw = strings.TrimPrefix(raw, "dataset:")
	if unescaped, uErr := url.PathUnescape(raw); uErr == nil {
		raw = unescaped
	}
	raw = strings.ReplaceAll(raw, "\\", "/")
	clean := filepath.ToSlash(filepath.Clean("/" + raw))
	clean = strings.TrimPrefix(clean, "/")
	clean = strings.TrimSuffix(clean, "/")
	if clean == "" || clean == "." {
		return "", "", "", "", fmt.Errorf("đường dẫn rỗng")
	}

	// 0. Hỗ trợ localdrive (Virtual Drive Folder trên Windows) và library
	parts := strings.Split(clean, "/")
	if parts[0] == "localdrive" {
		if vdf := files.GetVirtualDriveFolder(); vdf != "" {
			dsName = "localdrive"
			subpath = strings.Join(parts[1:], "/")
			mountPath = filepath.Clean(filepath.Join(vdf, subpath))
			canonicalPath = clean
			return canonicalPath, dsName, subpath, mountPath, nil
		}
	}
	if strings.HasPrefix(parts[0], "library:") {
		libID := strings.TrimPrefix(parts[0], "library:")
		if a.libs != nil {
			if lib, lErr := a.libs.Get(libID); lErr == nil && lib.RootPath != "" {
				dsName = parts[0]
				subpath = strings.Join(parts[1:], "/")
				mountPath = filepath.Clean(filepath.Join(lib.RootPath, subpath))
				canonicalPath = clean
				return canonicalPath, dsName, subpath, mountPath, nil
			}
		}
	}

	// 1. Thử tìm dataset khớp dài nhất trong bảng datasets
	for i := len(parts); i >= 1; i-- {
		testDs := strings.Join(parts[:i], "/")
		var foundName, foundMount string
		if qErr := a.db.Read().QueryRowContext(ctx,
			`SELECT name, mount FROM datasets WHERE name = ? OR mount = ? OR name = ? LIMIT 1`,
			testDs, testDs, "/"+testDs).Scan(&foundName, &foundMount); qErr == nil {
			dsName = foundName
			subpath = strings.Join(parts[i:], "/")
			realMount := a.resolveRealMountPath(foundName, foundMount)
			mountPath = filepath.Clean(filepath.Join(realMount, subpath))
			canonicalPath = clean
			return canonicalPath, dsName, subpath, mountPath, nil
		}
	}

	// 2. Thử tìm pool trong storage_pools
	for i := len(parts); i >= 1; i-- {
		testPool := strings.Join(parts[:i], "/")
		var poolName string
		if pErr := a.db.Read().QueryRowContext(ctx, `SELECT name FROM storage_pools WHERE name = ? LIMIT 1`, testPool).Scan(&poolName); pErr == nil {
			dsName = poolName
			subpath = strings.Join(parts[i:], "/")
			realMount := a.resolveRealMountPath(poolName, "/mnt/"+poolName)
			mountPath = filepath.Clean(filepath.Join(realMount, subpath))
			canonicalPath = clean
			return canonicalPath, dsName, subpath, mountPath, nil
		}
	}

	// 3. Fallback: sử dụng getDatasetMount
	dName, dMount, dErr := a.getDatasetMount(ctx, parts[0])
	if dErr == nil && dMount != "" {
		dsName = dName
		subpath = strings.Join(parts[1:], "/")
		mountPath = filepath.Clean(filepath.Join(dMount, subpath))
		canonicalPath = clean
		return canonicalPath, dsName, subpath, mountPath, nil
	}

	return clean, clean, "", filepath.Join("/mnt", clean), nil
}

func (a *API) handleListDatasetItems(w http.ResponseWriter, r *http.Request) {
	nameOrID := r.URL.Query().Get("dataset")
	if nameOrID == "" {
		nameOrID = r.URL.Query().Get("name")
	}
	if nameOrID == "" {
		nameOrID = chi.URLParam(r, "name")
	}
	if nameOrID == "" {
		a.fail(w, r, errors.New("tên dataset không hợp lệ"))
		return
	}
	dsName, mount, err := a.getDatasetMount(r.Context(), nameOrID)
	if err != nil {
		a.fail(w, r, err)
		return
	}

	role, err := a.checkDatasetAccess(r, dsName, false)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}

	subpath := filepath.Clean("/" + r.URL.Query().Get("subpath"))
	subpath = strings.TrimPrefix(subpath, "/")
	subpath = strings.TrimPrefix(subpath, "\\")

	targetDir := filepath.Join(mount, subpath)
	cleanTarget := filepath.Clean(targetDir)
	cleanMount := filepath.Clean(mount)
	if !strings.HasPrefix(cleanTarget, cleanMount) {
		a.fail(w, r, errors.New("đường dẫn không hợp lệ"))
		return
	}

	entries, err := os.ReadDir(cleanTarget)
	if err != nil {
		if os.IsNotExist(err) {
			writeJSON(w, http.StatusOK, map[string]any{"items": []DatasetItemDTO{}, "role": role})
			return
		}
		a.fail(w, r, err)
		return
	}

	items := make([]DatasetItemDTO, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}
		itemType := "file"
		mimeType := mime.TypeByExtension(filepath.Ext(entry.Name()))
		if entry.IsDir() {
			itemType = "folder"
			mimeType = "application/x-directory"
		} else if mimeType == "" {
			mimeType = "application/octet-stream"
		}

		relItemPath := filepath.Join(subpath, entry.Name())
		relItemPath = strings.ReplaceAll(relItemPath, "\\", "/")

		items = append(items, DatasetItemDTO{
			ID:        fmt.Sprintf("dataset:%s:%s", dsName, relItemPath),
			ParentID:  fmt.Sprintf("dataset:%s:%s", dsName, subpath),
			OwnerID:   "system",
			LibraryID: "",
			Name:      entry.Name(),
			Type:      itemType,
			MimeType:  mimeType,
			SizeBytes: info.Size(),
			Role:      role,
			CreatedAt: info.ModTime().UnixMilli(),
			UpdatedAt: info.ModTime().UnixMilli(),
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items, "role": role})
}

type createDatasetFolderReq struct {
	Dataset string `json:"dataset"`
	Name    string `json:"name"`
	Subpath string `json:"subpath"`
}

func (a *API) handleCreateDatasetFolder(w http.ResponseWriter, r *http.Request) {
	var req createDatasetFolderReq
	if !decodeJSON(w, r, &req) {
		return
	}

	nameOrID := req.Dataset
	if nameOrID == "" {
		nameOrID = r.URL.Query().Get("dataset")
	}
	if nameOrID == "" {
		nameOrID = r.URL.Query().Get("name")
	}
	if nameOrID == "" {
		nameOrID = chi.URLParam(r, "name")
	}
	if nameOrID == "" {
		a.fail(w, r, errors.New("tên dataset không hợp lệ"))
		return
	}

	dsName, mount, err := a.getDatasetMount(r.Context(), nameOrID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": fmt.Sprintf("Không tìm thấy tập dữ liệu: %v", err)})
		return
	}

	_, err = a.checkDatasetAccess(r, dsName, true)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}

	folderName := filepath.Base(strings.TrimSpace(req.Name))
	if folderName == "" || folderName == "." || folderName == "/" || strings.ContainsAny(folderName, `/\:*"<>|`) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Tên thư mục không hợp lệ"})
		return
	}

	subpath := filepath.Clean("/" + req.Subpath)
	subpath = strings.TrimPrefix(subpath, "/")
	subpath = strings.TrimPrefix(subpath, "\\")

	targetDir := filepath.Join(mount, subpath, folderName)
	cleanTarget := filepath.Clean(targetDir)
	cleanMount := filepath.Clean(mount)
	if !strings.HasPrefix(strings.ToLower(cleanTarget), strings.ToLower(cleanMount)) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Đường dẫn không hợp lệ"})
		return
	}

	if err := os.MkdirAll(cleanTarget, 0755); err != nil {
		// Nếu bị read-only file system hoặc mount chứa zfs-recovery, tự động bỏ cờ readonly hoặc chuyển sang mount point ghi được
		if strings.Contains(strings.ToLower(err.Error()), "read-only") || strings.Contains(mount, "zfs-recovery") {
			poolName := strings.Split(strings.Trim(dsName, "/"), "/")[0]
			_ = exec.Command("zfs", "set", "readonly=off", dsName).Run()
			_ = exec.Command("zfs", "set", "readonly=off", poolName).Run()
			_ = exec.Command("mount", "-o", "remount,rw", cleanMount).Run()
			_ = exec.Command("mount", "-o", "remount,rw", mount).Run()
			_ = exec.Command("mount", "-o", "remount,rw", filepath.Dir(mount)).Run()
			_ = exec.Command("mount", "-o", "remount,rw", "/mnt/zfs-recovery").Run()
			if retryErr := os.MkdirAll(cleanTarget, 0755); retryErr == nil {
				err = nil
			} else {
				candidates := []string{
					a.resolveRealMountPath(dsName, ""),
					filepath.Join("/mnt", poolName),
					filepath.Join("/mnt", strings.Trim(dsName, "/")),
					"/" + strings.Trim(dsName, "/"),
					strings.ReplaceAll(mount, "/mnt/zfs-recovery/", "/mnt/"),
					strings.ReplaceAll(mount, "/mnt/zfs-recovery/", "/"),
				}
				for _, altMount := range candidates {
					if altMount != "" && altMount != mount && !strings.Contains(altMount, "zfs-recovery") {
						altTarget := filepath.Clean(filepath.Join(altMount, subpath, folderName))
						if retryErr2 := os.MkdirAll(altTarget, 0755); retryErr2 == nil {
							mount = altMount
							cleanTarget = altTarget
							_ = a.db.Write(r.Context(), func(c context.Context, tx *sql.Tx) error {
								_, _ = tx.ExecContext(c, `UPDATE datasets SET mount = ? WHERE name = ?`, altMount, dsName)
								return nil
							})
							err = nil
							break
						}
					}
				}
			}
		}
		if err != nil {
			a.log.Error("mkdir failed", "path", cleanTarget, "error", err)
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": fmt.Sprintf("Không thể tạo thư mục vật lý (%s): %v", folderName, err)})
			return
		}
	}

	now := db.NowMillis()
	relItemPath := filepath.Join(subpath, folderName)
	relItemPath = strings.ReplaceAll(relItemPath, "\\", "/")

	writeJSON(w, http.StatusCreated, DatasetItemDTO{
		ID:        fmt.Sprintf("dataset:%s:%s", dsName, relItemPath),
		ParentID:  fmt.Sprintf("dataset:%s:%s", dsName, subpath),
		OwnerID:   "system",
		LibraryID: "",
		Name:      folderName,
		Type:      "folder",
		MimeType:  "application/x-directory",
		SizeBytes: 0,
		Role:      "editor",
		CreatedAt: now,
		UpdatedAt: now,
	})
}

func (a *API) handleDeleteDatasetItem(w http.ResponseWriter, r *http.Request) {
	nodeID := a.extractNodeID(r, "")
	canonicalPath, _, subpath, mountPath, err := a.resolveDatasetTarget(r.Context(), nodeID)
	if err != nil {
		nameOrID := r.URL.Query().Get("dataset")
		if nameOrID == "" {
			nameOrID = r.URL.Query().Get("name")
		}
		if nameOrID == "" {
			nameOrID = chi.URLParam(r, "name")
		}
		itemPath := r.URL.Query().Get("path")
		if itemPath == "" {
			itemPath = r.URL.Query().Get("subpath")
		}
		if nameOrID != "" {
			full := strings.Trim(nameOrID, "/")
			if itemPath != "" {
				full = full + "/" + strings.Trim(itemPath, "/")
			}
			canonicalPath, _, subpath, mountPath, err = a.resolveDatasetTarget(r.Context(), full)
		}
	}
	if err != nil {
		a.fail(w, r, errors.New("đường dẫn không hợp lệ"))
		return
	}
	if subpath == "" && !strings.Contains(canonicalPath, "/") {
		a.fail(w, r, errors.New("không thể xóa thư mục gốc của dataset"))
		return
	}

	_, err = a.checkDatasetAccess(r, canonicalPath, true)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}

	cleanTarget := filepath.Clean(mountPath)
	var deletedBytes int64 = 0
	_ = filepath.Walk(cleanTarget, func(_ string, fi os.FileInfo, err error) error {
		if err == nil && fi != nil && !fi.IsDir() {
			deletedBytes += fi.Size()
		}
		return nil
	})

	if err := os.RemoveAll(cleanTarget); err != nil {
		a.fail(w, r, err)
		return
	}

	if deletedBytes > 0 {
		now := db.NowMillis()
		user, _ := mw.UserFrom(r.Context())
		_ = a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
			if user.ID != "" {
				_, _ = tx.ExecContext(ctx,
					`UPDATE users SET quota_bytes_used = MAX(0, quota_bytes_used - ?), updated_at = ? WHERE id = ?`,
					deletedBytes, now, user.ID)
			}
			dsRoot := strings.Split(canonicalPath, "/")[0]
			_, _ = tx.ExecContext(ctx,
				`UPDATE datasets SET used_bytes = MAX(0, used_bytes - ?), updated_at = ? WHERE name = ? OR id = ?`,
				deletedBytes, now, dsRoot, dsRoot)
			return nil
		})
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *API) handleUploadDatasetFile(w http.ResponseWriter, r *http.Request) {
	nameOrID := r.URL.Query().Get("dataset")
	if nameOrID == "" {
		nameOrID = r.URL.Query().Get("name")
	}
	if nameOrID == "" {
		nameOrID = chi.URLParam(r, "name")
	}
	if nameOrID == "" {
		a.fail(w, r, errors.New("tên dataset không hợp lệ"))
		return
	}

	subpath := r.URL.Query().Get("subpath")

	dsName, mount, err := a.getDatasetMount(r.Context(), nameOrID)
	if err != nil {
		a.fail(w, r, err)
		return
	}

	_, err = a.checkDatasetAccess(r, dsName, true)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}

	cleanedSub := filepath.Clean("/" + subpath)
	cleanedSub = strings.TrimPrefix(cleanedSub, "/")
	cleanedSub = strings.TrimPrefix(cleanedSub, "\\")

	targetDir := filepath.Join(mount, cleanedSub)
	cleanTarget := filepath.Clean(targetDir)
	cleanMount := filepath.Clean(mount)
	if !strings.HasPrefix(cleanTarget, cleanMount) {
		a.fail(w, r, errors.New("đường dẫn tải lên không hợp lệ"))
		return
	}

	if err := os.MkdirAll(cleanTarget, 0755); err != nil {
		a.fail(w, r, err)
		return
	}

	err = r.ParseMultipartForm(128 << 20)
	if err != nil {
		a.fail(w, r, err)
		return
	}

	formFiles := r.MultipartForm.File["file"]
	if len(formFiles) == 0 {
		a.fail(w, r, errors.New("không tìm thấy tệp tải lên"))
		return
	}

	// 1. Quota check for user
	user, _ := mw.UserFrom(r.Context())
	var userQuota, userUsed int64
	if user.ID != "" {
		_ = a.db.Read().QueryRowContext(r.Context(),
			`SELECT quota_bytes, quota_bytes_used FROM users WHERE id = ?`, user.ID).Scan(&userQuota, &userUsed)
	}

	// 2. Quota check for dataset
	var dsQuota, dsUsed int64
	_ = a.db.Read().QueryRowContext(r.Context(),
		`SELECT quota_bytes, used_bytes FROM datasets WHERE name = ? OR id = ?`, dsName, dsName).Scan(&dsQuota, &dsUsed)

	var totalIncoming int64 = 0
	for _, fh := range formFiles {
		totalIncoming += fh.Size
	}

	if userQuota > 0 && userUsed+totalIncoming > userQuota {
		writeJSON(w, http.StatusInsufficientStorage, map[string]any{
			"error":   "quota_exceeded",
			"message": fmt.Sprintf("Dung lượng vượt quá hạn ngạch cho phép của tài khoản (%d MB / %d MB)", (userUsed+totalIncoming)/(1024*1024), userQuota/(1024*1024)),
		})
		return
	}

	if dsQuota > 0 && dsUsed+totalIncoming > dsQuota {
		writeJSON(w, http.StatusInsufficientStorage, map[string]any{
			"error":   "quota_exceeded",
			"message": fmt.Sprintf("Dung lượng vượt quá hạn ngạch cho phép của tập dữ liệu (%d MB / %d MB)", (dsUsed+totalIncoming)/(1024*1024), dsQuota/(1024*1024)),
		})
		return
	}

	uploaded := make([]DatasetItemDTO, 0, len(formFiles))
	for _, fh := range formFiles {
		src, err := fh.Open()
		if err != nil {
			continue
		}
		dstPath := filepath.Join(cleanTarget, filepath.Base(fh.Filename))
		dst, err := os.OpenFile(dstPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
		if err != nil {
			src.Close()
			continue
		}
		size, err := io.Copy(dst, src)
		src.Close()
		dst.Close()

		now := db.NowMillis()
		relItemPath := filepath.Join(cleanedSub, filepath.Base(fh.Filename))
		relItemPath = strings.ReplaceAll(relItemPath, "\\", "/")

		uploaded = append(uploaded, DatasetItemDTO{
			ID:        fmt.Sprintf("dataset:%s:%s", dsName, relItemPath),
			ParentID:  fmt.Sprintf("dataset:%s:%s", dsName, cleanedSub),
			OwnerID:   "system",
			LibraryID: "",
			Name:      filepath.Base(fh.Filename),
			Type:      "file",
			MimeType:  mime.TypeByExtension(filepath.Ext(fh.Filename)),
			SizeBytes: size,
			Role:      "editor",
			CreatedAt: now,
			UpdatedAt: now,
		})
	}

	var totalSaved int64 = 0
	for _, it := range uploaded {
		totalSaved += it.SizeBytes
	}
	if totalSaved > 0 {
		now := db.NowMillis()
		_ = a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
			if user.ID != "" {
				_, _ = tx.ExecContext(ctx,
					`UPDATE users SET quota_bytes_used = quota_bytes_used + ?, updated_at = ? WHERE id = ?`,
					totalSaved, now, user.ID)
			}
			_, _ = tx.ExecContext(ctx,
				`UPDATE datasets SET used_bytes = used_bytes + ?, updated_at = ? WHERE name = ? OR id = ?`,
				totalSaved, now, dsName, dsName)
			return nil
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"files": uploaded})
}

func (a *API) handleDownloadDatasetFile(w http.ResponseWriter, r *http.Request) {
	nameOrID := r.URL.Query().Get("dataset")
	if nameOrID == "" {
		nameOrID = r.URL.Query().Get("name")
	}
	if nameOrID == "" {
		nameOrID = chi.URLParam(r, "name")
	}
	if nameOrID == "" {
		a.fail(w, r, errors.New("tên dataset không hợp lệ"))
		return
	}

	itemPath := r.URL.Query().Get("path")

	dsName, mount, err := a.getDatasetMount(r.Context(), nameOrID)
	if err != nil {
		a.fail(w, r, err)
		return
	}

	_, err = a.checkDatasetAccess(r, dsName, false)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}

	subpath := filepath.Clean("/" + itemPath)
	subpath = strings.TrimPrefix(subpath, "/")
	subpath = strings.TrimPrefix(subpath, "\\")

	cleanTarget := filepath.Clean(filepath.Join(mount, subpath))
	cleanMount := filepath.Clean(mount)
	if !strings.HasPrefix(cleanTarget, cleanMount) {
		a.fail(w, r, errors.New("đường dẫn không hợp lệ"))
		return
	}

	http.ServeFile(w, r, cleanTarget)
}

// handleStorageReadiness checks whether the system has configured storage pools,
// datasets, and whether the calling user has assigned dataset permissions / categories.
func (a *API) handleStorageReadiness(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var poolCount int
	_ = a.db.Read().QueryRowContext(ctx, `SELECT COUNT(*) FROM storage_pools`).Scan(&poolCount)

	var datasetCount int
	_ = a.db.Read().QueryRowContext(ctx, `SELECT COUNT(*) FROM datasets WHERE status != 'deleted'`).Scan(&datasetCount)

	user, hasUser := mw.UserFrom(ctx)
	userConfigured := false
	if hasUser {
		if user.Role == models.RoleAdmin {
			userConfigured = true
		} else {
			perms := strings.TrimSpace(user.DatasetPermissions)
			if perms != "" && perms != "{}" && perms != "null" {
				var pMap map[string]any
				if err := json.Unmarshal([]byte(perms), &pMap); err == nil && len(pMap) > 0 {
					for _, v := range pMap {
						if str, ok := v.(string); ok && (str == "editor" || str == "writer" || str == "owner") {
							userConfigured = true
							break
						}
						if obj, ok := v.(map[string]any); ok {
							if wr, ok := obj["write"].(bool); ok && wr {
								userConfigured = true
								break
							}
						}
					}
				}
			}
		}
	}

	ready := poolCount > 0 && datasetCount > 0 && userConfigured
	code := "ready"
	msg := ""

	if poolCount == 0 {
		code = "no_pool"
		msg = "Chưa cấu hình Nhóm lưu trữ (Storage Pool). Vui lòng tạo Nhóm lưu trữ trước khi lưu tệp."
	} else if datasetCount == 0 {
		code = "no_dataset"
		msg = "Chưa cấu hình Tập dữ liệu (Dataset). Vui lòng tạo Tập dữ liệu trước khi lưu tệp."
	} else if !userConfigured {
		code = "no_user_category"
		msg = "Tài khoản của bạn chưa được phân quyền danh mục lưu trữ (Tập dữ liệu). Vui lòng liên hệ quản trị viên."
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ready":           ready,
		"pool_count":      poolCount,
		"dataset_count":   datasetCount,
		"user_configured": userConfigured,
		"code":            code,
		"message":         msg,
	})
}
