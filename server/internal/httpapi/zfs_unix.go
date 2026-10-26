//go:build !windows

package httpapi

import (
	"bufio"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
)

var unlockStorageMu sync.Mutex

type ZFSPoolInfo struct {
	Name       string           `json:"name"`
	ID         string           `json:"id"`
	State      string           `json:"state"`
	Status     string           `json:"status"`
	Layout     string           `json:"layout"` // "ZFS"
	Disks      []string         `json:"disks"`
	TotalBytes int64            `json:"total_bytes"`
	UsedBytes  int64            `json:"used_bytes"`
	Imported   bool             `json:"imported"`
	Datasets   []ZFSDatasetInfo `json:"datasets"`
}

type ZFSDatasetInfo struct {
	Name       string `json:"name"`
	MountPoint string `json:"mountpoint"`
	UsedBytes  int64  `json:"used_bytes"`
	AvailBytes int64  `json:"avail_bytes"`
	ReferBytes int64  `json:"refer_bytes"`
}

func hasZFSTools() bool {
	_, err := exec.LookPath("zpool")
	return err == nil
}

func hasZFSMemberDisks() bool {
	cmd := exec.Command("lsblk", "-b", "-J", "-o", "NAME,FSTYPE")
	out, err := cmd.Output()
	if err == nil && strings.Contains(string(out), "zfs_member") {
		return true
	}
	if bOut, bErr := exec.Command("blkid").Output(); bErr == nil {
		if strings.Contains(string(bOut), "zfs_member") {
			return true
		}
	}
	return false
}

func detectZFSPools() []ZFSPoolInfo {
	if !hasZFSTools() {
		return nil
	}

	var pools []ZFSPoolInfo
	seenPools := make(map[string]bool)

	// 1. Check already imported pools: zpool list -H -p -o name,size,alloc,free,health
	if out, err := exec.Command("zpool", "list", "-H", "-p", "-o", "name,size,alloc,free,health").Output(); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(out)))
		for scanner.Scan() {
			fields := strings.Split(scanner.Text(), "\t")
			if len(fields) >= 5 {
				name := strings.TrimSpace(fields[0])
				if name == "" {
					continue
				}
				size, _ := strconv.ParseInt(strings.TrimSpace(fields[1]), 10, 64)
				alloc, _ := strconv.ParseInt(strings.TrimSpace(fields[2]), 10, 64)
				health := strings.TrimSpace(fields[4])
				datasets := listZFSDatasets(name)
				disks := getZFSPoolDisks(name)

				pools = append(pools, ZFSPoolInfo{
					Name:       name,
					State:      health,
					Status:     "Mảng lưu trữ ZFS đã kết nối",
					Layout:     "ZFS",
					Disks:      disks,
					TotalBytes: size,
					UsedBytes:  alloc,
					Imported:   true,
					Datasets:   datasets,
				})
				seenPools[strings.ToLower(name)] = true
			}
		}
	}

	// 2. Check unimported pools: try zpool import -d /dev first, then zpool import
	importCmds := [][]string{
		{"zpool", "import", "-d", "/dev"},
		{"zpool", "import"},
	}
	for _, cmdArgs := range importCmds {
		if out, err := exec.Command(cmdArgs[0], cmdArgs[1:]...).Output(); err == nil && len(out) > 0 {
			scanner := bufio.NewScanner(strings.NewReader(string(out)))
			var currentPool *ZFSPoolInfo
			inConfig := false

			for scanner.Scan() {
				line := scanner.Text()
				trimmed := strings.TrimSpace(line)

				if strings.HasPrefix(trimmed, "pool:") {
					if currentPool != nil && currentPool.Name != "" && !seenPools[strings.ToLower(currentPool.Name)] {
						pools = append(pools, *currentPool)
						seenPools[strings.ToLower(currentPool.Name)] = true
					}
					name := strings.TrimSpace(strings.TrimPrefix(trimmed, "pool:"))
					currentPool = &ZFSPoolInfo{
						Name:     name,
						Layout:   "ZFS",
						State:    "ONLINE",
						Status:   "Mảng lưu trữ ZFS (TrueNAS) sẵn sàng nhập",
						Imported: false,
					}
					inConfig = false
				} else if currentPool != nil {
					if strings.HasPrefix(trimmed, "id:") {
						currentPool.ID = strings.TrimSpace(strings.TrimPrefix(trimmed, "id:"))
					} else if strings.HasPrefix(trimmed, "state:") {
						currentPool.State = strings.TrimSpace(strings.TrimPrefix(trimmed, "state:"))
					} else if strings.HasPrefix(trimmed, "status:") {
						currentPool.Status = strings.TrimSpace(strings.TrimPrefix(trimmed, "status:"))
					} else if strings.HasPrefix(trimmed, "config:") {
						inConfig = true
					} else if inConfig {
						fields := strings.Fields(trimmed)
						if len(fields) > 0 {
							devName := fields[0]
							devLower := strings.ToLower(devName)
							if devName != currentPool.Name &&
								!strings.EqualFold(devName, "mirror") &&
								!strings.HasPrefix(devLower, "mirror-") &&
								!strings.HasPrefix(devLower, "raidz") &&
								!strings.HasPrefix(devLower, "spare") &&
								!strings.HasPrefix(devLower, "log") &&
								!strings.HasPrefix(devLower, "cache") &&
								devName != "NAME" &&
								devName != "STATE" &&
								devName != "READ" &&
								devName != "WRITE" &&
								devName != "CKSUM" {
								devPath := devName
								if !strings.HasPrefix(devPath, "/dev/") {
									devPath = "/dev/" + devName
								}
								currentPool.Disks = append(currentPool.Disks, devPath)
							}
						}
					}
				}
			}

			if currentPool != nil && currentPool.Name != "" && !seenPools[strings.ToLower(currentPool.Name)] {
				pools = append(pools, *currentPool)
				seenPools[strings.ToLower(currentPool.Name)] = true
			}
		}
	}

	return pools
}

func listZFSDatasets(poolName string) []ZFSDatasetInfo {
	var datasets []ZFSDatasetInfo
	cmd := exec.Command("zfs", "list", "-H", "-p", "-o", "name,mountpoint,used,avail,refer", "-r", poolName)
	out, err := cmd.Output()
	if err != nil {
		return datasets
	}

	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		fields := strings.Split(scanner.Text(), "\t")
		if len(fields) >= 5 {
			name := strings.TrimSpace(fields[0])
			mount := strings.TrimSpace(fields[1])
			used, _ := strconv.ParseInt(strings.TrimSpace(fields[2]), 10, 64)
			avail, _ := strconv.ParseInt(strings.TrimSpace(fields[3]), 10, 64)
			refer, _ := strconv.ParseInt(strings.TrimSpace(fields[4]), 10, 64)

			if mount == "none" || mount == "legacy" {
				mount = "/" + name
			}

			datasets = append(datasets, ZFSDatasetInfo{
				Name:       name,
				MountPoint: mount,
				UsedBytes:  used,
				AvailBytes: avail,
				ReferBytes: refer,
			})
		}
	}
	return datasets
}

func importZFSPoolCmd(poolNameOrID string) error {
	cmd := exec.Command("zpool", "import", "-f", "-d", "/dev", poolNameOrID)
	if err := cmd.Run(); err != nil {
		cmd2 := exec.Command("zpool", "import", "-f", poolNameOrID)
		if err2 := cmd2.Run(); err2 != nil {
			cmd3 := exec.Command("zpool", "import", "-f", "-N", poolNameOrID)
			if err3 := cmd3.Run(); err3 != nil {
				return err
			}
		}
	}
	_ = exec.Command("zfs", "mount", "-a").Run()
	return nil
}

func exportZFSPoolCmd(poolName string, force bool) error {
	args := []string{"export"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, poolName)
	return exec.Command("zpool", args...).Run()
}

func getZFSPoolDisks(poolName string) []string {
	targetName := poolName
	if out, err := exec.Command("zpool", "list", "-H", "-o", "name").Output(); err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			p := strings.TrimSpace(line)
			if strings.EqualFold(p, poolName) {
				targetName = p
				break
			}
		}
	}

	out, err := exec.Command("zpool", "status", "-P", targetName).Output()
	if err != nil {
		out, err = exec.Command("zpool", "status", targetName).Output()
		if err != nil {
			return nil
		}
	}
	var disks []string
	seen := make(map[string]bool)
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	inConfig := false
	for scanner.Scan() {
		trimmed := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(trimmed, "config:") {
			inConfig = true
			continue
		}
		if !inConfig {
			continue
		}
		if strings.HasPrefix(trimmed, "errors:") {
			break
		}
		fields := strings.Fields(trimmed)
		if len(fields) > 0 {
			devName := fields[0]
			devLower := strings.ToLower(devName)
			if strings.EqualFold(devName, targetName) ||
				strings.EqualFold(devName, poolName) ||
				strings.EqualFold(devName, "NAME") ||
				strings.EqualFold(devName, "mirror") ||
				strings.HasPrefix(devLower, "mirror-") ||
				strings.HasPrefix(devLower, "raidz") ||
				strings.HasPrefix(devLower, "draid") ||
				strings.HasPrefix(devLower, "spare") ||
				strings.HasPrefix(devLower, "spares") ||
				strings.HasPrefix(devLower, "log") ||
				strings.HasPrefix(devLower, "logs") ||
				strings.HasPrefix(devLower, "cache") ||
				strings.EqualFold(devName, "state") ||
				strings.EqualFold(devName, "read") ||
				strings.EqualFold(devName, "write") ||
				strings.EqualFold(devName, "cksum") {
				continue
			}
			devPath := devName
			if !strings.HasPrefix(devPath, "/dev/") && !strings.HasPrefix(devPath, "/") {
				devPath = "/dev/" + devName
			}
			if !seen[devPath] {
				seen[devPath] = true
				disks = append(disks, devPath)
			}
		}
	}
	return disks
}

func getZFSPoolCapacity(poolName string) (int64, int64, string, error) {
	targetName := poolName

	// 1. Quét danh sách các pool đang hoạt động để tìm tên chính xác không phân biệt hoa thường
	if out, err := exec.Command("zpool", "list", "-H", "-p", "-o", "name,size,alloc,free,health").Output(); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(out)))
		for scanner.Scan() {
			fields := strings.Split(scanner.Text(), "\t")
			if len(fields) < 5 {
				fields = strings.Fields(scanner.Text())
			}
			if len(fields) >= 5 {
				pName := strings.TrimSpace(fields[0])
				if strings.EqualFold(pName, poolName) {
					targetName = pName
					size, _ := strconv.ParseInt(strings.TrimSpace(fields[1]), 10, 64)
					alloc, _ := strconv.ParseInt(strings.TrimSpace(fields[2]), 10, 64)
					rawHealth := strings.TrimSpace(fields[4])
					health := "healthy"
					if !strings.EqualFold(rawHealth, "ONLINE") && !strings.EqualFold(rawHealth, "healthy") {
						health = rawHealth
					}

					// Lấy chính xác used_bytes từ ZFS dataset gốc (tránh double count)
					if zfsOut, zfsErr := exec.Command("zfs", "get", "-H", "-p", "-o", "value", "used", pName).Output(); zfsErr == nil {
						if zfsUsed, parseErr := strconv.ParseInt(strings.TrimSpace(string(zfsOut)), 10, 64); parseErr == nil && zfsUsed > 0 {
							alloc = zfsUsed
						}
					}

					if size > 0 && alloc > size {
						alloc = size
					}

					return size, alloc, health, nil
				}
			}
		}
	}

	// 2. Dự phòng: gọi trực tiếp zpool list với poolName
	out, err := exec.Command("zpool", "list", "-H", "-p", "-o", "size,alloc,free,health", targetName).Output()
	if err != nil {
		return 0, 0, "", err
	}
	fields := strings.Split(strings.TrimSpace(string(out)), "\t")
	if len(fields) < 4 {
		fields = strings.Fields(strings.TrimSpace(string(out)))
	}
	if len(fields) >= 4 {
		size, _ := strconv.ParseInt(strings.TrimSpace(fields[0]), 10, 64)
		alloc, _ := strconv.ParseInt(strings.TrimSpace(fields[1]), 10, 64)
		rawHealth := strings.TrimSpace(fields[3])
		health := "healthy"
		if !strings.EqualFold(rawHealth, "ONLINE") && !strings.EqualFold(rawHealth, "healthy") {
			health = rawHealth
		}

		if zfsOut, zfsErr := exec.Command("zfs", "get", "-H", "-p", "-o", "value", "used", targetName).Output(); zfsErr == nil {
			if zfsUsed, parseErr := strconv.ParseInt(strings.TrimSpace(string(zfsOut)), 10, 64); parseErr == nil && zfsUsed > 0 {
				alloc = zfsUsed
			}
		}

		if size > 0 && alloc > size {
			alloc = size
		}

		return size, alloc, health, nil
	}
	return 0, 0, "", errors.New("invalid zpool list output")
}

// UnlockStorageRW ensures all ZFS pools, datasets, and Linux mount points are in read-write mode.
func UnlockStorageRW(pathHint string) {
	unlockStorageMu.Lock()
	defer unlockStorageMu.Unlock()

	curPath := os.Getenv("PATH")
	if !strings.Contains(curPath, "/sbin") {
		_ = os.Setenv("PATH", curPath+":/sbin:/usr/sbin:/usr/local/sbin:/bin:/usr/bin")
	}

	// 0. Check if any ZFS pool (including DATA) is imported with pool-level readonly=on.
	// In OpenZFS, pool-level readonly=on can only be cleared by exporting and re-importing with readonly=off.
	// Before exporting, we must lazy-unmount any Linux bind mounts (/DATA, /mnt/DATA, /mnt/zfs-recovery)
	// and temporarily stop smbd so the pool is not held busy by VFS bind mounts.
	poolNames := []string{"DATA"}
	if out, err := exec.Command("zpool", "list", "-H", "-o", "name").Output(); err == nil {
		for _, p := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			p = strings.TrimSpace(p)
			if p != "" && !strings.EqualFold(p, "DATA") {
				poolNames = append(poolNames, p)
			}
		}
	}

	for _, pool := range poolNames {
		if out, err := exec.Command("zpool", "get", "-H", "-o", "value", "readonly", pool).Output(); err == nil {
			if strings.TrimSpace(string(out)) == "on" {
				_ = exec.Command("systemctl", "stop", "smbd", "nmbd").Run()
				unmountBindMountsForPool(pool)
				_ = exec.Command("zfs", "unmount", "-f", "-a").Run()
				_ = exec.Command("zfs", "unmount", "-f", pool).Run()
				if errExp := exec.Command("zpool", "export", "-f", pool).Run(); errExp != nil {
					unmountBindMountsForPool(pool)
					_ = exec.Command("zpool", "export", "-f", pool).Run()
				}

				// Try importing read-write
				imported := false
				importAttempts := [][]string{
					{"import", "-f", "-o", "readonly=off", "-R", "/mnt/zfs-recovery", pool},
					{"import", "-f", "-d", "/dev", "-o", "readonly=off", "-R", "/mnt/zfs-recovery", pool},
					{"import", "-f", "-F", "-o", "readonly=off", "-R", "/mnt/zfs-recovery", pool},
					{"import", "-f", "-o", "readonly=off", pool},
				}
				for _, args := range importAttempts {
					if exec.Command("zpool", args...).Run() == nil {
						imported = true
						break
					}
				}
				// Safety fallback: if pool hardware refuses RW import, re-import readonly=on so data stays accessible
				if !imported {
					_ = exec.Command("zpool", "import", "-f", "-o", "readonly=on", "-R", "/mnt/zfs-recovery", pool).Run()
				}
				_ = exec.Command("zfs", "set", "-r", "readonly=off", pool).Run()
				_ = exec.Command("zfs", "mount", "-a").Run()
				restoreRecoveryBindMounts()
				_ = exec.Command("systemctl", "start", "smbd").Run()
			}
		}
	}

	// 1. Pools: ensure readonly=off on all active pools
	for _, p := range poolNames {
		_ = exec.Command("zpool", "set", "readonly=off", p).Run()
		_ = exec.Command("zfs", "set", "-r", "readonly=off", p).Run()
	}

	// 2. All datasets: force readonly=off and mount
	if out, err := exec.Command("zfs", "list", "-H", "-o", "name").Output(); err == nil {
		for _, ds := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			ds = strings.TrimSpace(ds)
			if ds != "" {
				_ = exec.Command("zfs", "set", "readonly=off", ds).Run()
			}
		}
	}
	_ = exec.Command("zfs", "mount", "-a").Run()

	// 3. Remount known and active recovery/DATA mount points as rw
	for _, known := range []string{"/mnt/zfs-recovery", "/mnt/zfs-recovery/DATA", "/mnt/zfs-recovery/DATA/KiyoVN", "/DATA", "/DATA/KiyoVN"} {
		_ = exec.Command("mount", "-o", "remount,rw", known).Run()
		_ = os.Chmod(known, 0o777)
	}

	if mounts, err := os.ReadFile("/proc/mounts"); err == nil {
		for _, line := range strings.Split(string(mounts), "\n") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				mp := fields[1]
				if strings.Contains(mp, "zfs") || strings.Contains(mp, "DATA") || strings.Contains(mp, "KiyoVN") {
					_ = exec.Command("mount", "-o", "remount,rw", mp).Run()
					_ = os.Chmod(mp, 0o777)
				}
			}
		}
	}

	restoreRecoveryBindMounts()

	if pathHint != "" {
		clean := filepath.Clean(pathHint)
		_ = exec.Command("mount", "-o", "remount,rw", clean).Run()
		_ = exec.Command("mount", "-o", "remount,rw", filepath.Dir(clean)).Run()
		_ = os.Chmod(clean, 0o777)
		_ = os.Chmod(filepath.Dir(clean), 0o777)
		ensureOverlayWritableForPath(clean)
	}

	// Also ensure any read-only directories under /mnt/zfs-recovery/DATA/KiyoVN are overlay-writable
	if entries, err := os.ReadDir("/mnt/zfs-recovery/DATA/KiyoVN"); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				sub := filepath.Join("/mnt/zfs-recovery/DATA/KiyoVN", e.Name())
				if !isDirWritable(sub) {
					ensureOverlayWritableDir(sub)
				}
			}
		}
		restoreRecoveryBindMounts()
	}
}

func unmountBindMountsForPool(pool string) {
	mounts, err := os.ReadFile("/proc/mounts")
	if err != nil {
		return
	}
	var targets []string
	for _, line := range strings.Split(string(mounts), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		mp := fields[1]
		if mp == "/" {
			continue
		}
		if strings.HasPrefix(mp, "/mnt/zfs-recovery") ||
			strings.HasPrefix(mp, "/DATA") ||
			strings.HasPrefix(mp, "/mnt/DATA") ||
			strings.HasPrefix(mp, "/"+pool) {
			targets = append(targets, mp)
		}
	}
	// Sort longest mount point first so nested mounts are unmounted before parents
	sort.Slice(targets, func(i, j int) bool {
		return len(targets[i]) > len(targets[j])
	})
	for _, mp := range targets {
		_ = exec.Command("umount", "-l", mp).Run()
	}
}

func restoreRecoveryBindMounts() {
	srcRoot := "/mnt/zfs-recovery/DATA/KiyoVN"
	dstRoot := "/DATA/KiyoVN"
	entries, err := os.ReadDir(srcRoot)
	if err != nil {
		return
	}
	_ = os.MkdirAll(dstRoot, 0o777)
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		srcDir := filepath.Join(srcRoot, e.Name())
		dstDir := filepath.Join(dstRoot, e.Name())
		_ = os.MkdirAll(dstDir, 0o777)
		// If dstDir is empty or not writable, bind-mount srcDir to dstDir
		if dstEntries, err := os.ReadDir(dstDir); err == nil && len(dstEntries) == 0 {
			if srcEntries, sErr := os.ReadDir(srcDir); sErr == nil && len(srcEntries) > 0 {
				_ = exec.Command("mount", "--bind", srcDir, dstDir).Run()
			}
		}
	}
}

func ensureOverlayWritableForPath(targetPath string) {
	// Walk up to the nearest existing directory
	cur := filepath.Clean(targetPath)
	for cur != "/" && cur != "." {
		if info, err := os.Stat(cur); err == nil && info.IsDir() {
			break
		}
		cur = filepath.Dir(cur)
	}
	if cur == "/" || cur == "." || isDirWritable(cur) {
		return
	}

	// Prefer mounting overlay at the dataset boundary (e.g. /mnt/zfs-recovery/DATA/KiyoVN/NgLoc_6 or /DATA/KiyoVN/NgLoc_6)
	mountDir := cur
	parts := strings.Split(strings.TrimPrefix(filepath.ToSlash(cur), "/"), "/")
	if len(parts) >= 5 && parts[0] == "mnt" && parts[1] == "zfs-recovery" && strings.EqualFold(parts[2], "DATA") && strings.EqualFold(parts[3], "KiyoVN") {
		mountDir = "/" + filepath.Join(parts[0], parts[1], parts[2], parts[3], parts[4])
	} else if len(parts) >= 3 && strings.EqualFold(parts[0], "DATA") && strings.EqualFold(parts[1], "KiyoVN") {
		mountDir = "/" + filepath.Join(parts[0], parts[1], parts[2])
	}
	ensureOverlayWritableDir(mountDir)
}

func ensureOverlayWritableDir(dir string) {
	dir = filepath.Clean(dir)
	if dir == "/" || dir == "." || isDirWritable(dir) {
		return
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return
	}

	// Sanitize dir name for overlay storage under /var/lib/localdrive/overlay
	safeID := strings.NewReplacer("/", "_", "\\", "_", ":", "_", " ", "_").Replace(strings.TrimPrefix(dir, "/"))
	if safeID == "" {
		return
	}
	baseOverlay := filepath.Join("/var/lib/localdrive/overlay", safeID)
	lowerDir := filepath.Join(baseOverlay, "lower")
	upperDir := filepath.Join(baseOverlay, "upper")
	workDir := filepath.Join(baseOverlay, "work")

	_ = exec.Command("modprobe", "overlay").Run()
	if err := os.MkdirAll(lowerDir, 0o777); err != nil {
		return
	}
	if err := os.MkdirAll(upperDir, 0o777); err != nil {
		return
	}
	_ = os.RemoveAll(workDir)
	if err := os.MkdirAll(workDir, 0o777); err != nil {
		return
	}

	// Bind-mount the read-only directory to lowerDir if lowerDir is empty
	if lEntries, err := os.ReadDir(lowerDir); err == nil && len(lEntries) == 0 {
		_ = exec.Command("mount", "--bind", dir, lowerDir).Run()
	}

	opts := "lowerdir=" + lowerDir + ",upperdir=" + upperDir + ",workdir=" + workDir
	if err := exec.Command("mount", "-t", "overlay", "overlay", "-o", opts, dir).Run(); err == nil {
		_ = os.Chmod(dir, 0o777)
	}
}
