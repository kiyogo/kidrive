//go:build !windows

package httpapi

func detectHostDrives(registered map[string]struct{}) []driveDTO {
	return nil
}
