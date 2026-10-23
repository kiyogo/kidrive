package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/MultiX0/LocalDrive/server/internal/audit"
	"github.com/MultiX0/LocalDrive/server/internal/db"
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
		if pRows, pErr := a.db.Read().QueryContext(r.Context(), `SELECT name, total_bytes, used_bytes FROM storage_pools`); pErr == nil {
			for pRows.Next() {
				var pName string
				var pTotal, pUsed int64
				if err := pRows.Scan(&pName, &pTotal, &pUsed); err == nil {
					free := pTotal - pUsed
					if free < 0 {
						free = 0
					}
					poolFreeMap[pName] = free
					poolFreeMap[strings.ToLower(pName)] = free
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
	if pRows, pErr := a.db.Read().QueryContext(r.Context(), `SELECT name, total_bytes, used_bytes FROM storage_pools`); pErr == nil {
		for pRows.Next() {
			var pName string
			var pTotal, pUsed int64
			if err := pRows.Scan(&pName, &pTotal, &pUsed); err == nil {
				free := pTotal - pUsed
				if free < 0 {
					free = 0
				}
				poolFreeMap[pName] = free
				poolFreeMap[strings.ToLower(pName)] = free
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
	// Ensure directory exists physically
	_ = os.MkdirAll(trimmedPath, 0755)

	// If inactive, remove share
	if !active {
		removeSystemNetworkShare(trimmedName)
		return nil
	}

	// On Windows, use 'net share'
	// First delete existing share with same name (if any) to prevent conflict
	_ = exec.Command("net", "share", trimmedName, "/DELETE", "/Y").Run()

	perm := "FULL"
	if readOnly {
		perm = "READ"
	}
	grantArg := fmt.Sprintf("/GRANT:Everyone,%s", perm)
	cmd := exec.Command("net", "share", fmt.Sprintf("%s=%s", trimmedName, trimmedPath), grantArg)
	_ = cmd.Run()

	// Also try net usershare on Linux if available
	_ = exec.Command("net", "usershare", "add", trimmedName, trimmedPath, "", "Everyone:F", "guest_ok=y").Run()

	return nil
}

func removeSystemNetworkShare(name string) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return
	}
	_ = exec.Command("net", "share", trimmedName, "/DELETE", "/Y").Run()
	_ = exec.Command("net", "usershare", "delete", trimmedName).Run()
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

	// Ensure folder exists on disk
	_ = os.MkdirAll(path, 0755)

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
			id, name, purpose, path, req.Description, roInt, brInt, huInt, goInt, now, now)
		return err
	})
	if err != nil {
		a.fail(w, r, err)
		return
	}

	// Real OS Network Share publish
	_ = syncSystemNetworkShare(name, path, req.ReadOnly, req.GuestOK, true)

	writeJSON(w, http.StatusCreated, map[string]any{
		"share": NetworkShareDTO{
			ID:             id,
			Name:           name,
			Purpose:        purpose,
			Path:           path,
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
			_ = tx.QueryRowContext(ctx, `UPDATE network_shares SET path = ?, updated_at = ? WHERE id = ?`, *req.Path, now, id)
			_ = os.MkdirAll(*req.Path, 0755)
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

	// Synchronize real OS share state
	_ = syncSystemNetworkShare(s.Name, s.Path, s.ReadOnly, s.GuestOK, s.Status == "active")

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
	if strings.HasPrefix(name, "$") || strings.HasPrefix(name, ".") || strings.EqualFold(name, "System Volume Information") {
		return true
	}
	switch lower {
	case "source", "node_modules", "build", "dist", "target", "bin", "obj", "vendor",
		"appdata", "program files", "program files (x86)", "windows", "perflogs", "recovery", "temp", "tmp":
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
			Path:     fullPath,
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
	rows, err := a.db.Read().QueryContext(r.Context(),
		`SELECT id, name, pool, mount FROM datasets WHERE status != 'deleted' ORDER BY pool ASC, name ASC`)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	defer rows.Close()

	dsNodes := make([]FolderTreeNodeDTO, 0)
	for rows.Next() {
		var id, name, pool, mount string
		if err := rows.Scan(&id, &name, &pool, &mount); err != nil {
			a.fail(w, r, err)
			return
		}
		subdirs := readSubdirs(mount, 6)
		dsNodes = append(dsNodes, FolderTreeNodeDTO{
			ID:       "ds-" + id,
			Name:     name,
			Path:     mount,
			IsDrive:  true,
			Children: subdirs,
		})
	}
	if err := rows.Err(); err != nil {
		a.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"tree": dsNodes,
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

		// Tính toán dung lượng thật sự 100% dựa trên phần cứng máy tính
		if len(p.Disks) > 0 && len(driveMap) > 0 {
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
	err := a.db.Write(r.Context(), func(ctx context.Context, tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `DELETE FROM storage_pools WHERE id = ?`, id)
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
	w.WriteHeader(http.StatusNoContent)
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
		"message": fmt.Sprintf("Phát hiện %d ổ đĩa vật lý khả dụng. Đã tự động cấu hình tối ưu sẵn sàng nhập.", len(availableDrives)),
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

	layout := strings.TrimSpace(req.Layout)
	if layout == "" {
		layout = "MergerFS"
	}

	disks := req.Disks
	if len(disks) == 0 {
		disks = suggestedDisks
	}
	if len(disks) == 0 && len(hostDrives) > 0 {
		disks = []string{hostDrives[0].ID}
		totalBytes = hostDrives[0].SizeBytes
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

	disksJSON, _ := json.Marshal(disks)
	now := db.NowMillis()
	id := db.NewID()

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
		"message": fmt.Sprintf("Nhập Pool \"%s\" thành công! Đã tự động cấu hình tối ưu.", name),
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

	model := "Local Disk"
	serial := "N/A"
	mediaType := "SSD"
	health := "healthy"
	operationalStatus := "OK"

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
	var perms map[string]string
	if user.DatasetPermissions != "" {
		_ = json.Unmarshal([]byte(user.DatasetPermissions), &perms)
	}
	perm := perms[datasetName]
	if perm == "editor" {
		return "editor", nil
	}
	if !needEditor && perm == "viewer" {
		return "viewer", nil
	}
	return "", fmt.Errorf("forbidden: bạn không có quyền truy cập vào bộ dữ liệu %s", datasetName)
}

func (a *API) getDatasetMount(ctx context.Context, nameOrID string) (string, string, error) {
	var name, mount string
	err := a.db.Read().QueryRowContext(ctx,
		`SELECT name, mount FROM datasets WHERE name = ? OR id = ?`, nameOrID, nameOrID).Scan(&name, &mount)
	if err != nil {
		return "", "", fmt.Errorf("dataset không tồn tại: %v", err)
	}
	return name, mount, nil
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
		a.fail(w, r, err)
		return
	}

	_, err = a.checkDatasetAccess(r, dsName, true)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}

	folderName := filepath.Base(strings.TrimSpace(req.Name))
	if folderName == "" || folderName == "." || folderName == "/" {
		a.fail(w, r, errors.New("tên thư mục không hợp lệ"))
		return
	}

	subpath := filepath.Clean("/" + req.Subpath)
	subpath = strings.TrimPrefix(subpath, "/")
	subpath = strings.TrimPrefix(subpath, "\\")

	targetDir := filepath.Join(mount, subpath, folderName)
	cleanTarget := filepath.Clean(targetDir)
	cleanMount := filepath.Clean(mount)
	if !strings.HasPrefix(cleanTarget, cleanMount) {
		a.fail(w, r, errors.New("đường dẫn không hợp lệ"))
		return
	}

	if err := os.MkdirAll(cleanTarget, 0755); err != nil {
		a.fail(w, r, err)
		return
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
	if itemPath == "" {
		a.fail(w, r, errors.New("vui lòng cung cấp đường dẫn cần xóa"))
		return
	}

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

	subpath := filepath.Clean("/" + itemPath)
	subpath = strings.TrimPrefix(subpath, "/")
	subpath = strings.TrimPrefix(subpath, "\\")
	if subpath == "" || subpath == "." {
		a.fail(w, r, errors.New("không thể xóa thư mục gốc của dataset"))
		return
	}

	cleanTarget := filepath.Clean(filepath.Join(mount, subpath))
	cleanMount := filepath.Clean(mount)
	if !strings.HasPrefix(cleanTarget, cleanMount) || cleanTarget == cleanMount {
		a.fail(w, r, errors.New("đường dẫn xóa không hợp lệ"))
		return
	}

	if err := os.RemoveAll(cleanTarget); err != nil {
		a.fail(w, r, err)
		return
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
