//go:build windows

package httpapi

type ZFSPoolInfo struct {
	Name       string           `json:"name"`
	ID         string           `json:"id"`
	State      string           `json:"state"`
	Status     string           `json:"status"`
	Layout     string           `json:"layout"`
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
	return false
}

func hasZFSMemberDisks() bool {
	return false
}

func detectZFSPools() []ZFSPoolInfo {
	return nil
}

func listZFSDatasets(poolName string) []ZFSDatasetInfo {
	return nil
}

func importZFSPoolCmd(poolNameOrID string) error {
	return nil
}

func exportZFSPoolCmd(poolName string, force bool) error {
	return nil
}

func getZFSPoolDisks(poolName string) []string {
	return nil
}

func getZFSPoolCapacity(poolName string) (int64, int64, string, error) {
	return 0, 0, "", nil
}

func UnlockStorageRW(pathHint string) {}

