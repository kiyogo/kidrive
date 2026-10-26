package app_test

import (
	"net/http"
	"testing"
)

// TestDeviceApprovalStateMachine verifies that device approval is bypassed
// completely and new devices sign in with active tokens immediately.
func TestDeviceApprovalStateMachine(t *testing.T) {
	h := newHarness(t)
	admin := h.setupAdmin("owner", "correct horse battery")
	h.invite(admin, "mom", "another long password")

	// the admin signs in from a new device and gets active tokens immediately
	second := h.anonymous()
	var login jsonMap
	second.mustDo(http.MethodPost, "/api/v1/auth/login", jsonMap{
		"username": "owner", "password": "correct horse battery",
		"device_name": "New Phone", "platform": "test",
	}, &login, http.StatusOK)

	if login["status"] == "pending" {
		t.Fatalf("a new device must not be held for approval, got %v", login["status"])
	}
	second.adopt(login)
	if second.AccessToken == "" || second.RefreshToken == "" {
		t.Fatal("a signed-in device must receive both access and refresh tokens")
	}
	second.mustDo(http.MethodGet, "/api/v1/me", nil, nil, http.StatusOK)
	second.createFolder("", "From The New Phone")
}

func TestDeniedDeviceStaysOut(t *testing.T) {
	h := newHarness(t)
	admin := h.setupAdmin("owner", "correct horse battery")
	h.invite(admin, "mom", "another long password")

	second := h.anonymous()
	var login jsonMap
	second.mustDo(http.MethodPost, "/api/v1/auth/login", jsonMap{
		"username": "owner", "password": "correct horse battery",
		"device_name": "Not Mine", "platform": "test",
	}, &login, http.StatusOK)
	second.adopt(login)

	// revoking the session locks that device out immediately
	admin.mustDo(http.MethodDelete, "/api/v1/sessions/"+second.SessionID, nil, nil, http.StatusNoContent)
	second.mustDo(http.MethodGet, "/api/v1/me", nil, nil, http.StatusUnauthorized)
}

func TestApprovalCanBeTurnedOffForASingleUserDeployment(t *testing.T) {
	h := newHarness(t)
	admin := h.setupAdmin("owner", "correct horse battery")
	h.invite(admin, "mom", "another long password")

	admin.mustDo(http.MethodPatch, "/api/v1/server/settings",
		jsonMap{"require_device_approval": false}, nil, http.StatusOK)

	second := h.anonymous()
	var out jsonMap
	second.mustDo(http.MethodPost, "/api/v1/auth/login", jsonMap{
		"username": "owner", "password": "correct horse battery",
		"device_name": "Another Laptop", "platform": "test",
	}, &out, http.StatusOK)
	second.adopt(out)
	second.mustDo(http.MethodGet, "/api/v1/me", nil, nil, http.StatusOK)
}

func TestOneDeviceCannotApproveAnotherAccountsDevice(t *testing.T) {
	h := newHarness(t)
	admin := h.setupAdmin("owner", "correct horse battery")
	member := h.invite(admin, "mom", "another long password")
	other := h.invite(admin, "sister", "yet another long password")

	// mom signs in from a second device and is active immediately
	secondDevice := h.anonymous()
	var login jsonMap
	secondDevice.mustDo(http.MethodPost, "/api/v1/auth/login", jsonMap{
		"username": "mom", "password": "another long password",
		"device_name": "Mom Tablet", "platform": "test",
	}, &login, http.StatusOK)
	secondDevice.adopt(login)

	// an unrelated member cannot revoke mom's session
	other.mustDo(http.MethodDelete, "/api/v1/sessions/"+secondDevice.SessionID, nil, nil, http.StatusForbidden)
	// mom's own account can see and manage her sessions
	member.mustDo(http.MethodDelete, "/api/v1/sessions/"+secondDevice.SessionID, nil, nil, http.StatusNoContent)
}

func TestTemporaryPasswordBlocksEverythingUntilChanged(t *testing.T) {
	h := newHarness(t)
	admin := h.setupAdmin("owner", "correct horse battery")
	member := h.invite(admin, "mom", "another long password")

	// this test is about the temporary password gate, so the separate
	// device-approval gate is turned off to keep the two apart
	admin.mustDo(http.MethodPatch, "/api/v1/server/settings",
		jsonMap{"require_device_approval": false}, nil, http.StatusOK)

	var reset jsonMap
	admin.mustDo(http.MethodPost, "/api/v1/admin/users/"+member.UserID+"/reset-password",
		jsonMap{}, &reset, http.StatusOK)
	temporary, _ := reset["temporary_password"].(string)
	if temporary == "" {
		t.Fatal("the reset did not return a temporary password")
	}

	// the reset ended every session on that account
	member.mustDo(http.MethodGet, "/api/v1/me", nil, nil, http.StatusUnauthorized)

	locked := h.anonymous()
	var login jsonMap
	locked.mustDo(http.MethodPost, "/api/v1/auth/login", jsonMap{
		"username": "mom", "password": temporary,
		"device_name": "Member Phone", "platform": "test",
	}, &login, http.StatusOK)
	locked.adopt(login)

	if must, _ := login["user"].(map[string]any)["must_change_password"].(bool); !must {
		t.Fatal("the account should be flagged as needing a new password")
	}

	// reads still work, nothing else does
	locked.mustDo(http.MethodGet, "/api/v1/me", nil, nil, http.StatusOK)
	locked.mustDo(http.MethodPost, "/api/v1/nodes/folder",
		jsonMap{"name": "Blocked"}, nil, http.StatusForbidden)

	// the one write it can make is choosing a new password
	locked.mustDo(http.MethodPatch, "/api/v1/me/password",
		jsonMap{"current_password": temporary, "new_password": "a brand new password"},
		nil, http.StatusNoContent)

	after := h.anonymous()
	var relogin jsonMap
	after.mustDo(http.MethodPost, "/api/v1/auth/login", jsonMap{
		"username": "mom", "password": "a brand new password",
		"device_name": "Member Phone", "platform": "test",
	}, &relogin, http.StatusOK)
	after.adopt(relogin)
	after.createFolder("", "Working Again")
}
