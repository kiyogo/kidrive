//go:build !windows

package httpapi

import (
	"bufio"
	"errors"
	"os/exec"
	"strconv"
	"strings"
)

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
	out, err := exec.Command("zpool", "status", "-P", poolName).Output()
	if err != nil {
		out, err = exec.Command("zpool", "status", poolName).Output()
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
			if devName == poolName ||
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
	out, err := exec.Command("zpool", "list", "-H", "-p", "-o", "size,alloc,free,health", poolName).Output()
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
		health := strings.TrimSpace(fields[3])
		return size, alloc, health, nil
	}
	return 0, 0, "", errors.New("invalid zpool list output")
}
