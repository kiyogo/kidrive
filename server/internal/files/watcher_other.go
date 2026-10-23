//go:build !windows

package files

import "context"

// StartVirtualDriveWatcher is a no-op on non-Windows platforms.
func (s *Service) StartVirtualDriveWatcher(ctx context.Context) {}

func cleanupDriveLRegistry() {}

func ensureDriveLRegistry(vDrive string) {}

func notifyShell() {}
