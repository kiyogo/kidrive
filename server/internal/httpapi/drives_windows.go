//go:build windows

package httpapi

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

var (
	kernel32Dll            = syscall.NewLazyDLL("kernel32.dll")
	procGetLogicalDrives    = kernel32Dll.NewProc("GetLogicalDrives")
	procGetDiskFreeSpaceExW = kernel32Dll.NewProc("GetDiskFreeSpaceExW")
	procGetVolumeInfoW      = kernel32Dll.NewProc("GetVolumeInformationW")
	procGetDriveTypeW       = kernel32Dll.NewProc("GetDriveTypeW")

	physMu       sync.Mutex
	physCache    map[string]physicalDiskItem
	physCachedAt time.Time
)

type physicalDiskItem struct {
	Letter       string `json:"Letter"`
	DeviceId     string `json:"DeviceId"`
	Model        string `json:"Model"`
	Serial       string `json:"Serial"`
	MediaType    string `json:"MediaType"`
	Health       string `json:"Health"`
	Operational  string `json:"Operational"`
	Temperature  int    `json:"Temperature"`
	PowerOnHours int64  `json:"PowerOnHours"`
	BadSectors   int64  `json:"BadSectors"`
	Wear         int    `json:"Wear"`
}

func getPhysicalDisksMap() map[string]physicalDiskItem {
	physMu.Lock()
	defer physMu.Unlock()

	if physCache != nil && time.Since(physCachedAt) < 60*time.Second {
		return physCache
	}

	psScript := `$parts = Get-Partition | Where-Object DriveLetter | Select-Object DiskNumber, DriveLetter; ` +
		`$disks = Get-PhysicalDisk | Select-Object DeviceId, FriendlyName, SerialNumber, MediaType, HealthStatus, OperationalStatus; ` +
		`$reliables = @{}; ` +
		`try { ` +
		`    $rc = Get-PhysicalDisk | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue; ` +
		`    if ($rc) { foreach ($r in $rc) { $reliables[[string]$r.DeviceId] = $r } } ` +
		`} catch {}; ` +
		`$result = @(); ` +
		`foreach ($p in $parts) { ` +
		`    $d = $disks | Where-Object DeviceId -eq $p.DiskNumber | Select-Object -First 1; ` +
		`    if ($d) { ` +
		`        $temp = 0; $poh = 0; $bad = 0; $wear = 0; ` +
		`        $rel = $reliables[[string]$d.DeviceId]; ` +
		`        if ($rel) { ` +
		`            if ($rel.Temperature) { $temp = [int]$rel.Temperature }; ` +
		`            if ($rel.PowerOnHours) { $poh = [int64]$rel.PowerOnHours }; ` +
		`            if ($rel.ReadErrorsTotal) { $bad = [int64]$rel.ReadErrorsTotal }; ` +
		`            if ($rel.Wear) { $wear = [int]$rel.Wear }; ` +
		`        }; ` +
		`        $result += [PSCustomObject]@{ ` +
		`            Letter = [string]$p.DriveLetter; ` +
		`            DeviceId = [string]$d.DeviceId; ` +
		`            Model = [string]$d.FriendlyName; ` +
		`            Serial = [string]$d.SerialNumber; ` +
		`            MediaType = [string]$d.MediaType; ` +
		`            Health = [string]$d.HealthStatus; ` +
		`            Operational = [string]$d.OperationalStatus; ` +
		`            Temperature = $temp; ` +
		`            PowerOnHours = $poh; ` +
		`            BadSectors = $bad; ` +
		`            Wear = $wear ` +
		`        } ` +
		`    } ` +
		`}; ` +
		`$result | ConvertTo-Json -Compress`
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", psScript)
	out, err := cmd.Output()
	if err != nil || len(out) == 0 {
		if physCache != nil {
			return physCache
		}
		return map[string]physicalDiskItem{}
	}

	var list []physicalDiskItem
	if err := json.Unmarshal(out, &list); err != nil {
		var single physicalDiskItem
		if errSingle := json.Unmarshal(out, &single); errSingle == nil {
			list = []physicalDiskItem{single}
		}
	}

	result := make(map[string]physicalDiskItem, len(list))
	for _, item := range list {
		key := strings.ToUpper(strings.TrimSpace(item.Letter))
		result[key] = item
	}

	physCache = result
	physCachedAt = time.Now()
	return result
}

func detectHostDrives(registered map[string]struct{}) []driveDTO {
	ret, _, _ := procGetLogicalDrives.Call()
	mask := uint32(ret)
	if mask == 0 {
		return nil
	}

	physMap := getPhysicalDisksMap()

	var drives []driveDTO
	for i := 0; i < 26; i++ {
		if (mask & (1 << i)) == 0 {
			continue
		}
		letter := byte('A' + i)
		letterStr := string(letter)
		rootPath := fmt.Sprintf("%c:\\", letter)
		rootPtr, err := syscall.UTF16PtrFromString(rootPath)
		if err != nil {
			continue
		}

		dtRet, _, _ := procGetDriveTypeW.Call(uintptr(unsafe.Pointer(rootPtr)))
		driveType := uint32(dtRet)
		// DRIVE_REMOVABLE = 2, DRIVE_FIXED = 3, DRIVE_REMOTE = 4, DRIVE_RAMDISK = 6
		// Skip CD-ROM (5) or unknown (0/1)
		if driveType != 2 && driveType != 3 && driveType != 4 {
			continue
		}

		var freeToCaller, totalBytes, totalFree uint64
		freeRet, _, _ := procGetDiskFreeSpaceExW.Call(
			uintptr(unsafe.Pointer(rootPtr)),
			uintptr(unsafe.Pointer(&freeToCaller)),
			uintptr(unsafe.Pointer(&totalBytes)),
			uintptr(unsafe.Pointer(&totalFree)),
		)
		if freeRet == 0 || totalBytes == 0 {
			continue
		}

		nameBuf := make([]uint16, 261)
		fsBuf := make([]uint16, 261)
		var serial, maxComponent, flags uint32
		procGetVolumeInfoW.Call(
			uintptr(unsafe.Pointer(rootPtr)),
			uintptr(unsafe.Pointer(&nameBuf[0])), uintptr(len(nameBuf)),
			uintptr(unsafe.Pointer(&serial)),
			uintptr(unsafe.Pointer(&maxComponent)),
			uintptr(unsafe.Pointer(&flags)),
			uintptr(unsafe.Pointer(&fsBuf[0])), uintptr(len(fsBuf)),
		)

		volName := syscall.UTF16ToString(nameBuf)
		fsName := syscall.UTF16ToString(fsBuf)
		if fsName == "" {
			fsName = "NTFS"
		}

		label := volName
		if label == "" {
			label = fmt.Sprintf("Ổ đĩa (%c:)", letter)
		} else {
			label = fmt.Sprintf("%s (%c:)", label, letter)
		}

		inUse := false
		cleanRoot := strings.ToLower(filepath.Clean(rootPath))
		for reg := range registered {
			cleanReg := strings.ToLower(reg)
			if strings.HasPrefix(cleanReg, cleanRoot) {
				inUse = true
				break
			}
		}

		model := fmt.Sprintf("Local Disk (%c:)", letter)
		serialNum := ""
		mediaType := "HDD"
		healthStatus := "UNKNOWN"
		operationalStatus := "Unmapped Device"
		smartStatus := "UNKNOWN"
		temperature := 0
		powerOnHours := int64(0)
		badSectors := int64(0)

		if driveType == 2 {
			mediaType = "Removable"
			healthStatus = "UNSUPPORTED"
			smartStatus = "UNSUPPORTED"
			operationalStatus = "Removable Drive"
		} else if driveType == 4 {
			mediaType = "Network"
			healthStatus = "UNSUPPORTED"
			smartStatus = "UNSUPPORTED"
			operationalStatus = "Network Share"
		}

		if phys, found := physMap[letterStr]; found {
			if phys.Model != "" {
				model = phys.Model
			}
			serialNum = phys.Serial
			if phys.MediaType != "" {
				mediaType = phys.MediaType
			}
			switch {
			case strings.EqualFold(phys.Health, "Healthy"):
				healthStatus = "HEALTHY"
				smartStatus = "PASSED"
			case strings.EqualFold(phys.Health, "Warning"):
				healthStatus = "WARNING"
				smartStatus = "WARNING"
			case strings.EqualFold(phys.Health, "Unhealthy"):
				healthStatus = "CRITICAL"
				smartStatus = "FAILED"
			default:
				healthStatus = "UNKNOWN"
				smartStatus = "UNKNOWN"
			}
			if phys.Operational != "" {
				operationalStatus = phys.Operational
			}
			temperature = phys.Temperature
			powerOnHours = phys.PowerOnHours
			badSectors = phys.BadSectors
		}

		usedBytesVal := int64(0)
		if totalBytes > totalFree {
			usedBytesVal = int64(totalBytes - totalFree)
		}

		drives = append(drives, driveDTO{
			ID:                fmt.Sprintf("drive_%c", letter),
			Name:              fmt.Sprintf("%c:", letter),
			Label:             label,
			Filesystem:        fsName,
			SizeBytes:         int64(totalBytes),
			FreeBytes:         int64(totalFree),
			UsedBytes:         usedBytesVal,
			Removable:         driveType == 2,
			MountPoint:        rootPath,
			Model:             model,
			SerialNumber:      serialNum,
			MediaType:         mediaType,
			HealthStatus:      healthStatus,
			OperationalStatus: operationalStatus,
			Temperature:       temperature,
			PowerOnHours:      powerOnHours,
			BadSectors:        badSectors,
			SmartStatus:       smartStatus,
			Mounted:           true,
			Usable:            true,
			InUse:             inUse,
			ReadOnly:          false,
		})
	}
	return drives
}
