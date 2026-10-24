package httpapi

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io/fs"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/sync/singleflight"

	"github.com/MultiX0/LocalDrive/server/internal/audit"
	"github.com/MultiX0/LocalDrive/server/internal/config"
	"github.com/MultiX0/LocalDrive/server/internal/files"
	mw "github.com/MultiX0/LocalDrive/server/internal/middleware"
	"github.com/MultiX0/LocalDrive/server/internal/models"
)

type dirListCacheEntry struct {
	nodes     []nodeDTO
	timestamp time.Time
}

type mediaCacheEntry struct {
	nodes     []nodeDTO
	timestamp time.Time
}

var (
	datasetThumbGroup singleflight.Group
	datasetThumbSem   = make(chan struct{}, 64) // max 64 concurrent thumbnail jobs
	mediaScanGroup    singleflight.Group

	dirListCacheMu sync.RWMutex
	dirListCache   = make(map[string]dirListCacheEntry)

	mediaCacheMu sync.RWMutex
	mediaCache   = make(map[string]mediaCacheEntry)
)

func getCachedDirList(key string) ([]nodeDTO, bool) {
	dirListCacheMu.RLock()
	defer dirListCacheMu.RUnlock()
	entry, ok := dirListCache[key]
	if ok && time.Since(entry.timestamp) < 60*time.Second {
		res := make([]nodeDTO, len(entry.nodes))
		copy(res, entry.nodes)
		return res, true
	}
	return nil, false
}

func setCachedDirList(key string, nodes []nodeDTO) {
	dirListCacheMu.Lock()
	defer dirListCacheMu.Unlock()
	res := make([]nodeDTO, len(nodes))
	copy(res, nodes)
	dirListCache[key] = dirListCacheEntry{nodes: res, timestamp: time.Now()}
}

func getCachedMediaList(key string) ([]nodeDTO, bool) {
	mediaCacheMu.RLock()
	defer mediaCacheMu.RUnlock()
	entry, ok := mediaCache[key]
	if ok && time.Since(entry.timestamp) < 5*time.Minute {
		res := make([]nodeDTO, len(entry.nodes))
		copy(res, entry.nodes)
		return res, true
	}
	return nil, false
}

func setCachedMediaList(key string, nodes []nodeDTO) {
	mediaCacheMu.Lock()
	defer mediaCacheMu.Unlock()
	res := make([]nodeDTO, len(nodes))
	copy(res, nodes)
	mediaCache[key] = mediaCacheEntry{nodes: res, timestamp: time.Now()}
}

func getCachedMediaScan(key string) ([]nodeDTO, bool) {
	return getCachedMediaList(key)
}

func setCachedMediaScan(key string, nodes []nodeDTO) {
	setCachedMediaList(key, nodes)
}

func invalidateAllCaches() {
	dirListCacheMu.Lock()
	dirListCache = make(map[string]dirListCacheEntry)
	dirListCacheMu.Unlock()

	mediaCacheMu.Lock()
	mediaCache = make(map[string]mediaCacheEntry)
	mediaCacheMu.Unlock()
}

func (a *API) handleListNodes(w http.ResponseWriter, r *http.Request) {
	userID, _ := caller(r)
	user, ok := mw.UserFrom(r.Context())
	isAdmin := ok && user.Role == models.RoleAdmin

	limit := intQuery(r, "limit", 50)
	if limit <= 0 {
		limit = 50
	} else if limit > 100000 {
		limit = 100000
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

	// 1. Phân tích danh mục được cấp quyền (userRoots)
	var userRoots []string
	hasFullRoot := isAdmin
	if ok && user.DatasetPermissions != "" && user.DatasetPermissions != "{}" {
		var perms map[string]any
		if err := json.Unmarshal([]byte(user.DatasetPermissions), &perms); err == nil {
			hasSlashOrStar := false
			if rootPerm, exists := perms["/"]; exists && rootPerm != nil && rootPerm != "none" {
				hasSlashOrStar = true
			}
			if starPerm, exists := perms["*"]; exists && starPerm != nil && starPerm != "none" {
				hasSlashOrStar = true
			}

			var rawKeys []string
			for k, v := range perms {
				if v == nil || v == "none" {
					continue
				}
				if s, ok := v.(string); ok && s == "none" {
					continue
				}
				if m, ok := v.(map[string]any); ok {
					if rVal, _ := m["read"].(bool); !rVal {
						continue
					}
				}
				kClean := strings.Trim(filepath.ToSlash(filepath.Clean("/"+k)), "/")
				if kClean != "" && kClean != "*" && kClean != "/" {
					rawKeys = append(rawKeys, kClean)
				}
			}

			// Nếu được chỉ định danh mục cụ thể và không phải là cấp quyền toàn cục "/" hoặc "*":
			if len(rawKeys) > 0 && !hasSlashOrStar {
				hasFullRoot = false
			}

			for _, k := range rawKeys {
				isChild := false
				kLower := strings.ToLower(k)
				for _, other := range rawKeys {
					oLower := strings.ToLower(other)
					if oLower != kLower && strings.HasPrefix(kLower, oLower+"/") {
						isChild = true
						break
					}
				}
				if !isChild {
					exists := false
					for _, ur := range userRoots {
						if strings.EqualFold(ur, k) {
							exists = true
							break
						}
					}
					if !exists {
						userRoots = append(userRoots, k)
					}
				}
			}
		}
	}

	// 1b. Xử lý riêng cho bộ lọc ảnh / video: Không bị phụ thuộc vào việc mở thư mục trong "Tệp của tôi",
	// và hỗ trợ quét toàn diện cả dataset, ZFS, libraries, thư mục localdrive và SQLite DB.
	isMediaFilter := opts.Filter == "image" || opts.Filter == "images" || opts.Filter == "gallery" ||
		opts.Filter == "video" || opts.Filter == "videos"
	if isMediaFilter {
		a.handleMediaNodes(w, r, userID, opts, userRoots, hasFullRoot)
		return
	}

	if !hasFullRoot {
		if len(userRoots) == 0 {
			writeJSON(w, http.StatusOK, map[string]any{
				"nodes":       []nodeDTO{},
				"limit":       opts.Limit,
				"offset":      opts.Offset,
				"has_more":    false,
				"next_offset": 0,
			})
			return
		}

		// Nếu người dùng chỉ được phân quyền duy nhất 1 danh mục (ví dụ DATA/KiyoVN) và đang vào gốc ("Tệp của tôi")
		// thì trỏ thẳng ParentID vào danh mục đó để hiển thị các tệp con bên trong!
		if (opts.ParentID == "" || opts.ParentID == "root") && (opts.Filter == "" || opts.Filter == "none") && len(userRoots) == 1 {
			opts.ParentID = "dataset:" + userRoots[0]
		}
	}

	// 2. Nếu đang xem trong một dataset hoặc thư mục con của dataset
	if strings.HasPrefix(opts.ParentID, "dataset:") {
		canonicalPath, dsName, subpath, mountPath, err := a.resolveDatasetTarget(r.Context(), opts.ParentID)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		role, err := a.checkDatasetAccess(r, canonicalPath, false)
		if err != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
			return
		}
		cleanTarget := filepath.Clean(mountPath)

		var allNodes []nodeDTO
		dirCacheKey := cleanTarget
		cachedDir, foundDir := getCachedDirList(dirCacheKey)
		if foundDir {
			allNodes = cachedDir
		} else {
			childDsNames := make(map[string]bool)

			// Thêm các tập dữ liệu con (child datasets) trực thuộc dataset này nếu đang ở thư mục gốc của dataset (subpath == "")
			if subpath == "" {
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
									allNodes = append(allNodes, nodeDTO{
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
				isSingleRoot := !hasFullRoot && len(userRoots) == 1 && strings.EqualFold(canonicalPath, userRoots[0])
				for _, entry := range entries {
					if childDsNames[strings.ToLower(entry.Name())] || isIgnoredFolder(entry.Name()) {
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
					relItemPath := filepath.ToSlash(filepath.Join(canonicalPath, entry.Name()))
					relItemPath = strings.TrimPrefix(relItemPath, "/")
					category := string(models.CategoryOf(models.NodeType(itemType), mimeType, entry.Name()))

					parentIDForNode := opts.ParentID
					if isSingleRoot {
						parentIDForNode = "" // Đặt rỗng để UI hiểu các tệp này hiển thị ở cấp gốc Tệp của tôi
					}

					hasThumb := category == "image" || category == "video"
					allNodes = append(allNodes, nodeDTO{
						ID:           fmt.Sprintf("dataset:%s", relItemPath),
						ParentID:     parentIDForNode,
						Name:         entry.Name(),
						Type:         itemType,
						Category:     category,
						MimeType:     mimeType,
						SizeBytes:    info.Size(),
						Role:         role,
						HasThumbnail: hasThumb,
						Previewable:  category == "image" || category == "video" || category == "audio",
						CreatedAt:    info.ModTime().UnixMilli(),
						UpdatedAt:    info.ModTime().UnixMilli(),
					})
				}
			}
			setCachedDirList(dirCacheKey, allNodes)
		}

		// Lọc theo tìm kiếm nếu có
		var filtered []nodeDTO
		qLower := strings.ToLower(opts.Query)
		if qLower != "" {
			for _, item := range allNodes {
				if strings.Contains(strings.ToLower(item.Name), qLower) {
					filtered = append(filtered, item)
				}
			}
		} else {
			filtered = allNodes
		}

		// Sắp xếp: Thư mục luôn đứng đầu, sau đó theo opts.SortBy ("name", "size", "updated")
		sort.Slice(filtered, func(i, j int) bool {
			if filtered[i].Type != filtered[j].Type {
				return filtered[i].Type == "folder"
			}
			switch opts.SortBy {
			case "name":
				if opts.SortDesc {
					return strings.ToLower(filtered[i].Name) > strings.ToLower(filtered[j].Name)
				}
				return strings.ToLower(filtered[i].Name) < strings.ToLower(filtered[j].Name)
			case "size":
				if opts.SortDesc {
					return filtered[i].SizeBytes > filtered[j].SizeBytes
				}
				return filtered[i].SizeBytes < filtered[j].SizeBytes
			default:
				if opts.SortDesc {
					return filtered[i].UpdatedAt > filtered[j].UpdatedAt
				}
				return filtered[i].UpdatedAt < filtered[j].UpdatedAt
			}
		})

		total := len(filtered)
		start := opts.Offset
		if start > total {
			start = total
		}
		end := start + opts.Limit
		if end > total {
			end = total
		}
		paged := filtered[start:end]
		writeJSON(w, http.StatusOK, map[string]any{
			"nodes":       paged,
			"limit":       opts.Limit,
			"offset":      opts.Offset,
			"has_more":    end < total,
			"next_offset": end,
			"total":       total,
		})
		return
	}

	// 3. Ở thư mục gốc (Root)
	if (opts.ParentID == "" || opts.ParentID == "root") && (opts.Filter == "" || opts.Filter == "none") {
		if !hasFullRoot {
			// Hiển thị chính xác các danh mục gốc được phân quyền cho người dùng (nếu có nhiều hơn 1)
			var rootNodes []nodeDTO
			for _, ur := range userRoots {
				role, accessErr := a.checkDatasetAccess(r, ur, false)
				if accessErr != nil {
					continue
				}
				slashParts := strings.Split(ur, "/")
				displayName := slashParts[len(slashParts)-1]
				rootNodes = append(rootNodes, nodeDTO{
					ID:        fmt.Sprintf("dataset:%s", ur),
					ParentID:  "",
					Name:      displayName,
					Type:      "folder",
					Category:  "folder",
					MimeType:  "application/x-directory",
					SizeBytes: 0,
					Role:      role,
					CreatedAt: time.Now().UnixMilli(),
					UpdatedAt: time.Now().UnixMilli(),
				})
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"nodes":       rootNodes,
				"limit":       opts.Limit,
				"offset":      opts.Offset,
				"has_more":    false,
				"next_offset": len(rootNodes),
			})
			return
		}

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
				dClean := strings.ToLower(strings.Trim(d.name, "/"))
				for _, other := range accessible {
					oClean := strings.ToLower(strings.Trim(other.name, "/"))
					if oClean != dClean && strings.HasPrefix(dClean, oClean+"/") {
						isChild = true
						break
					}
				}
				if !isChild {
					slashParts := strings.Split(strings.Trim(d.name, "/"), "/")
					displayName := slashParts[len(slashParts)-1]
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

			var combinedNodes []nodeDTO
			combinedNodes = append(combinedNodes, rootDsNodes...)
			dbList, dbErr := a.files.List(r.Context(), userID, files.ListOptions{
				ParentID: "",
				Filter:   "none",
				Query:    opts.Query,
				Limit:    opts.Limit,
				Offset:   opts.Offset,
				SortBy:   opts.SortBy,
				SortDesc: opts.SortDesc,
			})
			if dbErr == nil && len(dbList) > 0 {
				combinedNodes = append(combinedNodes, nodeViews(dbList, userID)...)
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"nodes":       combinedNodes,
				"limit":       opts.Limit,
				"offset":      opts.Offset,
				"has_more":    false,
				"next_offset": len(combinedNodes),
			})
			return
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

	if req.ParentID == "" || req.ParentID == "root" {
		user, uOk := mw.UserFrom(r.Context())
		if uOk && user.Role != models.RoleAdmin && user.DatasetPermissions != "" {
			var pMap map[string]any
			if err := json.Unmarshal([]byte(user.DatasetPermissions), &pMap); err == nil {
				var writeDatasets []string
				for k, v := range pMap {
					kClean := strings.Trim(k, "/")
					if kClean == "" || kClean == "*" {
						continue
					}
					canWrite := false
					if str, ok := v.(string); ok && (str == "editor" || str == "writer" || str == "owner") {
						canWrite = true
					} else if obj, ok := v.(map[string]any); ok {
						if wr, ok := obj["write"].(bool); ok && wr {
							canWrite = true
						} else if lvl, ok := obj["level"].(string); ok && (lvl == "editor" || lvl == "writer") {
							canWrite = true
						}
					}
					if canWrite {
						writeDatasets = append(writeDatasets, kClean)
					}
				}
				var uniqueRoots []string
				for _, ds := range writeDatasets {
					isSub := false
					for _, other := range writeDatasets {
						if other != ds && strings.HasPrefix(strings.ToLower(ds), strings.ToLower(other)+"/") {
							isSub = true
							break
						}
					}
					if !isSub {
						exists := false
						for _, u := range uniqueRoots {
							if strings.EqualFold(u, ds) {
								exists = true
								break
							}
						}
						if !exists {
							uniqueRoots = append(uniqueRoots, ds)
						}
					}
				}
				if len(uniqueRoots) == 1 {
					req.ParentID = "dataset:" + uniqueRoots[0]
				}
			}
		}
	}

	if strings.HasPrefix(req.ParentID, "dataset:") {
		canonicalPath, dsName, _, mountPath, err := a.resolveDatasetTarget(r.Context(), req.ParentID)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		role, err := a.checkDatasetAccess(r, canonicalPath, true)
		if err != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
			return
		}
		folderName := strings.TrimSpace(req.Name)
		if folderName == "" || strings.ContainsAny(folderName, `/\:*"<>|`) {
			a.fail(w, r, fmt.Errorf("tên thư mục không hợp lệ"))
			return
		}
		targetPath := filepath.Clean(filepath.Join(mountPath, folderName))
		cleanMount := filepath.Clean(mountPath)
		if !strings.HasPrefix(strings.ToLower(targetPath), strings.ToLower(cleanMount)) {
			a.fail(w, r, fmt.Errorf("đường dẫn không hợp lệ"))
			return
		}
		if err := os.MkdirAll(targetPath, 0755); err != nil {
			// Nếu bị read-only file system hoặc mount chứa zfs-recovery, tự động bỏ cờ readonly
			poolName := strings.Split(strings.Trim(dsName, "/"), "/")[0]
			_ = exec.Command("zfs", "set", "readonly=off", dsName).Run()
			_ = exec.Command("zfs", "set", "readonly=off", poolName).Run()
			_ = exec.Command("mount", "-o", "remount,rw", cleanMount).Run()
			_ = exec.Command("mount", "-o", "remount,rw", targetPath).Run()
			_ = exec.Command("mount", "-o", "remount,rw", filepath.Dir(targetPath)).Run()
			_ = exec.Command("mount", "-o", "remount,rw", "/mnt/zfs-recovery").Run()
			if retryErr := os.MkdirAll(targetPath, 0755); retryErr != nil {
				a.log.Error("mkdir failed", "path", targetPath, "error", retryErr)
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": fmt.Sprintf("Không thể tạo thư mục vật lý (%s): %v", folderName, retryErr)})
				return
			}
		}
		relPath := filepath.ToSlash(filepath.Join(canonicalPath, folderName))
		body := nodeDTO{
			ID:        fmt.Sprintf("dataset:%s", relPath),
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
		canonicalPath, _, _, mountPath, err := a.resolveDatasetTarget(r.Context(), nodeID)
		if err != nil {
			writeError(w, http.StatusNotFound, "not_found", "dataset not found")
			return
		}
		role, err := a.checkDatasetAccess(r, canonicalPath, false)
		if err != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
			return
		}
		cleanTarget := filepath.Clean(mountPath)
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
		if strings.Contains(canonicalPath, "/") {
			parentSub := filepath.ToSlash(filepath.Dir(canonicalPath))
			if parentSub != "." && parentSub != "/" && parentSub != "" {
				parentID = fmt.Sprintf("dataset:%s", parentSub)
			}
		}
		writeJSON(w, http.StatusOK, nodeDTO{
			ID:           fmt.Sprintf("dataset:%s", canonicalPath),
			ParentID:     parentID,
			Name:         info.Name(),
			Type:         itemType,
			Category:     category,
			MimeType:     mimeType,
			SizeBytes:    info.Size(),
			Role:         role,
			HasThumbnail: category == "image" || category == "video",
			Previewable:  category == "image" || category == "video" || category == "audio",
			CreatedAt:    info.ModTime().UnixMilli(),
			UpdatedAt:    info.ModTime().UnixMilli(),
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
		canonicalPath, _, _, _, err := a.resolveDatasetTarget(r.Context(), nodeID)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		var chain []nodeDTO
		segments := strings.Split(canonicalPath, "/")
		accum := ""
		for _, seg := range segments {
			if seg == "" {
				continue
			}
			if accum == "" {
				accum = seg
			} else {
				accum = accum + "/" + seg
			}
			cRole, cErr := a.checkDatasetAccess(r, accum, false)
			if cErr == nil {
				chain = append(chain, nodeDTO{
					ID:       fmt.Sprintf("dataset:%s", accum),
					ParentID: "",
					Name:     seg,
					Type:     "folder",
					Category: "folder",
					MimeType: "application/x-directory",
					Role:     cRole,
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
		canonicalPath, _, _, mountPath, err := a.resolveDatasetTarget(r.Context(), nodeID)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		role, err := a.checkDatasetAccess(r, canonicalPath, true)
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
			oldTarget := filepath.Clean(mountPath)
			newTarget := filepath.Clean(filepath.Join(filepath.Dir(oldTarget), newName))
			if err := os.Rename(oldTarget, newTarget); err != nil {
				a.fail(w, r, err)
				return
			}
			newCanonical := filepath.ToSlash(filepath.Join(filepath.Dir(canonicalPath), newName))
			newCanonical = strings.TrimPrefix(newCanonical, "/")
			writeJSON(w, http.StatusOK, nodeDTO{
				ID:        fmt.Sprintf("dataset:%s", newCanonical),
				ParentID:  "",
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
		canonicalPath, _, _, mountPath, err := a.resolveDatasetTarget(r.Context(), nodeID)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		_, err = a.checkDatasetAccess(r, canonicalPath, false)
		if err != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
			return
		}
		cleanTarget := filepath.Clean(mountPath)
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
		mimeType := models.MimeFromName(filename)
		if mimeType == "" {
			mimeType = mime.TypeByExtension(filepath.Ext(filename))
		}
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		disposition := "attachment"
		if boolQuery(r, "inline") || models.Previewable(models.CategoryOf(models.NodeFile, mimeType, filename)) {
			disposition = "inline"
		}
		w.Header().Set("Content-Type", mimeType)
		w.Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"; filename*=UTF-8''%s`,
			disposition, sanitizeFilename(filename), url.PathEscape(filename)))
		w.Header().Set("Accept-Ranges", "bytes")
		if disposition == "inline" {
			w.Header().Set("Cache-Control", "private, max-age=86400")
		}
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

func (a *API) handleMediaNodes(w http.ResponseWriter, r *http.Request, userID string, opts files.ListOptions, userRoots []string, hasFullRoot bool) {
	isImg := opts.Filter == "image" || opts.Filter == "images" || opts.Filter == "gallery"
	cacheKey := fmt.Sprintf("%s:%s", userID, opts.Filter)
	var mediaNodes []nodeDTO

	cached, found := getCachedMediaList(cacheKey)
	if found {
		mediaNodes = cached
	} else {
		res, err, _ := mediaScanGroup.Do(cacheKey, func() (any, error) {
			if c, ok := getCachedMediaList(cacheKey); ok {
				return c, nil
			}

			scanCtx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
			defer cancel()

			type scanTarget struct {
				canonical string
				mount     string
				role      string
			}
			var targets []scanTarget
			seenMounts := make(map[string]bool)

			addMountTarget := func(canonical, mount, role string) {
				cleanMount := filepath.Clean(mount)
				normMount := strings.ToLower(cleanMount)
				if seenMounts[normMount] {
					return
				}
				if fi, err := os.Stat(cleanMount); err == nil && fi.IsDir() {
					seenMounts[normMount] = true
					targets = append(targets, scanTarget{canonical: canonical, mount: cleanMount, role: role})
				}
			}

			if !hasFullRoot && len(userRoots) > 0 {
				// Người dùng chỉ có quyền trên một số danh mục cụ thể: chỉ quét đúng danh mục được cấp
				for _, root := range userRoots {
					role, accessErr := a.checkDatasetAccess(r, root, false)
					if accessErr != nil {
						continue
					}
					canonical, _, _, mount, err := a.resolveDatasetTarget(scanCtx, "dataset:"+root)
					if err == nil && mount != "" {
						addMountTarget(canonical, mount, role)
					}
				}
			} else {
				// 1. Quét toàn bộ các tập dữ liệu (datasets) trong CSDL mà tài khoản có quyền truy cập
				dRows, err := a.db.Read().QueryContext(scanCtx,
					`SELECT name, pool, mount FROM datasets WHERE status != 'deleted' ORDER BY name ASC`)
				if err == nil {
					defer dRows.Close()
					for dRows.Next() {
						var dName, dPool, dMount string
						if err := dRows.Scan(&dName, &dPool, &dMount); err == nil {
							role, accessErr := a.checkDatasetAccess(r, dName, false)
							if accessErr != nil {
								continue
							}
							realMount := a.resolveRealMountPath(dName, dMount)
							if realMount != "" {
								addMountTarget(dName, realMount, role)
							}
						}
					}
				}

				// 2. Quét toàn bộ các mảng lưu trữ (storage_pools) mà tài khoản có quyền
				pRows, err := a.db.Read().QueryContext(scanCtx, `SELECT name FROM storage_pools WHERE status != 'deleted'`)
				if err == nil {
					defer pRows.Close()
					for pRows.Next() {
						var pName string
						if err := pRows.Scan(&pName); err == nil {
							role, accessErr := a.checkDatasetAccess(r, pName, false)
							if accessErr != nil {
								continue
							}
							realMount := a.resolveRealMountPath(pName, "/mnt/"+pName)
							if realMount != "" {
								addMountTarget(pName, realMount, role)
							}
						}
					}
				}

				// 3. Nếu có công cụ OpenZFS, kiểm tra trực tiếp tất cả datasets thực tế đang mount trên hệ thống
				if hasZFSTools() {
					if out, err := exec.Command("zfs", "list", "-H", "-o", "name,mountpoint").Output(); err == nil {
						scanner := bufio.NewScanner(strings.NewReader(string(out)))
						for scanner.Scan() {
							parts := strings.Split(scanner.Text(), "\t")
							if len(parts) >= 2 {
								zName := strings.TrimSpace(parts[0])
								zMount := strings.TrimSpace(parts[1])
								if zMount != "" && zMount != "none" && zMount != "legacy" && !strings.Contains(zMount, "zfs-recovery") {
									role, accessErr := a.checkDatasetAccess(r, zName, false)
									if accessErr == nil {
										addMountTarget(zName, zMount, role)
									}
								}
							}
						}
					}
				}

				// 4. Quét các danh mục chỉ định cụ thể của người dùng (userRoots)
				for _, root := range userRoots {
					role, accessErr := a.checkDatasetAccess(r, root, false)
					if accessErr != nil {
						continue
					}
					canonical, _, _, mount, err := a.resolveDatasetTarget(scanCtx, "dataset:"+root)
					if err == nil && mount != "" {
						addMountTarget(canonical, mount, role)
					}
				}

				// 5. Quét tất cả các thư mục có sẵn trong /mnt (TrueNAS / Linux mount point tiêu chuẩn)
				if mntEntries, err := os.ReadDir("/mnt"); err == nil {
					for _, me := range mntEntries {
						if me.IsDir() {
							mPath := filepath.Join("/mnt", me.Name())
							role, accessErr := a.checkDatasetAccess(r, me.Name(), false)
							if accessErr == nil {
								addMountTarget(me.Name(), mPath, role)
							}
						}
					}
				}

				// 6. Quét các thư mục chia sẻ mạng (network_shares) trong CSDL
				sRows, sErr := a.db.Read().QueryContext(scanCtx, `SELECT name, path FROM network_shares WHERE status != 'deleted'`)
				if sErr == nil {
					defer sRows.Close()
					for sRows.Next() {
						var sName, sPath string
						if sRows.Scan(&sName, &sPath) == nil {
							role, accessErr := a.checkDatasetAccess(r, sName, false)
							if accessErr == nil {
								realP := a.resolveRealMountPath(sName, sPath)
								if realP != "" {
									addMountTarget(sName, realP, role)
								}
							}
						}
					}
				}

				// 7. Quét các thư viện lưu trữ (libraries)
				if a.libs != nil {
					if libList, lErr := a.libs.List(scanCtx); lErr == nil {
						for _, lib := range libList {
							if lib.Online() && lib.RootPath != "" {
								role := "viewer"
								if hasFullRoot {
									role = "admin"
								}
								addMountTarget("library:"+lib.ID, lib.RootPath, role)
							}
						}
					}
				}

				// 8. Quét Virtual Drive folder nếu có (trên Windows / client server)
				if vdf := files.GetVirtualDriveFolder(); vdf != "" {
					role := "viewer"
					if hasFullRoot {
						role = "admin"
					}
					addMountTarget("localdrive", vdf, role)
				}
			}

			// Tối ưu hóa: Loại bỏ các target con nếu target cha đã có trong danh sách
			sort.Slice(targets, func(i, j int) bool {
				return len(targets[i].mount) < len(targets[j].mount)
			})
			var uniqueTargets []scanTarget
			for _, t := range targets {
				tNorm := strings.ToLower(filepath.Clean(t.mount))
				isSub := false
				for _, u := range uniqueTargets {
					uNorm := strings.ToLower(filepath.Clean(u.mount))
					if tNorm == uNorm || strings.HasPrefix(tNorm, uNorm+string(filepath.Separator)) {
						isSub = true
						break
					}
				}
				if !isSub {
					uniqueTargets = append(uniqueTargets, t)
				}
			}
			targets = uniqueTargets

			var scannedNodes []nodeDTO
			seenFiles := make(map[string]bool)

			for _, tgt := range targets {
				cleanMount := filepath.Clean(tgt.mount)
				_ = filepath.WalkDir(cleanMount, func(path string, d fs.DirEntry, walkErr error) error {
					if walkErr != nil || d == nil {
						return nil
					}
					if d.IsDir() {
						lowerName := strings.ToLower(d.Name())
						if strings.HasPrefix(lowerName, "$") || strings.EqualFold(lowerName, "System Volume Information") || strings.EqualFold(lowerName, "$recycle.bin") {
							return filepath.SkipDir
						}
						switch lowerName {
						case "node_modules", ".git", ".next", ".cache", "dist-inno", "dist-installer", "release-installer", "release_assets", ".dart_tool", ".gradle", "windows-installer", "windows-app", "appdata", "windows", "program files", "program files (x86)", "programdata", "proc", "sys", "dev", "run", "var", "etc", "usr", "boot":
							return filepath.SkipDir
						}
						return nil
					}
					normFilePath := strings.ToLower(filepath.Clean(path))
					if seenFiles[normFilePath] {
						return nil
					}
					ext := strings.ToLower(filepath.Ext(d.Name()))
					var matchedCategory string
					var mimeType string
					if isImg {
						switch ext {
						case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".bmp", ".tiff", ".tif", ".svg", ".ico", ".avif", ".raw", ".cr2", ".nef", ".arw", ".dng", ".psd", ".ai", ".jfif", ".jpe":
							matchedCategory = "image"
							mimeType = mime.TypeByExtension(ext)
							if mimeType == "" {
								mimeType = "image/" + strings.TrimPrefix(ext, ".")
							}
						}
					} else {
						// Tuyệt đối không lấy file .ts hoặc .tsx cho video!
						if ext != ".ts" && ext != ".tsx" {
							switch ext {
							case ".mp4", ".mkv", ".mov", ".avi", ".webm", ".flv", ".wmv", ".m4v", ".3gp", ".m2ts", ".mts", ".vob", ".ogv", ".rmvb", ".rm", ".asf", ".divx":
								matchedCategory = "video"
								mimeType = mime.TypeByExtension(ext)
								if mimeType == "" {
									mimeType = "video/" + strings.TrimPrefix(ext, ".")
								}
							}
						}
					}
					if matchedCategory == "" {
						return nil
					}
					info, err := d.Info()
					if err != nil {
						return nil
					}
					seenFiles[normFilePath] = true
					rel, rErr := filepath.Rel(cleanMount, path)
					if rErr != nil {
						return nil
					}
					relItemPath := filepath.ToSlash(filepath.Join(tgt.canonical, rel))
					relItemPath = strings.TrimPrefix(relItemPath, "/")
					scannedNodes = append(scannedNodes, nodeDTO{
						ID:           fmt.Sprintf("dataset:%s", relItemPath),
						ParentID:     fmt.Sprintf("dataset:%s", tgt.canonical),
						Name:         d.Name(),
						Type:         "file",
						Category:     matchedCategory,
						MimeType:     mimeType,
						SizeBytes:    info.Size(),
						Role:         tgt.role,
						HasThumbnail: true,
						Previewable:  true,
						CreatedAt:    info.ModTime().UnixMilli(),
						UpdatedAt:    info.ModTime().UnixMilli(),
					})
					return nil
				})
			}

			// Kết hợp với các tệp có sẵn trong SQLite database
			dbList, dbErr := a.files.List(scanCtx, userID, files.ListOptions{
				Filter:   opts.Filter,
				Limit:    100000,
				AllUsers: hasFullRoot,
			})
			if dbErr == nil {
				for _, v := range nodeViews(dbList, userID) {
					// Bỏ qua .ts và .tsx nếu là video
					if !isImg && (strings.HasSuffix(strings.ToLower(v.Name), ".ts") || strings.HasSuffix(strings.ToLower(v.Name), ".tsx")) {
						continue
					}
					scannedNodes = append(scannedNodes, v)
				}
			}

			setCachedMediaList(cacheKey, scannedNodes)
			return scannedNodes, nil
		})
		if err == nil && res != nil {
			mediaNodes = res.([]nodeDTO)
		}
	}

	// Lọc theo tìm kiếm
	var filtered []nodeDTO
	qLower := strings.ToLower(opts.Query)
	if qLower != "" {
		for _, item := range mediaNodes {
			if strings.Contains(strings.ToLower(item.Name), qLower) {
				filtered = append(filtered, item)
			}
		}
	} else {
		filtered = mediaNodes
	}

	sort.Slice(filtered, func(i, j int) bool {
		if opts.SortBy == "name" {
			if opts.SortDesc {
				return strings.ToLower(filtered[i].Name) > strings.ToLower(filtered[j].Name)
			}
			return strings.ToLower(filtered[i].Name) < strings.ToLower(filtered[j].Name)
		}
		if opts.SortDesc {
			return filtered[i].UpdatedAt > filtered[j].UpdatedAt
		}
		return filtered[i].UpdatedAt < filtered[j].UpdatedAt
	})

	total := len(filtered)
	start := opts.Offset
	if start > total {
		start = total
	}
	end := start + opts.Limit
	if end > total {
		end = total
	}
	paged := filtered[start:end]
	writeJSON(w, http.StatusOK, map[string]any{
		"nodes":       paged,
		"limit":       opts.Limit,
		"offset":      opts.Offset,
		"has_more":    end < total,
		"next_offset": end,
		"total":       total,
	})
}

func (a *API) handleThumbnail(w http.ResponseWriter, r *http.Request) {
	nodeID := a.extractNodeID(r, "thumbnail")
	if strings.HasPrefix(nodeID, "dataset:") {
		canonicalPath, _, _, mountPath, err := a.resolveDatasetTarget(r.Context(), nodeID)
		if err != nil {
			writeError(w, http.StatusNotFound, "no_thumbnail", "dataset not found")
			return
		}
		_, err = a.checkDatasetAccess(r, canonicalPath, false)
		if err != nil {
			writeError(w, http.StatusForbidden, "forbidden", err.Error())
			return
		}
		a.serveDatasetThumbnail(w, r, filepath.Clean(mountPath))
		return
	}

	userID, _ := caller(r)
	node, path, err := a.files.ThumbnailPath(r.Context(), userID, nodeID)
	if err == nil {
		serveThumbnail(w, r, node, path)
		return
	}
	// Fallback for image node if thumbnail file is missing: serve original content
	if n, f, info, oErr := a.files.OpenForDownload(r.Context(), userID, nodeID); oErr == nil && strings.HasPrefix(n.MimeType, "image/") {
		defer f.Close()
		w.Header().Set("Content-Type", n.MimeType)
		w.Header().Set("Cache-Control", "public, max-age=86400")
		http.ServeContent(w, r, n.Name, info.ModTime(), f)
		return
	}
	writeError(w, http.StatusNotFound, "no_thumbnail", "this file has no preview")
}

func (a *API) serveDatasetThumbnail(w http.ResponseWriter, r *http.Request, cleanTarget string) {
	info, err := os.Stat(cleanTarget)
	if err != nil || info.IsDir() {
		writeError(w, http.StatusNotFound, "no_thumbnail", "file not found")
		return
	}

	ext := strings.ToLower(filepath.Ext(cleanTarget))
	mimeType := models.MimeFromName(cleanTarget)
	if mimeType == "" {
		mimeType = mime.TypeByExtension(ext)
	}
	cat := models.CategoryOf(models.NodeFile, mimeType, cleanTarget)
	if cat != models.CategoryImage && cat != models.CategoryVideo && cat != models.CategoryPDF {
		writeError(w, http.StatusNotFound, "no_thumbnail", "this file has no preview")
		return
	}

	// For tiny images (under 60KB), serve immediately with long cache
	if info.Size() <= 60*1024 && (ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" || ext == ".gif") {
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
		http.ServeFile(w, r, cleanTarget)
		return
	}

	// Generate persistent cache key based on path, mod time and size
	keyRaw := fmt.Sprintf("%s:%d:%d", cleanTarget, info.ModTime().UnixNano(), info.Size())
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(keyRaw)))

	dataDir := config.DataDirFor(a.cfg.DBPath)
	cacheDir := filepath.Join(dataDir, "cache", "thumbnails")
	cacheSubdir := filepath.Join(cacheDir, hash[:2])
	cacheFile := filepath.Join(cacheSubdir, hash+".jpg")

	// 1. Instant cache hit from disk
	if cinfo, err := os.Stat(cacheFile); err == nil && cinfo.Size() > 0 {
		cf, err := os.Open(cacheFile)
		if err == nil {
			defer cf.Close()
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("ETag", `"thumb-`+hash+`"`)
			w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
			http.ServeContent(w, r, "thumbnail.jpg", cinfo.ModTime(), cf)
			return
		}
	}

	if a.thumbs == nil {
		if cat == models.CategoryImage && info.Size() <= 2*1024*1024 {
			w.Header().Set("Cache-Control", "private, max-age=86400")
			http.ServeFile(w, r, cleanTarget)
			return
		}
		writeError(w, http.StatusNotFound, "no_thumbnail", "no thumbnail generator available")
		return
	}

	// 2. Generate thumbnail with concurrency limiter and singleflight deduplication
	_, _, _ = datasetThumbGroup.Do(hash, func() (any, error) {
		// Recheck if created by a racing request
		if cinfo, err := os.Stat(cacheFile); err == nil && cinfo.Size() > 0 {
			return nil, nil
		}

		// Acquire semaphore slot with timeout
		select {
		case datasetThumbSem <- struct{}{}:
			defer func() { <-datasetThumbSem }()
		case <-r.Context().Done():
			return nil, r.Context().Err()
		case <-time.After(30 * time.Second):
			return nil, fmt.Errorf("thumbnail queue timeout")
		}

		ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
		defer cancel()

		thumbBytes, err := a.thumbs.Generate(ctx, cleanTarget, mimeType)
		if err != nil || len(thumbBytes) == 0 {
			return nil, err
		}

		_ = os.MkdirAll(cacheSubdir, 0755)
		tmpFile, tmpErr := os.CreateTemp(cacheSubdir, "thumb-*.tmp")
		if tmpErr == nil {
			_, _ = tmpFile.Write(thumbBytes)
			_ = tmpFile.Close()
			_ = os.Rename(tmpFile.Name(), cacheFile)
		}
		return nil, nil
	})

	// 3. Check if cached file is now available and serve
	if cinfo, err := os.Stat(cacheFile); err == nil && cinfo.Size() > 0 {
		cf, err := os.Open(cacheFile)
		if err == nil {
			defer cf.Close()
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("ETag", `"thumb-`+hash+`"`)
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			http.ServeContent(w, r, "thumbnail.jpg", cinfo.ModTime(), cf)
			return
		}
	}

	// 4. Graceful fallback for images: serve original image directly with client cache
	if cat == models.CategoryImage {
		w.Header().Set("Cache-Control", "public, max-age=86400")
		http.ServeFile(w, r, cleanTarget)
		return
	}

	writeError(w, http.StatusNotFound, "no_thumbnail", "this file has no preview")
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
