package httpapi

import (
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/MultiX0/LocalDrive/server/internal/audit"
	"github.com/MultiX0/LocalDrive/server/internal/files"
	mw "github.com/MultiX0/LocalDrive/server/internal/middleware"
	"github.com/MultiX0/LocalDrive/server/internal/models"
)

func (a *API) handleListNodes(w http.ResponseWriter, r *http.Request) {
	userID, _ := caller(r)
	user, ok := mw.UserFrom(r.Context())
	isAdmin := ok && user.Role == models.RoleAdmin

	limit := intQuery(r, "limit", 50)
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	offset := intQuery(r, "offset", 0)
	if offset < 0 {
		offset = 0
	}
	opts := files.ListOptions{
		ParentID: strings.TrimSpace(r.URL.Query().Get("parent_id")),
		Filter:   strings.TrimSpace(r.URL.Query().Get("filter")),
		Query:    strings.TrimSpace(r.URL.Query().Get("query")),
		Limit:    limit,
		Offset:   offset,
		SortBy:   strings.TrimSpace(r.URL.Query().Get("sort")),
		SortDesc: strings.EqualFold(r.URL.Query().Get("order"), "desc"),
	}

	// 1. Nếu tài khoản không phải admin và CHƯA được chọn danh mục lưu trữ -> Không hiện dữ liệu và không tải được gì luôn!
	if !isAdmin {
		hasPerms := false
		if ok && user.DatasetPermissions != "" && user.DatasetPermissions != "{}" {
			var perms map[string]any
			if err := json.Unmarshal([]byte(user.DatasetPermissions), &perms); err == nil {
				for _, v := range perms {
					if v == nil || v == "none" {
						continue
					}
					if s, ok := v.(string); ok && s != "none" {
						hasPerms = true
						break
					}
					if m, ok := v.(map[string]any); ok {
						if rVal, _ := m["read"].(bool); rVal {
							hasPerms = true
							break
						}
					}
				}
			}
		}
		if !hasPerms {
			writeJSON(w, http.StatusOK, map[string]any{
				"nodes":       []nodeDTO{},
				"limit":       opts.Limit,
				"offset":      opts.Offset,
				"has_more":    false,
				"next_offset": 0,
			})
			return
		}
	}

	// 2. Nếu đang xem trong một dataset hoặc thư mục con của dataset
	if strings.HasPrefix(opts.ParentID, "dataset:") {
		parts := strings.SplitN(strings.TrimPrefix(opts.ParentID, "dataset:"), ":", 2)
		dsName := parts[0]
		subpath := ""
		if len(parts) > 1 {
			subpath = parts[1]
		}
		if unescaped, err := url.PathUnescape(dsName); err == nil {
			dsName = unescaped
		}
		if unescaped, err := url.PathUnescape(subpath); err == nil {
			subpath = unescaped
		}
		dsName, mount, err := a.getDatasetMount(r.Context(), dsName)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		role, err := a.checkDatasetAccess(r, dsName, false)
		if err != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
			return
		}
		cleanedSub := filepath.Clean("/" + subpath)
		cleanedSub = strings.TrimPrefix(cleanedSub, "/")
		cleanedSub = strings.TrimPrefix(cleanedSub, "\\")
		cleanTarget := filepath.Clean(filepath.Join(mount, cleanedSub))
		cleanMount := filepath.Clean(mount)
		if !strings.HasPrefix(strings.ToLower(cleanTarget), strings.ToLower(cleanMount)) {
			a.fail(w, r, fmt.Errorf("đường dẫn không hợp lệ"))
			return
		}

		var nodes []nodeDTO
		childDsNames := make(map[string]bool)

		// Thêm các tập dữ liệu con (child datasets) trực thuộc dataset này nếu đang ở thư mục gốc của dataset (subpath == "")
		if cleanedSub == "" || cleanedSub == "." {
			dRows, err := a.db.Read().QueryContext(r.Context(),
				`SELECT name, used_bytes, created_at, updated_at FROM datasets WHERE name LIKE ? ORDER BY name ASC`,
				dsName+"/%")
			if err == nil {
				defer dRows.Close()
				for dRows.Next() {
					var childFullName string
					var childUsed, childCreated, childUpdated int64
					if err := dRows.Scan(&childFullName, &childUsed, &childCreated, &childUpdated); err == nil {
						rel := strings.TrimPrefix(childFullName, dsName+"/")
						if !strings.Contains(rel, "/") {
							cRole, cErr := a.checkDatasetAccess(r, childFullName, false)
							if cErr == nil {
								childDsNames[strings.ToLower(rel)] = true
								nodes = append(nodes, nodeDTO{
									ID:        fmt.Sprintf("dataset:%s", childFullName),
									ParentID:  opts.ParentID,
									Name:      rel,
									Type:      "folder",
									Category:  "folder",
									MimeType:  "application/x-directory",
									SizeBytes: childUsed,
									Role:      cRole,
									CreatedAt: childCreated,
									UpdatedAt: childUpdated,
								})
							}
						}
					}
				}
			}
		}

		entries, err := os.ReadDir(cleanTarget)
		if err == nil {
			qLower := strings.ToLower(opts.Query)
			for _, entry := range entries {
				if childDsNames[strings.ToLower(entry.Name())] {
					continue
				}
				if qLower != "" && !strings.Contains(strings.ToLower(entry.Name()), qLower) {
					continue
				}
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
				relItemPath := filepath.Join(cleanedSub, entry.Name())
				relItemPath = strings.ReplaceAll(relItemPath, "\\", "/")
				relItemPath = strings.TrimPrefix(relItemPath, "/")
				category := string(models.CategoryOf(models.NodeType(itemType), mimeType, entry.Name()))
				nodes = append(nodes, nodeDTO{
					ID:        fmt.Sprintf("dataset:%s:%s", dsName, relItemPath),
					ParentID:  opts.ParentID,
					Name:      entry.Name(),
					Type:      itemType,
					Category:  category,
					MimeType:  mimeType,
					SizeBytes: info.Size(),
					Role:      role,
					CreatedAt: info.ModTime().UnixMilli(),
					UpdatedAt: info.ModTime().UnixMilli(),
				})
			}
		}

		total := len(nodes)
		start := opts.Offset
		if start > total {
			start = total
		}
		end := start + opts.Limit
		if end > total {
			end = total
		}
		paged := nodes[start:end]
		writeJSON(w, http.StatusOK, map[string]any{
			"nodes":       paged,
			"limit":       opts.Limit,
			"offset":      opts.Offset,
			"has_more":    end < total,
			"next_offset": end,
		})
		return
	}

	// 3. Ở thư mục gốc (Root)
	if (opts.ParentID == "" || opts.ParentID == "root") && (opts.Filter == "" || opts.Filter == "none") {
		rows, err := a.db.Read().QueryContext(r.Context(), `SELECT name, pool, used_bytes, created_at, updated_at FROM datasets ORDER BY name ASC`)
		if err == nil {
			defer rows.Close()
			type dsEntry struct {
				name      string
				pool      string
				usedBytes int64
				createdAt int64
				updatedAt int64
				role      string
			}
			var accessible []dsEntry
			for rows.Next() {
				var name, pool string
				var usedBytes, createdAt, updatedAt int64
				if err := rows.Scan(&name, &pool, &usedBytes, &createdAt, &updatedAt); err == nil {
					role, accessErr := a.checkDatasetAccess(r, name, false)
					if accessErr == nil {
						accessible = append(accessible, dsEntry{
							name:      name,
							pool:      pool,
							usedBytes: usedBytes,
							createdAt: createdAt,
							updatedAt: updatedAt,
							role:      role,
						})
					}
				}
			}

			// Chỉ lấy những dataset ở CẤP CAO NHẤT trong danh sách được cấp quyền (không hiện con đè lên gốc)
			var rootDsNodes []nodeDTO
			for _, d := range accessible {
				isChild := false
				for _, other := range accessible {
					if other.name != d.name && strings.HasPrefix(d.name, other.name+"/") {
						isChild = true
						break
					}
				}
				if !isChild {
					displayName := d.name
					if idx := strings.LastIndex(d.name, "/"); idx != -1 {
						displayName = d.name[idx+1:]
					}
					color := "azure"
					if d.pool == "kiyo-pool" {
						color = "grape"
					}
					rootDsNodes = append(rootDsNodes, nodeDTO{
						ID:        fmt.Sprintf("dataset:%s", d.name),
						ParentID:  "",
						Name:      displayName,
						Type:      "folder",
						Category:  "folder",
						MimeType:  "application/x-directory",
						SizeBytes: d.usedBytes,
						Color:     color,
						Role:      d.role,
						CreatedAt: d.createdAt,
						UpdatedAt: d.updatedAt,
					})
				}
			}

			if len(rootDsNodes) > 0 || len(accessible) > 0 || !isAdmin {
				writeJSON(w, http.StatusOK, map[string]any{
					"nodes":       rootDsNodes,
					"limit":       opts.Limit,
					"offset":      opts.Offset,
					"has_more":    false,
					"next_offset": len(rootDsNodes),
				})
				return
			}
		}
	}

	list, err := a.files.List(r.Context(), userID, opts)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	hasMore := len(list) == limit
	outNodes := nodeViews(list, userID)

	writeJSON(w, http.StatusOK, map[string]any{
		"nodes":       outNodes,
		"limit":       opts.Limit,
		"offset":      opts.Offset,
		"has_more":    hasMore,
		"next_offset": offset + len(list),
	})
}

type createFolderRequest struct {
	ParentID  string `json:"parent_id"`
	Name      string `json:"name"`
	LibraryID string `json:"library_id"`
	Color     string `json:"color"`
}

func (a *API) handleCreateFolder(w http.ResponseWriter, r *http.Request) {
	var req createFolderRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	userID, ip := caller(r)

	if strings.HasPrefix(req.ParentID, "dataset:") {
		parts := strings.SplitN(strings.TrimPrefix(req.ParentID, "dataset:"), ":", 2)
		dsName := parts[0]
		subpath := ""
		if len(parts) > 1 {
			subpath = parts[1]
		}
		if unescaped, err := url.PathUnescape(dsName); err == nil {
			dsName = unescaped
		}
		if unescaped, err := url.PathUnescape(subpath); err == nil {
			subpath = unescaped
		}
		dsName, mount, err := a.getDatasetMount(r.Context(), dsName)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		role, err := a.checkDatasetAccess(r, dsName, true)
		if err != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
			return
		}
		folderName := strings.TrimSpace(req.Name)
		if folderName == "" || strings.ContainsAny(folderName, `/\:*"<>|`) {
			a.fail(w, r, fmt.Errorf("tên thư mục không hợp lệ"))
			return
		}
		cleanedSub := filepath.Clean("/" + subpath)
		cleanedSub = strings.TrimPrefix(cleanedSub, "/")
		cleanedSub = strings.TrimPrefix(cleanedSub, "\\")
		targetPath := filepath.Clean(filepath.Join(mount, cleanedSub, folderName))
		cleanMount := filepath.Clean(mount)
		if !strings.HasPrefix(strings.ToLower(targetPath), strings.ToLower(cleanMount)) {
			a.fail(w, r, fmt.Errorf("đường dẫn không hợp lệ"))
			return
		}
		if err := os.MkdirAll(targetPath, 0755); err != nil {
			a.fail(w, r, err)
			return
		}
		relPath := filepath.ToSlash(filepath.Join(cleanedSub, folderName))
		relPath = strings.TrimPrefix(relPath, "/")
		body := nodeDTO{
			ID:        fmt.Sprintf("dataset:%s:%s", dsName, relPath),
			ParentID:  req.ParentID,
			Name:      folderName,
			Type:      "folder",
			Category:  "folder",
			MimeType:  "application/x-directory",
			Role:      role,
			Color:     req.Color,
			CreatedAt: time.Now().UnixMilli(),
			UpdatedAt: time.Now().UnixMilli(),
		}
		writeJSON(w, http.StatusCreated, body)
		return
	}

	if replayed, ok := a.replayIdempotent(w, r, "nodes.folder"); ok {
		_ = replayed
		return
	}
	node, err := a.files.CreateFolder(r.Context(), files.CreateFolderParams{
		UserID: userID, ParentID: req.ParentID, Name: req.Name,
		LibraryID: req.LibraryID, Color: req.Color, IP: ip,
	})
	if err != nil {
		a.fail(w, r, err)
		return
	}
	body := plainNode(node)
	a.storeIdempotent(r, "nodes.folder", body)
	writeJSON(w, http.StatusCreated, body)
}

func (a *API) handleGetNode(w http.ResponseWriter, r *http.Request) {
	nodeID := a.extractNodeID(r, "")
	if strings.HasPrefix(nodeID, "dataset:") {
		parts := strings.SplitN(strings.TrimPrefix(nodeID, "dataset:"), ":", 2)
		dsName := parts[0]
		subpath := ""
		if len(parts) > 1 {
			subpath = parts[1]
		}
		if unescaped, err := url.PathUnescape(dsName); err == nil {
			dsName = unescaped
		}
		if unescaped, err := url.PathUnescape(subpath); err == nil {
			subpath = unescaped
		}
		dsName, mount, err := a.getDatasetMount(r.Context(), dsName)
		if err != nil {
			writeError(w, http.StatusNotFound, "not_found", "dataset not found")
			return
		}
		role, err := a.checkDatasetAccess(r, dsName, false)
		if err != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
			return
		}
		cleanedSub := filepath.Clean("/" + subpath)
		cleanedSub = strings.TrimPrefix(cleanedSub, "/")
		cleanedSub = strings.TrimPrefix(cleanedSub, "\\")
		cleanTarget := filepath.Clean(filepath.Join(mount, cleanedSub))
		cleanMount := filepath.Clean(mount)
		if !strings.HasPrefix(strings.ToLower(cleanTarget), strings.ToLower(cleanMount)) {
			writeError(w, http.StatusForbidden, "forbidden", "đường dẫn không hợp lệ")
			return
		}
		info, err := os.Stat(cleanTarget)
		if err != nil {
			writeError(w, http.StatusNotFound, "not_found", "that item does not exist")
			return
		}
		itemType := "file"
		mimeType := mime.TypeByExtension(filepath.Ext(info.Name()))
		if info.IsDir() {
			itemType = "folder"
			mimeType = "application/x-directory"
		} else if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		category := string(models.CategoryOf(models.NodeType(itemType), mimeType, info.Name()))
		parentID := ""
		if subpath != "" {
			parentSub := filepath.ToSlash(filepath.Dir(subpath))
			if parentSub != "." && parentSub != "/" && parentSub != "" {
				parentID = fmt.Sprintf("dataset:%s:%s", dsName, parentSub)
			} else {
				parentID = fmt.Sprintf("dataset:%s", dsName)
			}
		}
		writeJSON(w, http.StatusOK, nodeDTO{
			ID:        nodeID,
			ParentID:  parentID,
			Name:      info.Name(),
			Type:      itemType,
			Category:  category,
			MimeType:  mimeType,
			SizeBytes: info.Size(),
			Role:      role,
			CreatedAt: info.ModTime().UnixMilli(),
			UpdatedAt: info.ModTime().UnixMilli(),
		})
		return
	}
	userID, _ := caller(r)
	view, err := a.files.GetView(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		a.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, nodeView(view, userID))
}

func (a *API) handleNodePath(w http.ResponseWriter, r *http.Request) {
	nodeID := a.extractNodeID(r, "path")
	if strings.HasPrefix(nodeID, "dataset:") {
		parts := strings.SplitN(strings.TrimPrefix(nodeID, "dataset:"), ":", 2)
		dsName := parts[0]
		subpath := ""
		if len(parts) > 1 {
			subpath = parts[1]
		}
		if unescaped, err := url.PathUnescape(dsName); err == nil {
			dsName = unescaped
		}
		if unescaped, err := url.PathUnescape(subpath); err == nil {
			subpath = unescaped
		}
		dsName, _, err := a.getDatasetMount(r.Context(), dsName)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		role, err := a.checkDatasetAccess(r, dsName, false)
		if err != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
			return
		}
		var chain []nodeDTO
		chain = append(chain, nodeDTO{
			ID:       fmt.Sprintf("dataset:%s", dsName),
			ParentID: "",
			Name:     dsName,
			Type:     "folder",
			Category: "folder",
			MimeType: "application/x-directory",
			Role:     role,
		})
		if subpath != "" {
			subSegments := strings.Split(filepath.ToSlash(subpath), "/")
			accum := ""
			for _, seg := range subSegments {
				if seg == "" {
					continue
				}
				if accum == "" {
					accum = seg
				} else {
					accum = accum + "/" + seg
				}
				chain = append(chain, nodeDTO{
					ID:       fmt.Sprintf("dataset:%s:%s", dsName, accum),
					ParentID: fmt.Sprintf("dataset:%s", dsName),
					Name:     seg,
					Type:     "folder",
					Category: "folder",
					MimeType: "application/x-directory",
					Role:     role,
				})
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"path": chain})
		return
	}
	userID, _ := caller(r)
	chain, err := a.files.PathTo(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		a.fail(w, r, err)
		return
	}
	out := make([]nodeDTO, 0, len(chain))
	for _, n := range chain {
		out = append(out, plainNode(n))
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": out})
}

type patchNodeRequest struct {
	Name     *string `json:"name"`
	ParentID *string `json:"parent_id"`
	Color    *string `json:"color"`
}

// handlePatchNode covers rename, move, and recolor, each with its own
// capability check inside the files service.
func (a *API) handlePatchNode(w http.ResponseWriter, r *http.Request) {
	var req patchNodeRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	userID, ip := caller(r)
	nodeID := a.extractNodeID(r, "")

	if strings.HasPrefix(nodeID, "dataset:") {
		parts := strings.SplitN(strings.TrimPrefix(nodeID, "dataset:"), ":", 2)
		dsName := parts[0]
		subpath := ""
		if len(parts) > 1 {
			subpath = parts[1]
		}
		if unescaped, err := url.PathUnescape(dsName); err == nil {
			dsName = unescaped
		}
		if unescaped, err := url.PathUnescape(subpath); err == nil {
			subpath = unescaped
		}
		dsName, mount, err := a.getDatasetMount(r.Context(), dsName)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		role, err := a.checkDatasetAccess(r, dsName, true)
		if err != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
			return
		}
		if req.Name != nil {
			newName := strings.TrimSpace(*req.Name)
			if newName == "" || strings.ContainsAny(newName, `/\:*"<>|`) {
				a.fail(w, r, fmt.Errorf("tên mới không hợp lệ"))
				return
			}
			cleanSub := filepath.Clean("/" + subpath)
			cleanSub = strings.TrimPrefix(cleanSub, "/")
			cleanSub = strings.TrimPrefix(cleanSub, "\\")
			oldTarget := filepath.Clean(filepath.Join(mount, cleanSub))
			newTarget := filepath.Clean(filepath.Join(filepath.Dir(oldTarget), newName))
			cleanMount := filepath.Clean(mount)
			if !strings.HasPrefix(strings.ToLower(oldTarget), strings.ToLower(cleanMount)) ||
				!strings.HasPrefix(strings.ToLower(newTarget), strings.ToLower(cleanMount)) {
				a.fail(w, r, fmt.Errorf("đường dẫn không hợp lệ"))
				return
			}
			if err := os.Rename(oldTarget, newTarget); err != nil {
				a.fail(w, r, err)
				return
			}
			parentSub := filepath.ToSlash(filepath.Dir(cleanSub))
			newSub := newName
			if parentSub != "." && parentSub != "/" && parentSub != "" {
				newSub = parentSub + "/" + newName
			}
			writeJSON(w, http.StatusOK, nodeDTO{
				ID:        fmt.Sprintf("dataset:%s:%s", dsName, newSub),
				ParentID:  fmt.Sprintf("dataset:%s", dsName),
				Name:      newName,
				Role:      role,
				UpdatedAt: time.Now().UnixMilli(),
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
		return
	}

	var (
		node models.Node
		err  error
		did  bool
	)
	if req.Name != nil {
		node, err = a.files.Rename(r.Context(), files.RenameParams{
			UserID: userID, NodeID: nodeID, Name: *req.Name, IP: ip,
		})
		if err != nil {
			a.fail(w, r, err)
			return
		}
		did = true
	}
	if req.ParentID != nil {
		node, err = a.files.Move(r.Context(), files.MoveParams{
			UserID: userID, NodeID: nodeID, ParentID: *req.ParentID, IP: ip,
		})
		if err != nil {
			a.fail(w, r, err)
			return
		}
		did = true
	}
	if req.Color != nil {
		node, err = a.files.Recolor(r.Context(), userID, nodeID, *req.Color, ip)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		did = true
	}
	if !did {
		writeError(w, http.StatusBadRequest, "invalid_request", "nothing to change")
		return
	}
	writeJSON(w, http.StatusOK, plainNode(node))
}

func (a *API) handleTrashNode(w http.ResponseWriter, r *http.Request) {
	nodeID := a.extractNodeID(r, "")
	if strings.HasPrefix(nodeID, "dataset:") {
		a.handleDeleteDatasetItem(w, r)
		return
	}
	userID, ip := caller(r)
	node, err := a.files.Trash(r.Context(), userID, chi.URLParam(r, "id"), ip)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, plainNode(node))
}

func (a *API) handleRestoreNode(w http.ResponseWriter, r *http.Request) {
	userID, ip := caller(r)
	node, err := a.files.Restore(r.Context(), userID, chi.URLParam(r, "id"), ip)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, plainNode(node))
}

func (a *API) handleDeleteNode(w http.ResponseWriter, r *http.Request) {
	nodeID := a.extractNodeID(r, "")
	if strings.HasPrefix(nodeID, "dataset:") {
		a.handleDeleteDatasetItem(w, r)
		return
	}
	userID, ip := caller(r)
	if err := a.files.PermanentDelete(r.Context(), userID, chi.URLParam(r, "id"), ip); err != nil {
		a.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) handleStar(w http.ResponseWriter, r *http.Request) {
	userID, _ := caller(r)
	if err := a.files.Star(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		a.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) handleUnstar(w http.ResponseWriter, r *http.Request) {
	userID, _ := caller(r)
	if err := a.files.Unstar(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		a.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) extractNodeID(r *http.Request, suffix string) string {
	id := chi.URLParam(r, "id")
	if id == "" {
		wildcard := chi.URLParam(r, "*")
		if wildcard != "" {
			if suffix != "" && strings.HasSuffix(wildcard, "/"+suffix) {
				id = strings.TrimSuffix(wildcard, "/"+suffix)
			} else {
				id = wildcard
			}
		}
	}
	if unescaped, err := url.PathUnescape(id); err == nil {
		id = unescaped
	}
	return id
}

// handleFolderPreview returns up to four thumbnail urls for the content peek
// on a folder's icon.
func (a *API) handleFolderPreview(w http.ResponseWriter, r *http.Request) {
	nodeID := a.extractNodeID(r, "preview")
	if strings.HasPrefix(nodeID, "dataset:") {
		writeJSON(w, http.StatusOK, map[string]any{"previews": []any{}})
		return
	}
	userID, _ := caller(r)
	children, err := a.files.Preview(r.Context(), userID, nodeID)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(children))
	for _, n := range children {
		out = append(out, map[string]any{
			"node_id":       n.ID,
			"thumbnail_url": fmt.Sprintf("/api/v1/nodes/%s/thumbnail", n.ID),
			"category":      string(models.CategoryOf(n.Type, n.MimeType, n.Name)),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"previews": out})
}

// handleDownload streams a file, honoring Range so video scrubbing and
// resumed downloads work without reading anything into memory.
func (a *API) handleDownload(w http.ResponseWriter, r *http.Request) {
	nodeID := a.extractNodeID(r, "download")
	if strings.HasPrefix(nodeID, "dataset:") {
		parts := strings.SplitN(strings.TrimPrefix(nodeID, "dataset:"), ":", 2)
		dsName := parts[0]
		subpath := ""
		if len(parts) > 1 {
			subpath = parts[1]
		}
		if unescaped, err := url.PathUnescape(dsName); err == nil {
			dsName = unescaped
		}
		if unescaped, err := url.PathUnescape(subpath); err == nil {
			subpath = unescaped
		}
		dsName, mount, err := a.getDatasetMount(r.Context(), dsName)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		_, err = a.checkDatasetAccess(r, dsName, false)
		if err != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
			return
		}
		cleanedSub := filepath.Clean("/" + subpath)
		cleanedSub = strings.TrimPrefix(cleanedSub, "/")
		cleanedSub = strings.TrimPrefix(cleanedSub, "\\")
		cleanTarget := filepath.Clean(filepath.Join(mount, cleanedSub))
		cleanMount := filepath.Clean(mount)
		if !strings.HasPrefix(strings.ToLower(cleanTarget), strings.ToLower(cleanMount)) {
			a.fail(w, r, fmt.Errorf("đường dẫn không hợp lệ"))
			return
		}
		f, err := os.Open(cleanTarget)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		defer f.Close()
		info, err := f.Stat()
		if err != nil {
			a.fail(w, r, err)
			return
		}
		filename := filepath.Base(cleanTarget)
		mimeType := mime.TypeByExtension(filepath.Ext(filename))
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		disposition := "attachment"
		if boolQuery(r, "inline") {
			disposition = "inline"
		}
		w.Header().Set("Content-Type", mimeType)
		w.Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"; filename*=UTF-8''%s`,
			disposition, sanitizeFilename(filename), url.PathEscape(filename)))
		w.Header().Set("Accept-Ranges", "bytes")
		http.ServeContent(w, r, filename, info.ModTime(), f)
		return
	}

	userID, ip := caller(r)
	node, f, info, err := a.files.OpenForDownload(r.Context(), userID, nodeID)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	defer f.Close()

	a.audit.Record(r.Context(), audit.Entry{
		UserID: userID, NodeID: node.ID, Action: audit.ActionNodeDownloaded, IP: ip,
		Metadata: map[string]any{"name": node.Name},
	})
	serveNode(w, r, node, f, info, boolQuery(r, "inline"))
}

// serveNode is the one place a file's bytes reach the network, shared by the
// authenticated download and the public share download.
func serveNode(w http.ResponseWriter, r *http.Request, node models.Node, f *os.File, info os.FileInfo, inline bool) {
	contentType := node.MimeType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	disposition := "attachment"
	if inline && models.Previewable(models.CategoryOf(node.Type, node.MimeType, node.Name)) {
		disposition = "inline"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"; filename*=UTF-8''%s`,
		disposition, sanitizeFilename(node.Name), url.PathEscape(node.Name)))
	w.Header().Set("Accept-Ranges", "bytes")

	// the path is the content hash, so the bytes behind this url can never
	// change; that makes an immutable cache entry correct rather than risky
	if node.ChecksumSHA256 != "" {
		w.Header().Set("ETag", `"`+node.ChecksumSHA256+`"`)
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	}
	modTime := info.ModTime()
	if node.UpdatedAt > 0 {
		modTime = time.UnixMilli(node.UpdatedAt)
	}
	http.ServeContent(w, r, node.Name, modTime, f)
}

func sanitizeFilename(name string) string {
	replacer := strings.NewReplacer(`"`, "", "\\", "", "\r", "", "\n", "")
	return replacer.Replace(name)
}

func (a *API) handleThumbnail(w http.ResponseWriter, r *http.Request) {
	nodeID := a.extractNodeID(r, "thumbnail")
	if strings.HasPrefix(nodeID, "dataset:") {
		parts := strings.SplitN(strings.TrimPrefix(nodeID, "dataset:"), ":", 2)
		dsName := parts[0]
		subpath := ""
		if len(parts) > 1 {
			subpath = parts[1]
		}
		if unescaped, err := url.PathUnescape(dsName); err == nil {
			dsName = unescaped
		}
		if unescaped, err := url.PathUnescape(subpath); err == nil {
			subpath = unescaped
		}
		dsName, mount, err := a.getDatasetMount(r.Context(), dsName)
		if err != nil {
			writeError(w, http.StatusNotFound, "no_thumbnail", "dataset not found")
			return
		}
		_, err = a.checkDatasetAccess(r, dsName, false)
		if err != nil {
			writeError(w, http.StatusForbidden, "forbidden", err.Error())
			return
		}
		cleanTarget := filepath.Clean(filepath.Join(mount, filepath.Clean("/"+subpath)))
		if !strings.HasPrefix(strings.ToLower(cleanTarget), strings.ToLower(filepath.Clean(mount))) {
			writeError(w, http.StatusForbidden, "forbidden", "đường dẫn không hợp lệ")
			return
		}
		ext := strings.ToLower(filepath.Ext(cleanTarget))
		if ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp" || ext == ".gif" {
			http.ServeFile(w, r, cleanTarget)
			return
		}
		writeError(w, http.StatusNotFound, "no_thumbnail", "this file has no preview")
		return
	}

	userID, _ := caller(r)
	node, path, err := a.files.ThumbnailPath(r.Context(), userID, nodeID)
	if err != nil {
		// a missing preview is normal: the client falls back to a type badge
		writeError(w, http.StatusNotFound, "no_thumbnail", "this file has no preview")
		return
	}
	serveThumbnail(w, r, node, path)
}

// handleNodeWildcard dispatches wildcard node routes (e.g. /nodes/dataset:.../download)
func (a *API) handleNodeWildcard(w http.ResponseWriter, r *http.Request) {
	wildcard := chi.URLParam(r, "*")
	if wildcard == "" {
		writeError(w, http.StatusNotFound, "not_found", "no such node")
		return
	}

	if strings.HasSuffix(wildcard, "/download") {
		a.handleDownload(w, r)
		return
	}
	if strings.HasSuffix(wildcard, "/thumbnail") {
		a.handleThumbnail(w, r)
		return
	}
	if strings.HasSuffix(wildcard, "/preview") {
		a.handleFolderPreview(w, r)
		return
	}
	if strings.HasSuffix(wildcard, "/path") {
		a.handleNodePath(w, r)
		return
	}

	a.handleGetNode(w, r)
}

func (a *API) handleNodeWildcardPatch(w http.ResponseWriter, r *http.Request) {
	a.handlePatchNode(w, r)
}

func (a *API) handleNodeWildcardDelete(w http.ResponseWriter, r *http.Request) {
	a.handleDeleteNode(w, r)
}

func serveThumbnail(w http.ResponseWriter, r *http.Request, node models.Node, path string) {
	f, err := os.Open(path)
	if err != nil {
		writeError(w, http.StatusNotFound, "no_thumbnail", "this file has no preview")
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		writeError(w, http.StatusNotFound, "no_thumbnail", "this file has no preview")
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	if node.ChecksumSHA256 != "" {
		w.Header().Set("ETag", `"thumb-`+node.ChecksumSHA256+`"`)
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	}
	http.ServeContent(w, r, "thumbnail.jpg", info.ModTime(), f)
}

func (a *API) handleListVersions(w http.ResponseWriter, r *http.Request) {
	userID, _ := caller(r)
	versions, err := a.files.Versions(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		a.fail(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(versions))
	for _, v := range versions {
		out = append(out, map[string]any{
			"id":         v.ID,
			"size_bytes": v.SizeBytes,
			"mime_type":  v.MimeType,
			"created_by": v.CreatedBy,
			"created_at": v.CreatedAt,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"versions": out})
}

func (a *API) handleRestoreVersion(w http.ResponseWriter, r *http.Request) {
	userID, ip := caller(r)
	node, err := a.files.RestoreVersion(r.Context(), userID,
		chi.URLParam(r, "id"), chi.URLParam(r, "vid"), ip)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, plainNode(node))
}

func (a *API) handleListTrash(w http.ResponseWriter, r *http.Request) {
	userID, _ := caller(r)
	limit := intQuery(r, "limit", 50)
	offset := intQuery(r, "offset", 0)
	list, err := a.files.ListTrash(r.Context(), userID, limit, offset)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	cfg := a.settings.Get()
	writeJSON(w, http.StatusOK, map[string]any{
		"nodes":          nodeViews(list, userID),
		"retention_days": cfg.TrashRetentionDays,
		"limit":          limit,
		"offset":         offset,
		"has_more":       len(list) == limit,
		"next_offset":    offset + len(list),
	})
}

func (a *API) handleActivity(w http.ResponseWriter, r *http.Request) {
	user, _ := mw.UserFrom(r.Context())
	adminAll := user.IsAdmin() && boolQuery(r, "all")
	limit := intQuery(r, "limit", 50)
	before := int64Query(r, "before", 0)
	list, err := a.audit.List(r.Context(), audit.ListOptions{
		UserID:   user.ID,
		NodeID:   strings.TrimSpace(r.URL.Query().Get("node_id")),
		Action:   strings.TrimSpace(r.URL.Query().Get("action")),
		Limit:    limit,
		Before:   before,
		AdminAll: adminAll,
	})
	if err != nil {
		a.fail(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(list))
	var nextCursor int64
	for _, entry := range list {
		out = append(out, map[string]any{
			"id":         entry.ID,
			"user_id":    entry.UserID,
			"node_id":    entry.NodeID,
			"action":     entry.Action,
			"metadata":   entry.Metadata,
			"created_at": entry.CreatedAt,
		})
		nextCursor = entry.CreatedAt
	}
	hasMore := len(list) == limit
	writeJSON(w, http.StatusOK, map[string]any{
		"activity":    out,
		"limit":       limit,
		"has_more":    hasMore,
		"next_cursor": nextCursor,
	})
}
