package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/MultiX0/LocalDrive/server/internal/models"
)

// SyncSystemAndSambaUser ensures a Linux system user and Samba passdb account exist and are enabled.
func SyncSystemAndSambaUser(username, password string) error {
	username = strings.TrimSpace(username)
	if username == "" || runtime.GOOS != "linux" {
		return nil
	}

	// 1. Check if user exists in /etc/passwd
	if err := exec.Command("id", "-u", username).Run(); err != nil {
		// Attempt to create user with nologin shell and no home dir
		if err := exec.Command("useradd", "-M", "-s", "/usr/sbin/nologin", username).Run(); err != nil {
			_ = exec.Command("useradd", "-M", "-s", "/usr/sbin/nologin", "--badname", username).Run()
		}
	}
	_ = exec.Command("usermod", "-a", "-G", "users", username).Run()

	// 2. If password provided, update Samba's passdb via smbpasswd
	if password != "" {
		cmd := exec.Command("smbpasswd", "-s", "-a", username)
		cmd.Stdin = strings.NewReader(password + "\n" + password + "\n")
		_ = cmd.Run()
		_ = exec.Command("smbpasswd", "-e", username).Run()
	} else {
		// If user is not yet in Samba passdb, add them with default initial password '12345678'
		if err := exec.Command("pdbedit", "-u", username).Run(); err != nil {
			cmd := exec.Command("smbpasswd", "-s", "-a", username)
			cmd.Stdin = strings.NewReader("12345678\n12345678\n")
			_ = cmd.Run()
			_ = exec.Command("smbpasswd", "-e", username).Run()
		}
	}

	return nil
}

// SyncSambaUser wraps SyncSystemAndSambaUser on the API instance.
func (a *API) SyncSambaUser(username, password string) {
	_ = SyncSystemAndSambaUser(username, password)
}

// UserPermRecord holds user permission details for ACL calculation
type UserPermRecord struct {
	ID                 string
	Username           string
	Role               string
	DatasetPermissions string
	PermMap            map[string]any
}

// checkUserFolderPermission checks whether the user's permMap grants access to the specified folder.
// Returns "editor", "viewer", or "" (no access).
func checkUserFolderPermission(perms map[string]any, folderName, folderPath string) string {
	if len(perms) == 0 {
		return ""
	}

	// 1. Wildcard / or *
	if v, ok := perms["/"]; ok && v != nil && v != "none" {
		return getPermLevel(v)
	}
	if v, ok := perms["*"]; ok && v != nil && v != "none" {
		return getPermLevel(v)
	}

	cleanFolder := strings.ToLower(strings.Trim(folderName, "/"))
	cleanPath := strings.ToLower(filepath.ToSlash(filepath.Clean(folderPath)))

	// Check each permission entry in user's permissions
	for k, v := range perms {
		if v == nil || v == "none" {
			continue
		}
		kNorm := strings.ToLower(strings.Trim(k, "/"))
		if kNorm == "" {
			continue
		}

		if isDatasetPathAllowed(kNorm, cleanFolder) ||
			isDatasetPathAllowed(kNorm, cleanPath) ||
			isDatasetPathAllowed(kNorm, "data/kiyovn/"+cleanFolder) ||
			isDatasetPathAllowed(kNorm, "kiyovn/"+cleanFolder) {
			return getPermLevel(v)
		}
	}

	return ""
}

func getPermLevel(val any) string {
	switch v := val.(type) {
	case string:
		s := strings.ToLower(strings.TrimSpace(v))
		if s == "editor" || s == "writer" || s == "owner" {
			return "editor"
		}
		if s == "viewer" || s == "reader" {
			return "viewer"
		}
	case map[string]any:
		if w, ok := v["write"].(bool); ok && w {
			return "editor"
		}
		if r, ok := v["read"].(bool); ok && r {
			return "viewer"
		}
		if lvl, ok := v["level"].(string); ok {
			lvl = strings.ToLower(strings.TrimSpace(lvl))
			if lvl == "editor" || lvl == "writer" || lvl == "owner" {
				return "editor"
			}
			if lvl == "viewer" || lvl == "reader" {
				return "viewer"
			}
		}
	}
	return ""
}

// SyncDatasetAndFolderACLs applies Linux POSIX ACLs so each user can ONLY access
// the exact dataset/folder they are granted permission to, and gets permission denied for others.
func (a *API) SyncDatasetAndFolderACLs(ctx context.Context) error {
	if runtime.GOOS != "linux" {
		return nil
	}

	// 1. Ensure 'setfacl' is installed
	if _, err := exec.LookPath("setfacl"); err != nil {
		_ = exec.Command("apt-get", "update", "-qq").Run()
		_ = exec.Command("apt-get", "install", "-y", "-qq", "acl", "attr").Run()
	}

	// 2. Fetch all active users from database
	rows, err := a.db.Read().QueryContext(ctx, `SELECT id, username, role, dataset_permissions FROM users WHERE disabled_at IS NULL OR disabled_at = 0`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var users []UserPermRecord
	var adminUsers []string

	for rows.Next() {
		var u UserPermRecord
		var permStr sql.NullString
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &permStr); err == nil {
			u.Username = strings.TrimSpace(u.Username)
			if u.Username == "" {
				continue
			}
			// Ensure Linux system user and initial Samba credentials exist
			_ = SyncSystemAndSambaUser(u.Username, "")

			if u.Role == string(models.RoleAdmin) {
				adminUsers = append(adminUsers, u.Username)
			}
			if permStr.Valid && permStr.String != "" {
				u.DatasetPermissions = permStr.String
				var pMap map[string]any
				if err := json.Unmarshal([]byte(permStr.String), &pMap); err == nil {
					u.PermMap = pMap
				}
			}
			users = append(users, u)
		}
	}

	// Always ensure 'root' is included as an admin
	hasRoot := false
	for _, adm := range adminUsers {
		if adm == "root" {
			hasRoot = true
			break
		}
	}
	if !hasRoot {
		adminUsers = append(adminUsers, "root")
	}

	// 3. Find all share directories to protect
	shareDirs := make(map[string]bool)
	shareDirs["/DATA/KiyoVN"] = true
	shareDirs["/mnt/DATA/KiyoVN"] = true

	// Also add active shares from network_shares table
	sRows, sErr := a.db.Read().QueryContext(ctx, `SELECT path FROM network_shares WHERE status = 'active'`)
	if sErr == nil {
		defer sRows.Close()
		for sRows.Next() {
			var p string
			if err := sRows.Scan(&p); err == nil {
				realP := a.resolveRealMountPath(p, p)
				if realP != "" {
					shareDirs[realP] = true
				}
			}
		}
	}

	// 4. Ensure all datasets are linked/bind-mounted under KiyoVN
	ensureDatasetsLinkedToShare("/DATA/KiyoVN")

	// 5. Apply folder ACLs
	applyFolderACLs(shareDirs, adminUsers, users)

	// 6. Update /etc/samba/smb.conf with unified permissions and individual shares
	writeUnifiedSmbConf(shareDirs, adminUsers, users)

	// 7. Reload Samba
	_ = exec.Command("smbcontrol", "smbd", "reload-config").Run()
	_ = exec.Command("systemctl", "reload", "smbd").Run()
	_ = exec.Command("systemctl", "restart", "smbd").Run()

	return nil
}

// SyncAllACLsFromDB provides direct CLI execution without an active API instance.
func SyncAllACLsFromDB(dbPath string) error {
	if runtime.GOOS != "linux" {
		return nil
	}

	if _, err := exec.LookPath("setfacl"); err != nil {
		_ = exec.Command("apt-get", "update", "-qq").Run()
		_ = exec.Command("apt-get", "install", "-y", "-qq", "acl", "attr").Run()
	}

	sqliteDB, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return err
	}
	defer sqliteDB.Close()

	rows, err := sqliteDB.Query(`SELECT id, username, role, dataset_permissions FROM users WHERE disabled_at IS NULL OR disabled_at = 0`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var users []UserPermRecord
	var adminUsers []string

	for rows.Next() {
		var u UserPermRecord
		var permStr sql.NullString
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &permStr); err == nil {
			u.Username = strings.TrimSpace(u.Username)
			if u.Username == "" {
				continue
			}
			_ = SyncSystemAndSambaUser(u.Username, "")

			if u.Role == string(models.RoleAdmin) {
				adminUsers = append(adminUsers, u.Username)
			}
			if permStr.Valid && permStr.String != "" {
				u.DatasetPermissions = permStr.String
				var pMap map[string]any
				if err := json.Unmarshal([]byte(permStr.String), &pMap); err == nil {
					u.PermMap = pMap
				}
			}
			users = append(users, u)
		}
	}

	hasRoot := false
	for _, adm := range adminUsers {
		if adm == "root" {
			hasRoot = true
			break
		}
	}
	if !hasRoot {
		adminUsers = append(adminUsers, "root")
	}

	shareDirs := make(map[string]bool)
	shareDirs["/DATA/KiyoVN"] = true
	shareDirs["/mnt/DATA/KiyoVN"] = true

	sRows, sErr := sqliteDB.Query(`SELECT path FROM network_shares WHERE status = 'active'`)
	if sErr == nil {
		defer sRows.Close()
		for sRows.Next() {
			var p string
			if err := sRows.Scan(&p); err == nil && p != "" {
				shareDirs[p] = true
			}
		}
	}

	ensureDatasetsLinkedToShare("/DATA/KiyoVN")
	applyFolderACLs(shareDirs, adminUsers, users)
	writeUnifiedSmbConf(shareDirs, adminUsers, users)

	_ = exec.Command("smbcontrol", "smbd", "reload-config").Run()
	_ = exec.Command("systemctl", "reload", "smbd").Run()
	_ = exec.Command("systemctl", "restart", "smbd").Run()

	return nil
}

func applyFolderACLs(shareDirs map[string]bool, adminUsers []string, users []UserPermRecord) {
	for shareDir := range shareDirs {
		fi, err := os.Stat(shareDir)
		if err != nil || !fi.IsDir() {
			continue
		}

		// Top level folder: 0755 (owner root:root), allows entering and seeing child folder names
		_ = exec.Command("chmod", "0755", shareDir).Run()
		_ = exec.Command("chown", "root:root", shareDir).Run()

		entries, err := os.ReadDir(shareDir)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			subName := entry.Name()
			subDir := filepath.Join(shareDir, subName)

			// Enable POSIX ACLs on ZFS if applicable
			_ = exec.Command("zfs", "set", "acltype=posix", "DATA").Run()
			_ = exec.Command("zfs", "set", "xattr=sa", "DATA").Run()
			_ = exec.Command("zfs", "set", "acltype=posix", "DATA/"+subName).Run()
			_ = exec.Command("zfs", "set", "xattr=sa", "DATA/"+subName).Run()

			// Determine ownership: if subName matches a known user, make them owner
			ownerUser := "root"
			for _, u := range users {
				if strings.EqualFold(u.Username, subName) {
					ownerUser = u.Username
					break
				}
			}
			if ownerUser == "root" {
				for _, u := range users {
					if u.Role == string(models.RoleAdmin) {
						continue
					}
					perm := checkUserFolderPermission(u.PermMap, subName, subDir)
					if perm == "editor" || perm == "writer" || perm == "owner" {
						ownerUser = u.Username
						break
					}
				}
			}

			if ownerUser != "root" {
				_ = exec.Command("chown", "-R", ownerUser+":root", subDir).Run()
				_ = exec.Command("chmod", "0770", subDir).Run()
			} else {
				_ = exec.Command("chown", "-R", "root:root", subDir).Run()
				_ = exec.Command("chmod", "0777", subDir).Run()
			}

			// Strip old ACLs
			_ = exec.Command("setfacl", "-b", subDir).Run()

			// Build ACL entries
			// Base: user::rwx,group::rwx,mask::rwx,other::---
			var aclEntries []string
			var defaultAclEntries []string

			aclEntries = append(aclEntries, "u::rwx", "g::rwx", "m::rwx", "o::---")
			defaultAclEntries = append(defaultAclEntries, "d:u::rwx", "d:g::rwx", "d:m::rwx", "d:o::---")

			// Add admins with full rwx
			for _, adm := range adminUsers {
				aclEntries = append(aclEntries, fmt.Sprintf("u:%s:rwx", adm))
				defaultAclEntries = append(defaultAclEntries, fmt.Sprintf("d:u:%s:rwx", adm))
			}

			// Check each regular user
			for _, u := range users {
				if u.Role == string(models.RoleAdmin) {
					continue // Already added
				}
				if len(u.PermMap) == 0 {
					continue
				}

				// Check if user has permission on this subfolder
				permLevel := checkUserFolderPermission(u.PermMap, subName, subDir)
				if permLevel == "editor" || permLevel == "writer" || permLevel == "owner" {
					aclEntries = append(aclEntries, fmt.Sprintf("u:%s:rwx", u.Username))
					defaultAclEntries = append(defaultAclEntries, fmt.Sprintf("d:u:%s:rwx", u.Username))
				} else if permLevel == "viewer" || permLevel == "reader" {
					aclEntries = append(aclEntries, fmt.Sprintf("u:%s:r-x", u.Username))
					defaultAclEntries = append(defaultAclEntries, fmt.Sprintf("d:u:%s:r-x", u.Username))
				}
			}

			// Apply to folder immediately
			aclStr := strings.Join(aclEntries, ",")
			defAclStr := strings.Join(defaultAclEntries, ",")
			_ = exec.Command("setfacl", "-m", aclStr, subDir).Run()
			_ = exec.Command("setfacl", "-m", defAclStr, subDir).Run()
			_ = exec.Command("setfacl", "-m", "o::---", subDir).Run()
			_ = exec.Command("setfacl", "-m", "d:o::---", subDir).Run()

			// Apply recursively to children in background
			go func(dir, acls, defAcls string) {
				_ = exec.Command("setfacl", "-R", "-m", acls, dir).Run()
				_ = exec.Command("setfacl", "-R", "-m", defAcls, dir).Run()
				_ = exec.Command("setfacl", "-R", "-m", "o::---", dir).Run()
				_ = exec.Command("setfacl", "-R", "-m", "d:o::---", dir).Run()
			}(subDir, aclStr, defAclStr)
		}
	}
}

// writeUnifiedSmbConf regenerates /etc/samba/smb.conf with root share and individual subfolder shares.
func writeUnifiedSmbConf(shareDirs map[string]bool, adminUsers []string, users []UserPermRecord) {
	confPath := "/etc/samba/smb.conf"
	var sb strings.Builder

	// Collect all unique user accounts for KiyoVN valid users
	var allValidUsers []string
	allValidUsers = append(allValidUsers, adminUsers...)
	for _, u := range users {
		allValidUsers = append(allValidUsers, u.Username)
	}
	seenUsers := make(map[string]bool)
	var uniqueAllUsers []string
	for _, v := range allValidUsers {
		trimmed := strings.TrimSpace(v)
		if trimmed != "" && !seenUsers[trimmed] {
			seenUsers[trimmed] = true
			uniqueAllUsers = append(uniqueAllUsers, trimmed)
		}
	}
	kiyoValidUsers := strings.Join(uniqueAllUsers, ", ")

	sb.WriteString(fmt.Sprintf(`[global]
   workgroup = WORKGROUP
   server string = LocalDrive NAS
   security = user
   map to guest = Never
   guest account = nobody
   null passwords = yes
   vfs objects = acl_xattr
   map acl inherit = yes
   store dos attributes = yes
   inherit acls = yes
   inherit permissions = yes
   usershare path = /var/lib/samba/usershares
   usershare max shares = 100
   usershare allow guests = no
   usershare owner only = false
   follow symlinks = yes
   wide links = yes
   unix extensions = no
   allow insecure wide links = yes

[KiyoVN]
   comment = LocalDrive KiyoVN Main Share
   path = /DATA/KiyoVN
   browseable = yes
   writable = yes
   read only = no
   write list = %s
   guest ok = no
   valid users = %s
   inherit acls = yes
   inherit permissions = yes
   create mask = 0664
   directory mask = 0775
   follow symlinks = yes
   wide links = yes
`, kiyoValidUsers, kiyoValidUsers))

	// Scan /DATA/KiyoVN subfolders and create dedicated individual shares
	entries, err := os.ReadDir("/DATA/KiyoVN")
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			subName := entry.Name()
			subPath := filepath.Join("/DATA/KiyoVN", subName)

			// Find allowed users for this specific subfolder
			var validUsersList []string
			validUsersList = append(validUsersList, adminUsers...)

			for _, u := range users {
				if u.Role == string(models.RoleAdmin) {
					continue
				}
				if perm := checkUserFolderPermission(u.PermMap, subName, subPath); perm != "" {
					validUsersList = append(validUsersList, u.Username)
				}
			}

			// Deduplicate valid users
			seen := make(map[string]bool)
			var uniqueUsers []string
			for _, v := range validUsersList {
				if !seen[v] {
					seen[v] = true
					uniqueUsers = append(uniqueUsers, v)
				}
			}

			uListStr := strings.Join(uniqueUsers, ", ")
			forceUserStr := ""
			for _, u := range users {
				if strings.EqualFold(u.Username, subName) {
					forceUserStr = fmt.Sprintf("   force user = %s\n", u.Username)
					break
				}
			}
			sb.WriteString(fmt.Sprintf(`
[%s]
   comment = LocalDrive Share for %s
   path = %s
   browseable = yes
   writable = yes
   read only = no
   write list = %s
   guest ok = no
   valid users = %s
%s   inherit acls = yes
   inherit permissions = yes
   create mask = 0664
   directory mask = 0775
   follow symlinks = yes
   wide links = yes
`, subName, subName, subPath, uListStr, uListStr, forceUserStr))
		}
	}

	_ = os.WriteFile(confPath, []byte(sb.String()), 0644)
}
