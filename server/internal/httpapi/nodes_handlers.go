package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
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
	"github.com/MultiX0/LocalDrive/server/internal/ws"
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
	datasetThumbGroup     singleflight.Group
	datasetImageThumbSem = make(chan struct{}, 32) // max 32 concurrent image thumbnail jobs
	datasetVideoThumbSem = make(chan struct{}, 4)  // max 4 concurrent video ffmpeg frame extraction jobs
	mediaScanGroup        singleflight.Group

	dirListCacheMu sync.RWMutex
	dirListCache   = make(map[string]dirListCacheEntry)

	mediaCacheMu sync.RWMutex
	mediaCache   = make(map[string]mediaCacheEntry)
)

func getCachedDirList(key string) ([]nodeDTO, bool) {
	dirListCacheMu.RLock()
	defer dirListCacheMu.RUnlock()
	entry, ok := dirListCache[key]
	if ok && time.Since(entry.timestamp) < 15*time.Minute {
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
	if ok {
		if len(entry.nodes) == 0 {
			if time.Since(entry.timestamp) < 2*time.Minute {
				return entry.nodes, true
			}
			return nil, false
		}
		if time.Since(entry.timestamp) < 24*time.Hour {
			return entry.nodes, true
		}
	}
	return nil, false
}

func isMediaCacheStale(key string) bool {
	mediaCacheMu.RLock()
	defer mediaCacheMu.RUnlock()
	entry, ok := mediaCache[key]
	if !ok {
		return true
	}
	return time.Since(entry.timestamp) > 30*time.Minute
}

func setCachedMediaList(key string, nodes []nodeDTO) {
	mediaCacheMu.Lock()
	defer mediaCacheMu.Unlock()
	mediaCache[key] = mediaCacheEntry{nodes: nodes, timestamp: time.Now()}
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
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
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
			if hasSlashOrStar {
				hasFullRoot = true
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
				validEntries := make([]fs.DirEntry, 0, len(entries))
				for _, entry := range entries {
					if childDsNames[strings.ToLower(entry.Name())] || isIgnoredFolder(entry.Name()) {
						continue
					}
					validEntries = append(validEntries, entry)
				}

				totalValid := len(validEntries)
				parsedNodes := make([]nodeDTO, totalValid)
				hasNode := make([]bool, totalValid)

				workers := runtime.NumCPU() * 4
				if workers < 8 {
					workers = 8
				}
				if workers > 32 {
					workers = 32
				}

				chunkSize := (totalValid + workers - 1) / workers
				if chunkSize < 1 {
					chunkSize = 1
				}

				var wg sync.WaitGroup
				for w := 0; w < workers; w++ {
					startIdx := w * chunkSize
					if startIdx >= totalValid {
						break
					}
					endIdx := startIdx + chunkSize
					if endIdx > totalValid {
						endIdx = totalValid
					}

					wg.Add(1)
					go func(start, end int) {
						defer wg.Done()
						for i := start; i < end; i++ {
							entry := validEntries[i]
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
							parsedNodes[i] = nodeDTO{
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
							}
							hasNode[i] = true
						}
					}(startIdx, endIdx)
				}
				wg.Wait()

				for i := 0; i < totalValid; i++ {
					if hasNode[i] {
						allNodes = append(allNodes, parsedNodes[i])
					}
				}
			}

			if len(allNodes) == 0 {
				// Fallback to SQLite nodes table if dataset directory has no entries or is not mounted locally
				targetName := strings.TrimPrefix(opts.ParentID, "dataset:")
				slashParts := strings.Split(targetName, "/")
				leafName := slashParts[len(slashParts)-1]
				nRows, nErr := a.db.Read().QueryContext(r.Context(), `
					SELECT n.id, n.name, n.type, n.size_bytes, COALESCE(n.mime_type, ''), n.created_at, n.updated_at
					FROM nodes n
					WHERE n.deleted_at IS NULL AND n.trashed_at IS NULL
					  AND (n.parent_id = ? OR n.parent_id = ? 
					       OR n.parent_id IN (SELECT id FROM nodes WHERE LOWER(name) = LOWER(?) OR LOWER(name) = LOWER(?) OR id = ?))
					ORDER BY n.type ASC, n.name ASC`, opts.ParentID, targetName, targetName, leafName, targetName)
				if nErr == nil {
					for nRows.Next() {
						var nID, nName, nType, nMime string
						var nSize, nCreated, nUpdated int64
						if err := nRows.Scan(&nID, &nName, &nType, &nSize, &nMime, &nCreated, &nUpdated); err == nil {
							cat := string(models.CategoryOf(models.NodeType(nType), nMime, nName))
							allNodes = append(allNodes, nodeDTO{
								ID:           nID,
								ParentID:     opts.ParentID,
								Name:         nName,
								Type:         nType,
								Category:     cat,
								MimeType:     nMime,
								SizeBytes:    nSize,
								Role:         role,
								HasThumbnail: cat == "image" || cat == "video",
								Previewable:  cat == "image" || cat == "video" || cat == "audio",
								CreatedAt:    nCreated,
								UpdatedAt:    nUpdated,
							})
						}
					}
					nRows.Close()
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

			var finalRootNodes []nodeDTO
			seenNames := make(map[string]bool)

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
				for _, n := range nodeViews(dbList, userID) {
					if !seenNames[strings.ToLower(n.Name)] {
						finalRootNodes = append(finalRootNodes, n)
						seenNames[strings.ToLower(n.Name)] = true
					}
				}
			}

			for _, n := range rootDsNodes {
				if seenNames[strings.ToLower(n.Name)] {
					continue
				}
				if _, _, _, mountPath, mErr := a.resolveDatasetTarget(r.Context(), n.ID); mErr == nil && mountPath != "" {
					if fi, sErr := os.Stat(mountPath); sErr == nil && fi.IsDir() {
						finalRootNodes = append(finalRootNodes, n)
						seenNames[strings.ToLower(n.Name)] = true
					}
				}
			}

			sort.Slice(finalRootNodes, func(i, j int) bool {
				if finalRootNodes[i].Type != finalRootNodes[j].Type {
					return finalRootNodes[i].Type == "folder"
				}
				return strings.ToLower(finalRootNodes[i].Name) < strings.ToLower(finalRootNodes[j].Name)
			})

			writeJSON(w, http.StatusOK, map[string]any{
				"nodes":       finalRootNodes,
				"limit":       opts.Limit,
				"offset":      opts.Offset,
				"has_more":    false,
				"next_offset": len(finalRootNodes),
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

func (a *API) resolveDefaultDatasetParent(r *http.Request, parentID string) string {
	trimmed := strings.TrimSpace(parentID)
	if trimmed != "" && trimmed != "root" {
		return trimmed
	}
	user, uOk := mw.UserFrom(r.Context())
	if !uOk || user.DatasetPermissions == "" {
		return trimmed
	}
	var pMap map[string]any
	if err := json.Unmarshal([]byte(user.DatasetPermissions), &pMap); err != nil {
		return trimmed
	}
	var writeDatasets []string
	var allDatasets []string
	for k, v := range pMap {
		kClean := strings.Trim(k, "/")
		if kClean == "" || kClean == "*" {
			continue
		}
		allDatasets = append(allDatasets, kClean)
		canWrite := false
		if str, ok := v.(string); ok && (str == "editor" || str == "writer" || str == "owner") {
			canWrite = true
		} else if obj, ok := v.(map[string]any); ok {
			if wr, ok := obj["write"].(bool); ok && wr {
				canWrite = true
			} else if lvl, ok := obj["level"].(string); ok && (lvl == "editor" || lvl == "writer" || lvl == "owner") {
				canWrite = true
			}
		}
		if canWrite {
			writeDatasets = append(writeDatasets, kClean)
		}
	}
	dedupTopLevel := func(list []string) []string {
		var unique []string
		for _, ds := range list {
			isSub := false
			for _, other := range list {
				if other != ds && strings.HasPrefix(strings.ToLower(ds), strings.ToLower(other)+"/") {
					isSub = true
					break
				}
			}
			if !isSub {
				exists := false
				for _, u := range unique {
					if strings.EqualFold(u, ds) {
						exists = true
						break
					}
				}
				if !exists {
					unique = append(unique, ds)
				}
			}
		}
		return unique
	}
	if uniqueWrite := dedupTopLevel(writeDatasets); len(uniqueWrite) == 1 {
		return "dataset:" + uniqueWrite[0]
	}
	if uniqueAll := dedupTopLevel(allDatasets); len(uniqueAll) == 1 {
		return "dataset:" + uniqueAll[0]
	}
	return trimmed
}

func (a *API) handleCreateFolder(w http.ResponseWriter, r *http.Request) {
	var req createFolderRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	userID, ip := caller(r)
	req.ParentID = a.resolveDefaultDatasetParent(r, req.ParentID)

	if strings.HasPrefix(req.ParentID, "dataset:") {
		canonicalPath, _, _, mountPath, err := a.resolveDatasetTarget(r.Context(), req.ParentID)
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
			if isReadOnlyError(err) || strings.Contains(mountPath, "zfs-recovery") {
				UnlockStorageRW(targetPath)
			}
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
				if isReadOnlyError(err) {
					UnlockStorageRW(newTarget)
					err = os.Rename(oldTarget, newTarget)
				}
				if err != nil {
					a.fail(w, r, err)
					return
				}
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
		if req.ParentID != nil {
			destParent := a.resolveDefaultDatasetParent(r, strings.TrimSpace(*req.ParentID))
			if (destParent == "" || destParent == "root") && strings.Contains(canonicalPath, "/") {
				destParent = "dataset:" + strings.TrimPrefix(filepath.ToSlash(filepath.Dir(canonicalPath)), "/")
			}
			oldTarget := filepath.Clean(mountPath)
			destCanonical, _, _, destMount, err := a.resolveDatasetTarget(r.Context(), destParent)
			if err != nil {
				a.fail(w, r, err)
				return
			}
			if filepath.Clean(destMount) == oldTarget {
				destMount = filepath.Dir(oldTarget)
				destCanonical = strings.TrimPrefix(filepath.ToSlash(filepath.Dir(canonicalPath)), "/")
			}
			destRole, accessErr := a.checkDatasetAccess(r, destCanonical, true)
			if accessErr != nil {
				writeJSON(w, http.StatusForbidden, map[string]any{"error": accessErr.Error()})
				return
			}
			fileName := filepath.Base(oldTarget)
			newTarget := filepath.Clean(filepath.Join(destMount, fileName))
			if newTarget != oldTarget {
				if strings.HasPrefix(strings.ToLower(newTarget)+string(filepath.Separator), strings.ToLower(oldTarget)+string(filepath.Separator)) {
					a.fail(w, r, fmt.Errorf("không thể di chuyển thư mục vào chính thư mục con của nó"))
					return
				}
				if _, statErr := os.Stat(newTarget); statErr == nil {
					ext := filepath.Ext(fileName)
					base := strings.TrimSuffix(fileName, ext)
					for i := 2; i < 1000; i++ {
						candName := fmt.Sprintf("%s (%d)%s", base, i, ext)
						candPath := filepath.Clean(filepath.Join(destMount, candName))
						if _, cErr := os.Stat(candPath); os.IsNotExist(cErr) {
							newTarget = candPath
							fileName = candName
							break
						}
					}
				}
				if err := os.Rename(oldTarget, newTarget); err != nil {
					if isReadOnlyError(err) {
						UnlockStorageRW(newTarget)
						err = os.Rename(oldTarget, newTarget)
					}
					if err != nil {
						if copyErr := copyPathRecursive(oldTarget, newTarget); copyErr != nil {
							if isReadOnlyError(copyErr) {
								UnlockStorageRW(newTarget)
								copyErr = copyPathRecursive(oldTarget, newTarget)
							}
							if copyErr != nil {
								a.fail(w, r, copyErr)
								return
							}
						}
						_ = os.RemoveAll(oldTarget)
					}
				}
			}
			newCanonical := filepath.ToSlash(filepath.Join(destCanonical, fileName))
			newCanonical = strings.TrimPrefix(newCanonical, "/")
			invalidateAllCaches()
			writeJSON(w, http.StatusOK, nodeDTO{
				ID:        fmt.Sprintf("dataset:%s", newCanonical),
				ParentID:  destParent,
				Name:      fileName,
				Role:      destRole,
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
	if strings.HasPrefix(id, "b64_") {
		b64 := strings.TrimPrefix(id, "b64_")
		if decoded, err := base64.RawURLEncoding.DecodeString(b64); err == nil {
			id = string(decoded)
		} else if decoded, err := base64.URLEncoding.DecodeString(b64); err == nil {
			id = string(decoded)
		}
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
		ext := strings.ToLower(filepath.Ext(cleanTarget))
		if (ext == ".heic" || ext == ".heif") && boolQuery(r, "inline") {
			a.serveDatasetThumbnail(w, r, cleanTarget)
			return
		}
		mimeType := models.MimeFromName(filename)
		if mimeType == "" {
			mimeType = mime.TypeByExtension(ext)
		}
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		if ext == ".mov" || ext == ".m4v" {
			mimeType = "video/mp4"
		}
		disposition := "attachment"
		if boolQuery(r, "inline") || models.Previewable(models.CategoryOf(models.NodeFile, mimeType, filename)) {
			disposition = "inline"
		}
		w.Header().Set("Content-Type", mimeType)
		w.Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"; filename*=UTF-8''%s`,
			disposition, sanitizeFilename(filename), url.PathEscape(filename)))
		w.Header().Set("Accept-Ranges", "bytes")
		if strings.HasPrefix(mimeType, "video/") || strings.HasPrefix(mimeType, "audio/") {
			w.Header().Set("Cache-Control", "no-cache, must-revalidate")
		} else if disposition == "inline" {
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

	if (strings.HasSuffix(strings.ToLower(node.Name), ".heic") || strings.HasSuffix(strings.ToLower(node.Name), ".heif")) && boolQuery(r, "inline") {
		a.handleThumbnail(w, r)
		return
	}

	a.audit.Record(r.Context(), audit.Entry{
		UserID: userID, NodeID: node.ID, Action: audit.ActionNodeDownloaded, IP: ip,
		Metadata: map[string]any{"name": node.Name},
	})
	serveNode(w, r, node, f, info, boolQuery(r, "inline"))
}

// serveNode is the one place a file's bytes reach the network, shared by the
// authenticated download and the public share download.
func serveNode(w http.ResponseWriter, r *http.Request, node models.Node, f *os.File, info os.FileInfo, inline bool) {
	ext := strings.ToLower(filepath.Ext(node.Name))
	contentType := node.MimeType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if ext == ".mov" || ext == ".m4v" {
		contentType = "video/mp4"
	}
	disposition := "attachment"
	if inline && models.Previewable(models.CategoryOf(node.Type, node.MimeType, node.Name)) {
		disposition = "inline"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"; filename*=UTF-8''%s`,
		disposition, sanitizeFilename(node.Name), url.PathEscape(node.Name)))
	w.Header().Set("Accept-Ranges", "bytes")

	if strings.HasPrefix(contentType, "video/") || strings.HasPrefix(contentType, "audio/") {
		w.Header().Set("Cache-Control", "no-cache, must-revalidate")
	} else if node.ChecksumSHA256 != "" {
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
	cacheKey := fmt.Sprintf("%s:%s", userID, opts.Filter)
	var mediaNodes []nodeDTO

	cached, found := getCachedMediaList(cacheKey)
	if found {
		mediaNodes = cached
		if isMediaCacheStale(cacheKey) {
			if u, ok := mw.UserFrom(r.Context()); ok {
				bgCtx := mw.WithUser(context.Background(), u)
				bgReq := r.Clone(bgCtx)
				go func() {
					scanned, err := a.scanAndCacheMediaNodes(bgReq, cacheKey, userID, opts.Filter, userRoots, hasFullRoot)
					if err == nil {
						setCachedMediaList(cacheKey, scanned)
						if len(scanned) != len(cached) {
							a.hub.Publish(ws.NewEvent("node.updated", nowMillis(), nil))
						}
					}
				}()
			}
		}
	} else {
		// 1. FAST PATH: Check SQLite database first (takes < 2ms)
		dbList, dbErr := a.files.List(r.Context(), userID, files.ListOptions{
			Filter:   opts.Filter,
			Limit:    100000,
			AllUsers: hasFullRoot,
		})
		if dbErr == nil && len(dbList) > 0 {
			isImg := opts.Filter == "image" || opts.Filter == "images" || opts.Filter == "gallery"
			for _, v := range nodeViews(dbList, userID) {
				if !isImg && (strings.HasSuffix(strings.ToLower(v.Name), ".ts") || strings.HasSuffix(strings.ToLower(v.Name), ".tsx")) {
					continue
				}
				mediaNodes = append(mediaNodes, v)
			}
			sort.Slice(mediaNodes, func(i, j int) bool {
				return mediaNodes[i].UpdatedAt > mediaNodes[j].UpdatedAt
			})
		}

		if len(mediaNodes) > 0 {
			setCachedMediaList(cacheKey, mediaNodes)
			// Supplement with background filesystem scan if not done yet
			if u, ok := mw.UserFrom(r.Context()); ok {
				bgCtx := mw.WithUser(context.Background(), u)
				bgReq := r.Clone(bgCtx)
				go func() {
					scanned, err := a.scanAndCacheMediaNodes(bgReq, cacheKey, userID, opts.Filter, userRoots, hasFullRoot)
					if err == nil && len(scanned) > len(mediaNodes) {
						setCachedMediaList(cacheKey, scanned)
						a.hub.Publish(ws.NewEvent("node.updated", nowMillis(), nil))
					}
				}()
			}
		} else {
			// No DB nodes: Scan filesystem directly so the FIRST request returns actual photos immediately!
			scanned, err := a.scanAndCacheMediaNodes(r, cacheKey, userID, opts.Filter, userRoots, hasFullRoot)
			if err == nil && len(scanned) > 0 {
				mediaNodes = scanned
				setCachedMediaList(cacheKey, mediaNodes)
			} else {
				// Don't poison cache with empty result for long
				setCachedMediaList(cacheKey, []nodeDTO{})
			}
		}
	}

	// 2. Phân quyền nghiêm ngặt cho người dùng bị giới hạn danh mục (userRoots)
	if !hasFullRoot && len(userRoots) > 0 {
		var permitted []nodeDTO
		for _, n := range mediaNodes {
			itemPath := ""
			if strings.HasPrefix(n.ID, "dataset:") {
				itemPath = strings.TrimPrefix(n.ID, "dataset:")
			} else if strings.HasPrefix(n.ParentID, "dataset:") {
				itemPath = strings.TrimPrefix(n.ParentID, "dataset:") + "/" + n.Name
			}
			normItem := strings.ToLower(filepath.ToSlash(filepath.Clean("/" + itemPath)))
			match := false
			for _, ur := range userRoots {
				normRoot := strings.ToLower(filepath.ToSlash(filepath.Clean("/" + ur)))
				cleanRoot := strings.Trim(normRoot, "/")
				urParts := strings.Split(cleanRoot, "/")
				urLeaf := urParts[len(urParts)-1]
				if normItem == normRoot || strings.HasPrefix(normItem, normRoot+"/") || strings.Contains(normItem, "/"+cleanRoot+"/") ||
					normItem == "/"+urLeaf || strings.HasPrefix(normItem, "/"+urLeaf+"/") || strings.Contains(normItem, "/"+urLeaf+"/") {
					match = true
					break
				}
			}
			if match {
				permitted = append(permitted, n)
			}
		}
		mediaNodes = permitted
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
	} else {
		// Default sort order (UpdatedAt desc) is ALREADY applied during cache construction!
		if (opts.SortBy == "" || opts.SortBy == "updated" || opts.SortBy == "taken" || opts.SortBy == "created") && opts.SortDesc {
			filtered = mediaNodes
		} else {
			filtered = make([]nodeDTO, len(mediaNodes))
			copy(filtered, mediaNodes)
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
		}
	}

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

func (a *API) scanAndCacheMediaNodes(r *http.Request, cacheKey, userID, filter string, userRoots []string, hasFullRoot bool) ([]nodeDTO, error) {
	isImg := filter == "image" || filter == "images" || filter == "gallery"
	res, err, _ := mediaScanGroup.Do(cacheKey, func() (any, error) {
		if c, ok := getCachedMediaList(cacheKey); ok && !isMediaCacheStale(cacheKey) && len(c) > 0 {
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

		candidateRoots := []string{
			"/DATA/KiyoVN",
			"/mnt/zfs-recovery/DATA/KiyoVN",
			"/mnt/DATA/KiyoVN",
			"/DATA",
			"/mnt/zfs-recovery/DATA",
			"/mnt/DATA",
			"/mnt/zfs-recovery",
			"/mnt/DỮ LIỆU/KiyoVN",
			"/mnt/DỮ LIỆU",
		}

		addDatasetRootTarget := func(root, role string) {
			cleanRoot := strings.Trim(strings.TrimSpace(root), "/")
			if cleanRoot == "" {
				return
			}
			// 1. Thử qua resolveDatasetTarget
			canonical, _, _, mount, err := a.resolveDatasetTarget(scanCtx, "dataset:"+cleanRoot)
			if err == nil && mount != "" {
				if fi, sErr := os.Stat(mount); sErr == nil && fi.IsDir() {
					addMountTarget(canonical, mount, role)
					return
				}
			}
			// 2. Thử qua resolveRealMountPath
			realMount := a.resolveRealMountPath(cleanRoot, "")
			if realMount != "" {
				if fi, sErr := os.Stat(realMount); sErr == nil && fi.IsDir() {
					addMountTarget(cleanRoot, realMount, role)
					return
				}
			}
			// 3. Thử qua candidateRoots
			for _, cr := range candidateRoots {
				cand := filepath.Join(cr, cleanRoot)
				if fi, sErr := os.Stat(cand); sErr == nil && fi.IsDir() {
					addMountTarget(cleanRoot, cand, role)
					return
				}
				leaf := filepath.Base(cleanRoot)
				candLeaf := filepath.Join(cr, leaf)
				if fi, sErr := os.Stat(candLeaf); sErr == nil && fi.IsDir() {
					addMountTarget(cleanRoot, candLeaf, role)
					return
				}
			}
			// 4. Thử trực tiếp trên filesystem
			for _, direct := range []string{"/" + cleanRoot, cleanRoot} {
				if fi, sErr := os.Stat(direct); sErr == nil && fi.IsDir() {
					addMountTarget(cleanRoot, direct, role)
					return
				}
			}
			// 5. Quét dưới các dataset đã biết
			if dRows, qErr := a.db.Read().QueryContext(scanCtx, `SELECT name, mount FROM datasets WHERE status != 'deleted'`); qErr == nil {
				defer dRows.Close()
				for dRows.Next() {
					var dName, dMount string
					if dRows.Scan(&dName, &dMount) == nil {
						base := a.resolveRealMountPath(dName, dMount)
						if base != "" {
							cand := filepath.Join(base, cleanRoot)
							if fi, sErr := os.Stat(cand); sErr == nil && fi.IsDir() {
								addMountTarget(filepath.ToSlash(filepath.Join(dName, cleanRoot)), cand, role)
								return
							}
						}
					}
				}
			}
			// 6. Quét dưới /mnt
			if mntEntries, mErr := os.ReadDir("/mnt"); mErr == nil {
				for _, me := range mntEntries {
					if me.IsDir() {
						cand := filepath.Join("/mnt", me.Name(), cleanRoot)
						if fi, sErr := os.Stat(cand); sErr == nil && fi.IsDir() {
							addMountTarget(filepath.ToSlash(filepath.Join(me.Name(), cleanRoot)), cand, role)
							return
						}
					}
				}
			}
		}

		// 1. Quét tất cả các danh mục chỉ định cụ thể của người dùng (userRoots)
		for _, root := range userRoots {
			role, accessErr := a.checkDatasetAccess(r, root, false)
			if accessErr != nil {
				continue
			}
			addDatasetRootTarget(root, role)
		}

		if hasFullRoot {
			// 2. Quét toàn bộ các tập dữ liệu (datasets) trong CSDL mà tài khoản có quyền truy cập
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

			// 3. Quét các tập dữ liệu thực tế (1DATA, DaoKy_5, Long_4, NgLoc_6, NgSon_1)
			coreDatasets := []string{"1DATA", "DaoKy_5", "Long_4", "NgLoc_6", "NgSon_1"}
			for _, cds := range coreDatasets {
				addDatasetRootTarget(cds, "editor")
			}

			// 4. Quét các thư mục gốc ứng viên (/DATA/KiyoVN, /DATA, /mnt/DỮ LIỆU/KiyoVN, ...)
			for _, cr := range candidateRoots {
				if fi, err := os.Stat(cr); err == nil && fi.IsDir() {
					addMountTarget(filepath.Base(cr), cr, "editor")
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
					if strings.HasPrefix(lowerName, "$") || strings.EqualFold(lowerName, "System Volume Information") || strings.EqualFold(lowerName, "$recycle.bin") || strings.Contains(lowerName, "google drive") {
						return filepath.SkipDir
					}
					switch lowerName {
					case "node_modules", ".git", ".next", ".cache", "dist-inno", "dist-installer", "release-installer", "release_assets", ".dart_tool", ".gradle", "windows-installer", "windows-app", "appdata", "windows", "program files", "program files (x86)", "programdata", "proc", "sys", "dev", "run", "var", "etc", "usr", "boot", "build", "bin", "obj", "intermediates", "target", "vendor", "dist", "world", "region", "playerdata", "poi", "libraries", "logs", "backups", "backup", "tmp", "temp", ".zfs", "zfs-recovery", "snapshots", ".snapshots", ".recycle", "$recycle.bin", "lost+found":
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
			Filter:   filter,
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

		if !hasFullRoot && len(userRoots) > 0 {
			var permitted []nodeDTO
			for _, n := range scannedNodes {
				itemPath := ""
				if strings.HasPrefix(n.ID, "dataset:") {
					itemPath = strings.TrimPrefix(n.ID, "dataset:")
				} else if strings.HasPrefix(n.ParentID, "dataset:") {
					itemPath = strings.TrimPrefix(n.ParentID, "dataset:") + "/" + n.Name
				}
				normItem := strings.ToLower(filepath.ToSlash(filepath.Clean("/" + itemPath)))
				match := false
				for _, ur := range userRoots {
					normRoot := strings.ToLower(filepath.ToSlash(filepath.Clean("/" + ur)))
					cleanRoot := strings.Trim(normRoot, "/")
					urParts := strings.Split(cleanRoot, "/")
					urLeaf := urParts[len(urParts)-1]
					if normItem == normRoot || strings.HasPrefix(normItem, normRoot+"/") || strings.Contains(normItem, "/"+cleanRoot+"/") ||
						normItem == "/"+urLeaf || strings.HasPrefix(normItem, "/"+urLeaf+"/") || strings.Contains(normItem, "/"+urLeaf+"/") {
						match = true
						break
					}
				}
				if match {
					permitted = append(permitted, n)
				}
			}
			scannedNodes = permitted
		}

		// Pre-sort once by UpdatedAt desc so standard requests have 0 sorting overhead
		sort.Slice(scannedNodes, func(i, j int) bool {
			return scannedNodes[i].UpdatedAt > scannedNodes[j].UpdatedAt
		})

		setCachedMediaList(cacheKey, scannedNodes)
		return scannedNodes, nil
	})
	if err != nil {
		return nil, err
	}
	return res.([]nodeDTO), nil
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
	if n, f, info, oErr := a.files.OpenForDownload(r.Context(), userID, nodeID); oErr == nil {
		defer f.Close()
		if strings.HasPrefix(n.MimeType, "image/") {
			ext := strings.ToLower(filepath.Ext(n.Name))
			if ext == ".heic" || ext == ".heif" {
				if f != nil && a.thumbs != nil && a.thumbs.Caps().FFmpeg {
					a.serveDatasetThumbnail(w, r, f.Name())
					return
				}
				writeError(w, http.StatusNotFound, "no_thumbnail", "cannot decode heic")
				return
			}
			w.Header().Set("Content-Type", n.MimeType)
			w.Header().Set("Cache-Control", "public, max-age=86400")
			http.ServeContent(w, r, n.Name, info.ModTime(), f)
			return
		}
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
	if mimeType == "" {
		switch ext {
		case ".svg":
			mimeType = "image/svg+xml"
		case ".ico":
			mimeType = "image/x-icon"
		case ".heic", ".heif":
			mimeType = "image/heic"
		case ".avif":
			mimeType = "image/avif"
		case ".webp":
			mimeType = "image/webp"
		}
	}
	cat := models.CategoryOf(models.NodeFile, mimeType, cleanTarget)
	if cat != models.CategoryImage && cat != models.CategoryVideo && cat != models.CategoryPDF {
		writeError(w, http.StatusNotFound, "no_thumbnail", "this file has no preview")
		return
	}

	isStandardImage := ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" || ext == ".gif" || ext == ".svg" || ext == ".ico"

	// For standard web images under 8MB, serve immediately with client cache
	if isStandardImage && info.Size() <= 8*1024*1024 {
		if mimeType != "" {
			w.Header().Set("Content-Type", mimeType)
		}
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
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
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			http.ServeContent(w, r, "thumbnail.jpg", cinfo.ModTime(), cf)
			return
		}
	}

	if a.thumbs == nil {
		if cat == models.CategoryImage && isStandardImage && info.Size() <= 4*1024*1024 {
			w.Header().Set("Cache-Control", "public, max-age=86400")
			http.ServeFile(w, r, cleanTarget)
			return
		}
		writeError(w, http.StatusNotFound, "no_thumbnail", "no thumbnail generator available")
		return
	}

	// 2. Separate concurrency limiting by media type
	sem := datasetImageThumbSem
	semTimeout := 10 * time.Second
	if cat == models.CategoryVideo {
		sem = datasetVideoThumbSem
		semTimeout = 15 * time.Second
	}

	// 3. Generate thumbnail with concurrency limiter and singleflight deduplication
	_, _, _ = datasetThumbGroup.Do(hash, func() (any, error) {
		// Recheck if created by a racing request
		if cinfo, err := os.Stat(cacheFile); err == nil && cinfo.Size() > 0 {
			return nil, nil
		}

		// Acquire semaphore slot with timeout
		select {
		case sem <- struct{}{}:
			defer func() { <-sem }()
		case <-r.Context().Done():
			return nil, r.Context().Err()
		case <-time.After(semTimeout):
			return nil, fmt.Errorf("thumbnail queue timeout")
		}

		ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
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

	// 4. Check if cached file is now available and serve
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

	// 5. Graceful fallback for standard images: serve directly if <= 25MB rather than leaving a blank tile!
	if cat == models.CategoryImage && isStandardImage && info.Size() <= 25*1024*1024 {
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

func copyPathRecursive(src, dst string) error {
	cleanSrc := filepath.Clean(src)
	cleanDst := filepath.Clean(dst)
	if cleanSrc == cleanDst {
		return nil
	}
	if strings.HasPrefix(strings.ToLower(cleanDst)+string(filepath.Separator), strings.ToLower(cleanSrc)+string(filepath.Separator)) {
		return fmt.Errorf("không thể sao chép thư mục vào chính thư mục con của nó")
	}
	info, err := os.Stat(cleanSrc)
	if err != nil {
		return err
	}
	if info.IsDir() {
		if err := os.MkdirAll(cleanDst, 0755); err != nil {
			if isReadOnlyError(err) {
				UnlockStorageRW(cleanDst)
				err = os.MkdirAll(cleanDst, 0755)
			}
			if err != nil {
				return err
			}
		}
		entries, err := os.ReadDir(cleanSrc)
		if err != nil {
			return err
		}
		for _, e := range entries {
			srcSub := filepath.Join(cleanSrc, e.Name())
			dstSub := filepath.Join(cleanDst, e.Name())
			if err := copyPathRecursive(srcSub, dstSub); err != nil {
				return err
			}
		}
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(cleanDst), 0755); err != nil && isReadOnlyError(err) {
		UnlockStorageRW(filepath.Dir(cleanDst))
		_ = os.MkdirAll(filepath.Dir(cleanDst), 0755)
	}
	sFile, err := os.Open(cleanSrc)
	if err != nil {
		return err
	}
	defer sFile.Close()
	dFile, err := os.OpenFile(cleanDst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		if isReadOnlyError(err) {
			UnlockStorageRW(cleanDst)
			dFile, err = os.OpenFile(cleanDst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
		}
		if err != nil {
			return err
		}
	}
	defer dFile.Close()
	_, err = io.Copy(dFile, sFile)
	return err
}

type copyNodeRequest struct {
	NodeID   string  `json:"node_id"`
	ParentID string  `json:"parent_id"`
	Name     *string `json:"name"`
}

func (a *API) handleCopyNode(w http.ResponseWriter, r *http.Request) {
	var req copyNodeRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	nodeID := req.NodeID
	if nodeID == "" {
		nodeID = a.extractNodeID(r, "")
	}
	if nodeID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "node_id is required")
		return
	}
	targetParentID := a.resolveDefaultDatasetParent(r, strings.TrimSpace(req.ParentID))
	userID, ip := caller(r)

	// 1. Dataset item copy
	if strings.HasPrefix(nodeID, "dataset:") {
		srcCanonical, _, _, srcMount, err := a.resolveDatasetTarget(r.Context(), nodeID)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		_, err = a.checkDatasetAccess(r, srcCanonical, false)
		if err != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
			return
		}
		if (targetParentID == "" || targetParentID == "root") && strings.Contains(srcCanonical, "/") {
			targetParentID = "dataset:" + strings.TrimPrefix(filepath.ToSlash(filepath.Dir(srcCanonical)), "/")
		}
		destCanonical, _, _, destMount, dErr := a.resolveDatasetTarget(r.Context(), targetParentID)
		if dErr != nil {
			a.fail(w, r, dErr)
			return
		}
		// If user pasted onto the exact same folder they copied, paste into its parent folder alongside it
		if filepath.Clean(destMount) == filepath.Clean(srcMount) {
			destMount = filepath.Dir(filepath.Clean(srcMount))
			destCanonical = strings.TrimPrefix(filepath.ToSlash(filepath.Dir(srcCanonical)), "/")
		}
		destRole, dErr := a.checkDatasetAccess(r, destCanonical, true)
		if dErr != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": dErr.Error()})
			return
		}
		fileName := filepath.Base(srcMount)
		if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
			fileName = strings.TrimSpace(*req.Name)
		}
		newTarget := filepath.Clean(filepath.Join(destMount, fileName))
		if _, statErr := os.Stat(newTarget); statErr == nil {
			ext := filepath.Ext(fileName)
			base := strings.TrimSuffix(fileName, ext)
			for i := 1; i < 1000; i++ {
				candName := fmt.Sprintf("%s - Copy%s", base, ext)
				if i > 1 {
					candName = fmt.Sprintf("%s - Copy (%d)%s", base, i, ext)
				}
				candPath := filepath.Clean(filepath.Join(destMount, candName))
				if _, cErr := os.Stat(candPath); os.IsNotExist(cErr) {
					newTarget = candPath
					fileName = candName
					break
				}
			}
		}
		if err := copyPathRecursive(srcMount, newTarget); err != nil {
			if isReadOnlyError(err) {
				UnlockStorageRW(newTarget)
				err = copyPathRecursive(srcMount, newTarget)
			}
			if err != nil {
				a.fail(w, r, err)
				return
			}
		}
		nType := "file"
		var sizeBytes int64
		if fi, sErr := os.Stat(newTarget); sErr == nil {
			if fi.IsDir() {
				nType = "folder"
			} else {
				sizeBytes = fi.Size()
			}
		}
		newCanonical := filepath.ToSlash(filepath.Join(destCanonical, fileName))
		newCanonical = strings.TrimPrefix(newCanonical, "/")
		invalidateAllCaches()
		writeJSON(w, http.StatusCreated, nodeDTO{
			ID:        fmt.Sprintf("dataset:%s", newCanonical),
			ParentID:  targetParentID,
			Name:      fileName,
			Type:      nType,
			SizeBytes: sizeBytes,
			Role:      destRole,
			CreatedAt: time.Now().UnixMilli(),
			UpdatedAt: time.Now().UnixMilli(),
		})
		return
	}

	// 2. Database node copy
	srcNode, err := a.files.GetNode(r.Context(), nodeID)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	newName := srcNode.Name
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		newName = strings.TrimSpace(*req.Name)
	}
	if targetParentID == srcNode.ParentID && (req.Name == nil || *req.Name == "") {
		ext := filepath.Ext(newName)
		base := strings.TrimSuffix(newName, ext)
		newName = fmt.Sprintf("%s - Copy%s", base, ext)
	}

	// 2a. Target is dataset, copy from DB node into dataset
	if strings.HasPrefix(targetParentID, "dataset:") {
		destCanonical, _, _, destMount, dErr := a.resolveDatasetTarget(r.Context(), targetParentID)
		if dErr != nil {
			a.fail(w, r, dErr)
			return
		}
		destRole, dErr := a.checkDatasetAccess(r, destCanonical, true)
		if dErr != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": dErr.Error()})
			return
		}
		newTarget := filepath.Clean(filepath.Join(destMount, newName))
		if _, statErr := os.Stat(newTarget); statErr == nil {
			ext := filepath.Ext(newName)
			base := strings.TrimSuffix(newName, ext)
			for i := 1; i < 1000; i++ {
				candName := fmt.Sprintf("%s - Copy%s", base, ext)
				if i > 1 {
					candName = fmt.Sprintf("%s - Copy (%d)%s", base, i, ext)
				}
				candPath := filepath.Clean(filepath.Join(destMount, candName))
				if _, cErr := os.Stat(candPath); os.IsNotExist(cErr) {
					newTarget = candPath
					newName = candName
					break
				}
			}
		}
		if srcNode.Type == models.NodeFolder {
			if err := os.MkdirAll(newTarget, 0755); err != nil {
				if isReadOnlyError(err) {
					UnlockStorageRW(newTarget)
					err = os.MkdirAll(newTarget, 0755)
				}
				if err != nil {
					a.fail(w, r, err)
					return
				}
			}
		} else {
			f, _, err := a.files.OpenNodeBytes(srcNode)
			if err != nil {
				a.fail(w, r, err)
				return
			}
			defer f.Close()
			dFile, err := os.OpenFile(newTarget, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
			if err != nil {
				if isReadOnlyError(err) {
					UnlockStorageRW(newTarget)
					dFile, err = os.OpenFile(newTarget, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
				}
				if err != nil {
					a.fail(w, r, err)
					return
				}
			}
			_, _ = io.Copy(dFile, f)
			_ = dFile.Close()
		}
		newCanonical := filepath.ToSlash(filepath.Join(destCanonical, newName))
		newCanonical = strings.TrimPrefix(newCanonical, "/")
		invalidateAllCaches()
		writeJSON(w, http.StatusCreated, nodeDTO{
			ID:        fmt.Sprintf("dataset:%s", newCanonical),
			ParentID:  targetParentID,
			Name:      newName,
			Type:      string(srcNode.Type),
			SizeBytes: srcNode.SizeBytes,
			Role:      destRole,
			CreatedAt: time.Now().UnixMilli(),
			UpdatedAt: time.Now().UnixMilli(),
		})
		return
	}

	if srcNode.Type == models.NodeFolder {
		newFolder, fErr := a.files.CreateFolder(r.Context(), files.CreateFolderParams{
			UserID: userID, ParentID: targetParentID, Name: newName, Color: srcNode.Color, IP: ip,
		})
		if fErr != nil {
			a.fail(w, r, fErr)
			return
		}
		invalidateAllCaches()
		writeJSON(w, http.StatusCreated, plainNode(newFolder))
		return
	}

	f, _, err := a.files.OpenNodeBytes(srcNode)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	defer f.Close()

	tmp, err := os.CreateTemp("", "localdrive-copy-*")
	if err != nil {
		a.fail(w, r, err)
		return
	}
	defer os.Remove(tmp.Name())
	h := sha256.New()
	wtr := io.MultiWriter(tmp, h)
	nBytes, err := io.Copy(wtr, f)
	tmp.Close()
	if err != nil {
		a.fail(w, r, err)
		return
	}
	cSum := fmt.Sprintf("%x", h.Sum(nil))

	newNode, err := a.files.CommitUpload(r.Context(), files.CommitUploadParams{
		UserID: userID, ParentID: targetParentID, Name: newName, Size: nBytes,
		MimeType: srcNode.MimeType, Checksum: cSum, TempPath: tmp.Name(), IP: ip,
	})
	if err != nil {
		a.fail(w, r, err)
		return
	}
	invalidateAllCaches()
	writeJSON(w, http.StatusCreated, plainNode(newNode))
}

type moveNodeRequest struct {
	NodeID   string `json:"node_id"`
	ParentID string `json:"parent_id"`
}

func (a *API) handleMoveNode(w http.ResponseWriter, r *http.Request) {
	var req moveNodeRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	nodeID := strings.TrimSpace(req.NodeID)
	if nodeID == "" {
		nodeID = a.extractNodeID(r, "")
	}
	if nodeID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "node_id is required")
		return
	}
	targetParentID := a.resolveDefaultDatasetParent(r, strings.TrimSpace(req.ParentID))
	userID, ip := caller(r)

	if strings.HasPrefix(nodeID, "dataset:") {
		srcCanonical, _, _, mountPath, err := a.resolveDatasetTarget(r.Context(), nodeID)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		if (targetParentID == "" || targetParentID == "root") && strings.Contains(srcCanonical, "/") {
			targetParentID = "dataset:" + strings.TrimPrefix(filepath.ToSlash(filepath.Dir(srcCanonical)), "/")
		}
		oldTarget := filepath.Clean(mountPath)
		destCanonical, _, _, destMount, dErr := a.resolveDatasetTarget(r.Context(), targetParentID)
		if dErr != nil {
			a.fail(w, r, dErr)
			return
		}
		if filepath.Clean(destMount) == oldTarget {
			destMount = filepath.Dir(oldTarget)
			destCanonical = strings.TrimPrefix(filepath.ToSlash(filepath.Dir(srcCanonical)), "/")
		}
		destRole, accessErr := a.checkDatasetAccess(r, destCanonical, true)
		if accessErr != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": accessErr.Error()})
			return
		}
		fileName := filepath.Base(oldTarget)
		newTarget := filepath.Clean(filepath.Join(destMount, fileName))
		if newTarget != oldTarget {
			if strings.HasPrefix(strings.ToLower(newTarget)+string(filepath.Separator), strings.ToLower(oldTarget)+string(filepath.Separator)) {
				a.fail(w, r, fmt.Errorf("không thể di chuyển thư mục vào chính thư mục con của nó"))
				return
			}
			if _, statErr := os.Stat(newTarget); statErr == nil {
				ext := filepath.Ext(fileName)
				base := strings.TrimSuffix(fileName, ext)
				for i := 2; i < 1000; i++ {
					candName := fmt.Sprintf("%s (%d)%s", base, i, ext)
					candPath := filepath.Clean(filepath.Join(destMount, candName))
					if _, cErr := os.Stat(candPath); os.IsNotExist(cErr) {
						newTarget = candPath
						fileName = candName
						break
					}
				}
			}
			if err := os.Rename(oldTarget, newTarget); err != nil {
				if isReadOnlyError(err) {
					UnlockStorageRW(newTarget)
					err = os.Rename(oldTarget, newTarget)
				}
				if err != nil {
					if copyErr := copyPathRecursive(oldTarget, newTarget); copyErr != nil {
						if isReadOnlyError(copyErr) {
							UnlockStorageRW(newTarget)
							copyErr = copyPathRecursive(oldTarget, newTarget)
						}
						if copyErr != nil {
							a.fail(w, r, copyErr)
							return
						}
					}
					_ = os.RemoveAll(oldTarget)
				}
			}
		}
		nType := "file"
		var sizeBytes int64
		if fi, sErr := os.Stat(newTarget); sErr == nil {
			if fi.IsDir() {
				nType = "folder"
			} else {
				sizeBytes = fi.Size()
			}
		}
		newCanonical := filepath.ToSlash(filepath.Join(destCanonical, fileName))
		newCanonical = strings.TrimPrefix(newCanonical, "/")
		invalidateAllCaches()
		writeJSON(w, http.StatusOK, nodeDTO{
			ID:        fmt.Sprintf("dataset:%s", newCanonical),
			ParentID:  targetParentID,
			Name:      fileName,
			Type:      nType,
			SizeBytes: sizeBytes,
			Role:      destRole,
			UpdatedAt: time.Now().UnixMilli(),
		})
		return
	}

	if strings.HasPrefix(targetParentID, "dataset:") {
		destCanonical, _, _, destMount, dErr := a.resolveDatasetTarget(r.Context(), targetParentID)
		if dErr != nil {
			a.fail(w, r, dErr)
			return
		}
		destRole, accessErr := a.checkDatasetAccess(r, destCanonical, true)
		if accessErr != nil {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": accessErr.Error()})
			return
		}
		srcNode, sErr := a.files.GetNode(r.Context(), nodeID)
		if sErr != nil {
			a.fail(w, r, sErr)
			return
		}
		fileName := srcNode.Name
		newTarget := filepath.Clean(filepath.Join(destMount, fileName))
		if srcNode.Type == models.NodeFolder {
			if err := os.MkdirAll(newTarget, 0755); err != nil {
				if isReadOnlyError(err) {
					UnlockStorageRW(newTarget)
					err = os.MkdirAll(newTarget, 0755)
				}
				if err != nil {
					a.fail(w, r, err)
					return
				}
			}
		} else {
			f, _, err := a.files.OpenNodeBytes(srcNode)
			if err != nil {
				a.fail(w, r, err)
				return
			}
			defer f.Close()
			dFile, err := os.OpenFile(newTarget, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
			if err != nil {
				if isReadOnlyError(err) {
					UnlockStorageRW(newTarget)
					dFile, err = os.OpenFile(newTarget, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
				}
				if err != nil {
					a.fail(w, r, err)
					return
				}
			}
			_, _ = io.Copy(dFile, f)
			_ = dFile.Close()
		}
		_ = a.files.PermanentDelete(r.Context(), userID, nodeID, ip)
		newCanonical := filepath.ToSlash(filepath.Join(destCanonical, fileName))
		newCanonical = strings.TrimPrefix(newCanonical, "/")
		invalidateAllCaches()
		writeJSON(w, http.StatusOK, nodeDTO{
			ID:        fmt.Sprintf("dataset:%s", newCanonical),
			ParentID:  targetParentID,
			Name:      fileName,
			Role:      destRole,
			UpdatedAt: time.Now().UnixMilli(),
		})
		return
	}

	node, err := a.files.Move(r.Context(), files.MoveParams{
		UserID: userID, NodeID: nodeID, ParentID: targetParentID, IP: ip,
	})
	if err != nil {
		a.fail(w, r, err)
		return
	}
	invalidateAllCaches()
	writeJSON(w, http.StatusOK, plainNode(node))
}