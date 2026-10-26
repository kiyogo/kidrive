package httpapi

import (
	"testing"
)

func TestCheckUserFolderPermission(t *testing.T) {
	// User Long has editor permission only on Long_4
	longPerms := map[string]any{
		"DATA/KiyoVN/Long_4": "editor",
	}

	if perm := checkUserFolderPermission(longPerms, "Long_4", "/DATA/KiyoVN/Long_4"); perm != "editor" {
		t.Fatalf("expected editor for Long_4, got %q", perm)
	}

	if perm := checkUserFolderPermission(longPerms, "DaoKy_5", "/DATA/KiyoVN/DaoKy_5"); perm != "" {
		t.Fatalf("expected empty (access denied) for DaoKy_5, got %q", perm)
	}

	if perm := checkUserFolderPermission(longPerms, "NgLoc_6", "/DATA/KiyoVN/NgLoc_6"); perm != "" {
		t.Fatalf("expected empty for NgLoc_6, got %q", perm)
	}

	if perm := checkUserFolderPermission(longPerms, "1Data", "/DATA/KiyoVN/1Data"); perm != "" {
		t.Fatalf("expected empty for 1Data, got %q", perm)
	}

	// User DaoKy has viewer permission only on DaoKy_5
	daoKyPerms := map[string]any{
		"DATA/KiyoVN/DaoKy_5": "viewer",
	}

	if perm := checkUserFolderPermission(daoKyPerms, "DaoKy_5", "/DATA/KiyoVN/DaoKy_5"); perm != "viewer" {
		t.Fatalf("expected viewer for DaoKy_5, got %q", perm)
	}

	if perm := checkUserFolderPermission(daoKyPerms, "Long_4", "/DATA/KiyoVN/Long_4"); perm != "" {
		t.Fatalf("expected empty for Long_4, got %q", perm)
	}

	// Root/Wildcard permission
	rootPerms := map[string]any{
		"/": "editor",
	}
	if perm := checkUserFolderPermission(rootPerms, "DaoKy_5", "/DATA/KiyoVN/DaoKy_5"); perm != "editor" {
		t.Fatalf("expected editor for root user, got %q", perm)
	}
	if perm := checkUserFolderPermission(rootPerms, "Long_4", "/DATA/KiyoVN/Long_4"); perm != "editor" {
		t.Fatalf("expected editor for root user, got %q", perm)
	}
}
