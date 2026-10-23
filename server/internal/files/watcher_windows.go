//go:build windows

package files

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"golang.org/x/sys/windows/registry"

	"github.com/MultiX0/LocalDrive/server/internal/audit"
	"github.com/MultiX0/LocalDrive/server/internal/db"
	"github.com/MultiX0/LocalDrive/server/internal/models"
	"github.com/MultiX0/LocalDrive/server/internal/storage"
	"github.com/MultiX0/LocalDrive/server/internal/ws"
)

var (
	shell32            = syscall.NewLazyDLL("shell32.dll")
	procSHChangeNotify = shell32.NewProc("SHChangeNotify")

	knownDiskMu    sync.Mutex
	knownDiskItems = make(map[string]bool)
	hasInitialScan = false
)

func notifyShell() {
	// SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0
	procSHChangeNotify.Call(0x08000000, 0, 0, 0)
}

func formatBytesVN(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	val := float64(b) / float64(div)
	unitStr := []string{"KB", "MB", "GB", "TB"}[exp]
	if val == float64(int64(val)) {
		return fmt.Sprintf("%d %s", int64(val), unitStr)
	}
	str := fmt.Sprintf("%.1f %s", val, unitStr)
	return strings.Replace(str, ".", ",", 1)
}

func setFileNormal(path string) error {
	pUtf16, err := syscall.UTF16PtrFromString(path)
	if err == nil {
		return syscall.SetFileAttributes(pUtf16, 0x80)
	}
	return err
}

func setFileReadOnly(path string) error {
	pUtf16, err := syscall.UTF16PtrFromString(path)
	if err == nil {
		return syscall.SetFileAttributes(pUtf16, 0x01)
	}
	return err
}

func setFileHiddenAndSystem(path string) error {
	pUtf16, err := syscall.UTF16PtrFromString(path)
	if err == nil {
		return syscall.SetFileAttributes(pUtf16, 0x02|0x04)
	}
	return err
}

func findAppIcon(vDrive string) string {
	appData := os.Getenv("LOCALAPPDATA")
	candidates := []string{
		filepath.Join(appData, "Programs", "Local Drive", "app_icon.ico"),
		filepath.Join(appData, "Programs", "LocalDrive", "app_icon.ico"),
		filepath.Join(appData, "LocalDrive", "app_icon.ico"),
		filepath.Join(vDrive, "app_icon.ico"),
		`E:\DATA\source\Nas\LocalDrive\windows-installer\app_icon.ico`,
	}
	for _, c := range candidates {
		if fi, err := os.Stat(c); err == nil && !fi.IsDir() {
			return c
		}
	}
	return ""
}

func ensureDriveLRegistry(vDrive string) {
	// 1. Unmount drive L: from subst and net use so no capacity bar or NTFS appears
	_ = exec.Command("cmd.exe", "/c", "subst L: /D 2>nul").Run()
	_ = exec.Command("cmd.exe", "/c", "net use L: /delete /y 2>nul").Run()

	// 2. Clean up DriveIcons\L registry if existing
	_ = registry.DeleteKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\L\DefaultLabel`)
	_ = registry.DeleteKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\L\DefaultIcon`)
	_ = registry.DeleteKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\L`)
	_ = registry.DeleteKey(registry.CURRENT_USER, `Software\Classes\Applications\Explorer.exe\Drives\L\DefaultLabel`)
	_ = registry.DeleteKey(registry.CURRENT_USER, `Software\Classes\Applications\Explorer.exe\Drives\L\DefaultIcon`)
	_ = registry.DeleteKey(registry.CURRENT_USER, `Software\Classes\Applications\Explorer.exe\Drives\L`)

	// 3. Ensure clean Network Location: APPDATA\Microsoft\Windows\Network Shortcuts\KiyoDrive
	roaming := os.Getenv("APPDATA")
	iconPath := findAppIcon(vDrive)
	if roaming != "" && iconPath != "" {
		netShortcuts := filepath.Join(roaming, "Microsoft", "Windows", "Network Shortcuts")
		_ = os.MkdirAll(netShortcuts, 0o755)

		// Remove old named variants
		for _, oldName := range []string{"Local Drive", "Kiyo Drive"} {
			oldDir := filepath.Join(netShortcuts, oldName)
			if _, err := os.Stat(oldDir); err == nil {
				_ = setFileNormal(oldDir)
				_ = os.RemoveAll(oldDir)
			}
		}

		kdDir := filepath.Join(netShortcuts, "KiyoDrive")
		_ = os.MkdirAll(kdDir, 0o755)

		iniPath := filepath.Join(kdDir, "desktop.ini")
		_ = setFileNormal(iniPath)
		_ = setFileNormal(kdDir)

		iniContent := fmt.Sprintf("[.ShellClassInfo]\r\nCLSID2={0AFACED1-E828-11D1-9187-B532F1E9575D}\r\nFlags=2\r\nConfirmFileOp=0\r\nIconFile=%s\r\nIconIndex=0\r\nIconResource=%s,0\r\n", iconPath, iconPath)
		_ = os.WriteFile(iniPath, []byte(iniContent), 0o644)

		_ = setFileHiddenAndSystem(iniPath)
		_ = setFileReadOnly(kdDir)

		lnkPath := filepath.Join(kdDir, "target.lnk")
		targetFolder := vDrive
		if targetFolder == `L:\` || targetFolder == "" {
			targetFolder = getVirtualDriveFolder()
		}
		psCmd := fmt.Sprintf("$w=New-Object -ComObject WScript.Shell;$s=$w.CreateShortcut('%s');$s.TargetPath='%s';$s.WorkingDirectory='%s';$s.IconLocation='%s,0';$s.Description='KiyoDrive';$s.Save()",
			strings.ReplaceAll(lnkPath, "'", "''"),
			strings.ReplaceAll(targetFolder, "'", "''"),
			strings.ReplaceAll(targetFolder, "'", "''"),
			strings.ReplaceAll(iconPath, "'", "''"),
		)
		_ = exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", psCmd).Run()
	}

	notifyShell()
}

func cleanupDriveLRegistry() {
	vDrive := getVirtualDriveFolder()
	ensureDriveLRegistry(vDrive)
}

func getVirtualDriveFolder() string {
	// 1. Check user local drive folders first
	userProfile := os.Getenv("USERPROFILE")
	if userProfile != "" {
		for _, sub := range []string{
			filepath.Join(userProfile, "OneDrive", "Tài liệu", "Local Drive"),
			filepath.Join(userProfile, "OneDrive", "Documents", "Local Drive"),
			filepath.Join(userProfile, "Documents", "Local Drive"),
			filepath.Join(userProfile, "Local Drive"),
		} {
			if fi, err := os.Stat(sub); err == nil && fi.IsDir() {
				return sub
			}
		}
	}
	// 2. Fallback to L:\ if present
	if fi, err := os.Stat(`L:\`); err == nil && fi.IsDir() {
		return `L:\`
	}
	return ""
}

// StartVirtualDriveWatcher starts watching the Windows Local Drive folder (L:) for real-time two-way synchronization.
func (s *Service) StartVirtualDriveWatcher(ctx context.Context) {
	vDrive := getVirtualDriveFolder()
	if vDrive == "" {
		return
	}

	// Ensure Drive L and Network Shortcut with logo exist
	ensureDriveLRegistry(vDrive)

	// Ensure autorun.inf & app_icon.ico exist
	ensureDriveFiles(vDrive)

	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()

		var lastUsed int64 = -1
		var lastQuota int64 = -1

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				currentFolder := getVirtualDriveFolder()
				if currentFolder != "" {
					s.syncFromVirtualDrive(ctx, currentFolder, &lastQuota, &lastUsed)
				}
			}
		}
	}()
}

func ensureDriveFiles(vDrive string) {
	iconPath := findAppIcon(vDrive)
	if iconPath != "" {
		dstIco := filepath.Join(vDrive, "app_icon.ico")
		if _, err := os.Stat(dstIco); os.IsNotExist(err) {
			if data, err := os.ReadFile(iconPath); err == nil {
				_ = os.WriteFile(dstIco, data, 0o644)
				setFileHidden(dstIco)
			}
		} else {
			setFileHidden(dstIco)
		}
	}

	// Create autorun.inf
	autorunPath := filepath.Join(vDrive, "autorun.inf")
	autorunContent := "[autorun]\r\nicon=app_icon.ico\r\nlabel=KiyoDrive\r\n"
	_ = setFileNormal(autorunPath)
	_ = os.WriteFile(autorunPath, []byte(autorunContent), 0o644)
	setFileHidden(autorunPath)
}

func setFileHidden(path string) {
	pUtf16, err := syscall.UTF16PtrFromString(path)
	if err == nil {
		const FILE_ATTRIBUTE_HIDDEN = 0x02
		_ = syscall.SetFileAttributes(pUtf16, FILE_ATTRIBUTE_HIDDEN)
	}
}

func (s *Service) syncFromVirtualDrive(ctx context.Context, vDrive string, lastQuota, lastUsed *int64) {
	// 1. Get default owner and default library
	var ownerID, libraryID string
	var qBytes, qUsed int64
	err := s.database.Read().QueryRowContext(ctx, `
		SELECT u.id, u.quota_bytes, u.quota_bytes_used, l.id
		FROM users u
		CROSS JOIN libraries l
		WHERE u.role = 'admin' AND l.status = 'online'
		ORDER BY u.created_at ASC, l.is_default DESC, l.created_at ASC
		LIMIT 1`).Scan(&ownerID, &qBytes, &qUsed, &libraryID)
	if err != nil {
		return
	}

	// Quota check
	if qBytes != *lastQuota || qUsed != *lastUsed {
		*lastQuota = qBytes
		*lastUsed = qUsed
		ensureDriveLRegistry(vDrive)
	}

	root, err := s.libs.Root(libraryID)
	if err != nil {
		return
	}

	diskItems := make(map[string]bool)

	// 2. Scan disk recursively starting from vDrive root
	s.syncDirectoryRecursive(ctx, root, ownerID, libraryID, vDrive, nil, "", diskItems)

	// 3. Two-way synchronization with known disk tracking
	knownDiskMu.Lock()
	defer knownDiskMu.Unlock()

	rows, err := s.database.Read().QueryContext(ctx, `
		SELECT id, name, type, checksum_sha256 FROM nodes
		WHERE owner_id = ? AND library_id = ?
		  AND deleted_at IS NULL AND trashed_at IS NULL
		ORDER BY type ASC`, // delete files before folders
		ownerID, libraryID)
	if err == nil {
		type trashItem struct {
			id   string
			name string
			kind string
		}
		var toTrash []trashItem
		var toSyncDown []models.Node

		for rows.Next() {
			var id, name, kind string
			var checksum sql.NullString
			if err := rows.Scan(&id, &name, &kind, &checksum); err == nil {
				rel, err := relPathOf(ctx, s.database.Read(), id)
				if err != nil || len(rel) == 0 {
					continue
				}
				relKey := filepath.Join(rel...)
				if !diskItems[relKey] {
					diskPath := filepath.Join(append([]string{vDrive}, rel...)...)
					if _, statErr := os.Stat(diskPath); os.IsNotExist(statErr) {
						if hasInitialScan && knownDiskItems[relKey] {
							// Item was known on disk and now removed -> User deleted it in Windows Explorer
							toTrash = append(toTrash, trashItem{id: id, name: name, kind: kind})
						} else {
							// Item in DB was NOT on disk -> Sync it down to vDrive (uploaded from Web/App)
							toSyncDown = append(toSyncDown, models.Node{
								ID: id, Name: name, Type: models.NodeType(kind),
								LibraryID: libraryID, ChecksumSHA256: checksum.String,
							})
						}
					}
				}
			}
		}
		rows.Close()

		for _, item := range toTrash {
			rel, _ := relPathOf(ctx, s.database.Read(), item.id)
			if len(rel) > 0 {
				delete(knownDiskItems, filepath.Join(rel...))
			}
			s.log.Info("[VirtualDrive] Trashing deleted node from L:\\", "type", item.kind, "name", item.name)
			_, _ = s.Trash(ctx, ownerID, item.id, "127.0.0.1")
		}

		for _, node := range toSyncDown {
			rel, err := relPathOf(ctx, s.database.Read(), node.ID)
			if err != nil || len(rel) == 0 {
				continue
			}
			diskPath := filepath.Join(append([]string{vDrive}, rel...)...)
			relKey := filepath.Join(rel...)
			if node.Type == models.NodeFolder {
				_ = os.MkdirAll(diskPath, 0o755)
				diskItems[relKey] = true
				knownDiskItems[relKey] = true
			} else if node.Type == models.NodeFile && node.ChecksumSHA256 != "" {
				targetObj, err := s.store.ObjectPath(root, node.ChecksumSHA256)
				if err == nil {
					if _, statErr := os.Stat(targetObj); statErr == nil {
						_ = os.MkdirAll(filepath.Dir(diskPath), 0o755)
						if err := storage.LinkOrCopy(targetObj, diskPath); err == nil {
							diskItems[relKey] = true
							knownDiskItems[relKey] = true
						}
					}
				}
			}
		}

		if len(toSyncDown) > 0 {
			notifyShell()
		}

		// Update knownDiskItems with all current diskItems
		for k := range diskItems {
			knownDiskItems[k] = true
		}
		hasInitialScan = true

		if len(toTrash) > 0 {
			// Refresh quota
			_ = s.database.Read().QueryRowContext(ctx, `SELECT quota_bytes, quota_bytes_used FROM users WHERE id = ?`, ownerID).Scan(&qBytes, &qUsed)
			*lastQuota = qBytes
			*lastUsed = qUsed
			ensureDriveLRegistry(vDrive)
		}
	}
}

func (s *Service) syncDirectoryRecursive(
	ctx context.Context,
	root string,
	ownerID string,
	libraryID string,
	dirPath string,
	relSegments []string,
	parentID string,
	diskItems map[string]bool,
) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return
	}

	for _, entry := range entries {
		name := entry.Name()
		nameLower := strings.ToLower(name)

		// Ignore system, temp or hidden files
		if nameLower == "autorun.inf" ||
			nameLower == "app_icon.ico" ||
			nameLower == "desktop.ini" ||
			nameLower == "thumbs.db" ||
			strings.HasSuffix(nameLower, ".tmp") ||
			strings.HasSuffix(nameLower, ".crdownload") ||
			strings.HasSuffix(nameLower, ".part") ||
			strings.HasPrefix(name, ".") ||
			strings.HasPrefix(name, "~$") {
			continue
		}

		currRel := append(append([]string{}, relSegments...), name)
		relKey := filepath.Join(currRel...)
		diskItems[relKey] = true
		itemPath := filepath.Join(dirPath, name)

		if entry.IsDir() {
			// It is a directory! Find or create folder in DB
			var folderID string
			var trashedAt sql.NullInt64
			err := s.database.Read().QueryRowContext(ctx, `
				SELECT id, trashed_at FROM nodes
				WHERE owner_id = ? AND library_id = ?
				  AND (parent_id = ? OR (parent_id IS NULL AND ? = ''))
				  AND name = ? AND type = 'folder' AND deleted_at IS NULL`,
				ownerID, libraryID, parentID, parentID, name).Scan(&folderID, &trashedAt)

			if err == sql.ErrNoRows {
				// Folder does not exist in DB: user created it in Windows Explorer!
				folderID = db.NewID()
				now := db.NowMillis()
				newFolder := models.Node{
					ID: folderID, ParentID: parentID, OwnerID: ownerID, LibraryID: libraryID,
					Name: name, Type: models.NodeFolder, VersionCount: 0,
					CreatedAt: now, UpdatedAt: now,
				}
				_ = s.database.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
					if err := insertNode(ctx, tx, newFolder); err != nil {
						return err
					}
					return s.audit.RecordTx(ctx, tx, audit.Entry{
						UserID: ownerID, NodeID: folderID, Action: audit.ActionNodeCreated, IP: "127.0.0.1",
						Metadata: map[string]any{"name": name, "type": "folder", "source": "vDrive"},
					})
				})
				s.emit(ctx, ws.EventNodeCreated, newFolder)
				s.log.Info("[VirtualDrive] Imported new folder from disk", "name", name, "path", relKey)
			} else if err == nil && trashedAt.Valid && trashedAt.Int64 > 0 {
				// Restored folder
				now := db.NowMillis()
				_ = s.database.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
					_, err := tx.ExecContext(ctx, `UPDATE nodes SET trashed_at = NULL, updated_at = ? WHERE id = ?`, now, folderID)
					return err
				})
				s.emit(ctx, ws.EventNodeUpdated, models.Node{ID: folderID, ParentID: parentID, Name: name, Type: models.NodeFolder})
			}

			// Recurse into subfolder
			if folderID != "" {
				s.syncDirectoryRecursive(ctx, root, ownerID, libraryID, itemPath, currRel, folderID, diskItems)
			}
			continue
		}

		// It is a file!
		info, err := entry.Info()
		if err != nil {
			continue
		}

		fileData, err := os.ReadFile(itemPath)
		if err != nil {
			// Might be locked during copying; retry next tick
			continue
		}
		hash := sha256.Sum256(fileData)
		sum := hex.EncodeToString(hash[:])

		var existingID, existingSum string
		var fileTrashed sql.NullInt64
		err = s.database.Read().QueryRowContext(ctx, `
			SELECT id, checksum_sha256, trashed_at FROM nodes
			WHERE owner_id = ? AND library_id = ?
			  AND (parent_id = ? OR (parent_id IS NULL AND ? = ''))
			  AND name = ? AND type = 'file' AND deleted_at IS NULL`,
			ownerID, libraryID, parentID, parentID, name).Scan(&existingID, &existingSum, &fileTrashed)

		if err == nil && existingSum == sum && (!fileTrashed.Valid || fileTrashed.Int64 == 0) {
			// File is up to date
			continue
		}

		// New or modified file! Write to object store and CommitUpload
		_, _, writeErr := s.store.Write(root, bytes.NewReader(fileData))
		if writeErr != nil {
			s.log.Error("[VirtualDrive] writing object failed", "name", name, "error", writeErr)
			continue
		}

		mime := models.MimeFromName(name)
		if mime == "" {
			mime = "application/octet-stream"
		}

		s.log.Info("[VirtualDrive] Importing new/modified file from disk", "name", name, "size", info.Size(), "path", relKey)

		node, commitErr := s.CommitUpload(ctx, CommitUploadParams{
			UserID:   ownerID,
			NodeID:   existingID,
			ParentID: parentID,
			Name:     name,
			Size:     info.Size(),
			Checksum: sum,
			MimeType: mime,
			IP:       "127.0.0.1",
		})
		if commitErr != nil {
			if errors.Is(commitErr, ErrQuota) {
				s.log.Warn("[VirtualDrive] Dung lượng lưu trữ đã đầy, không thể tải tệp lên", "name", name)
				s.hub.Publish(ws.NewEvent("quota.exceeded", db.NowMillis(), map[string]any{
					"name":    name,
					"message": "Dung lượng lưu trữ đã đầy, không thể tải tệp lên",
				}), ownerID)
			} else {
				s.log.Error("[VirtualDrive] CommitUpload failed", "name", name, "error", commitErr)
			}
			continue
		}
		s.ScheduleDerived(node)
	}
}
