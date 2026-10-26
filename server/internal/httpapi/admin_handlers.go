package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/MultiX0/LocalDrive/server/internal/audit"
	"github.com/MultiX0/LocalDrive/server/internal/auth"
	mw "github.com/MultiX0/LocalDrive/server/internal/middleware"
	"github.com/MultiX0/LocalDrive/server/internal/models"
	"github.com/MultiX0/LocalDrive/server/internal/settings"
	"github.com/MultiX0/LocalDrive/server/internal/ws"
)

func (a *API) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	limit := intQuery(r, "limit", 0)
	offset := intQuery(r, "offset", 0)
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	sortBy := strings.TrimSpace(r.URL.Query().Get("sort"))
	order := strings.TrimSpace(r.URL.Query().Get("order"))

	if limit > 0 {
		list, total, err := a.auth.ListUsersPaged(r.Context(), limit, offset, search, sortBy, order)
		if err != nil {
			a.fail(w, r, err)
			return
		}
		out := make([]*meBody, 0, len(list))
		for _, u := range list {
			out = append(out, userBody(u))
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"users":       out,
			"total":       total,
			"limit":       limit,
			"offset":      offset,
			"has_more":    int64(offset+len(out)) < total,
			"next_offset": offset + len(out),
		})
		return
	}

	list, err := a.auth.ListUsers(r.Context())
	if err != nil {
		a.fail(w, r, err)
		return
	}
	out := make([]*meBody, 0, len(list))
	for _, u := range list {
		out = append(out, userBody(u))
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out})
}

type adminCreateUserReq struct {
	Username           string `json:"username"`
	Password           string `json:"password"`
	DisplayName        string `json:"display_name"`
	Email              string `json:"email"`
	Role               string `json:"role"`
	QuotaBytes         int64  `json:"quota_bytes"`
	DatasetPermissions string `json:"dataset_permissions"`
}

func (a *API) handleAdminCreateUser(w http.ResponseWriter, r *http.Request) {
	var req adminCreateUserReq
	if !decodeJSON(w, r, &req) {
		return
	}
	adminID, ip := caller(r)
	created, err := a.auth.AdminCreateUser(r.Context(), adminID, auth.AdminCreateUserParams{
		Username:           req.Username,
		Password:           req.Password,
		DisplayName:        req.DisplayName,
		Email:              req.Email,
		Role:               models.Role(strings.TrimSpace(req.Role)),
		QuotaBytes:         req.QuotaBytes,
		DatasetPermissions: req.DatasetPermissions,
	}, ip)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	go a.SyncSambaUser(created.Username, req.Password)
	go a.SyncDatasetAndFolderACLs(context.Background())
	writeJSON(w, http.StatusCreated, map[string]any{"user": userBody(created)})
}

type adminUpdateUserReq struct {
	Username           string  `json:"username"`
	Password           string  `json:"password"`
	DisplayName        string  `json:"display_name"`
	Email              string  `json:"email"`
	Role               string  `json:"role"`
	QuotaBytes         *int64  `json:"quota_bytes"`
	Disabled           *bool   `json:"disabled"`
	DatasetPermissions *string `json:"dataset_permissions"`
}

func (a *API) handleAdminUpdateUser(w http.ResponseWriter, r *http.Request) {
	var req adminUpdateUserReq
	if !decodeJSON(w, r, &req) {
		return
	}
	adminID, ip := caller(r)
	targetID := chi.URLParam(r, "id")
	err := a.auth.AdminUpdateUser(r.Context(), adminID, targetID, auth.AdminUpdateUserParams{
		Username:           req.Username,
		Password:           req.Password,
		DisplayName:        req.DisplayName,
		Email:              req.Email,
		Role:               models.Role(strings.TrimSpace(req.Role)),
		QuotaBytes:         req.QuotaBytes,
		Disabled:           req.Disabled,
		DatasetPermissions: req.DatasetPermissions,
	}, ip)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	updated, err := a.auth.UserByID(r.Context(), targetID)
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if req.Password != "" {
		go a.SyncSambaUser(updated.Username, req.Password)
	}
	go a.SyncDatasetAndFolderACLs(context.Background())
	writeJSON(w, http.StatusOK, map[string]any{"user": userBody(updated)})
}

func (a *API) handleAdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	adminID, ip := caller(r)
	targetID := chi.URLParam(r, "id")
	if err := a.auth.AdminDeleteUser(r.Context(), adminID, targetID, ip); err != nil {
		a.fail(w, r, err)
		return
	}
	go a.SyncDatasetAndFolderACLs(context.Background())
	w.WriteHeader(http.StatusNoContent)
}

type resetPasswordRequest struct {
	NewPassword string `json:"new_password"`
}

func (a *API) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var req resetPasswordRequest
	if !decodeQuiet(r, &req) {
		req = resetPasswordRequest{}
	}
	adminID, ip := caller(r)
	temporary, err := a.auth.AdminResetPassword(r.Context(), adminID, chi.URLParam(r, "id"), req.NewPassword, ip)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	if u, err := a.auth.UserByID(r.Context(), chi.URLParam(r, "id")); err == nil {
		go a.SyncSambaUser(u.Username, temporary)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"temporary_password": temporary,
		"message":            "they will be asked to choose a new password when they sign in",
	})
}

type roleRequest struct {
	Role string `json:"role"`
}

func (a *API) handleSetRole(w http.ResponseWriter, r *http.Request) {
	var req roleRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	adminID, ip := caller(r)
	err := a.auth.SetRole(r.Context(), adminID, chi.URLParam(r, "id"),
		models.Role(strings.TrimSpace(req.Role)), ip)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type quotaRequest struct {
	QuotaBytes int64 `json:"quota_bytes"`
}

func (a *API) handleSetQuota(w http.ResponseWriter, r *http.Request) {
	var req quotaRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	adminID, ip := caller(r)
	if err := a.auth.SetQuota(r.Context(), adminID, chi.URLParam(r, "id"), req.QuotaBytes, ip); err != nil {
		a.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type disabledRequest struct {
	Disabled bool `json:"disabled"`
}

func (a *API) handleSetDisabled(w http.ResponseWriter, r *http.Request) {
	var req disabledRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	adminID, ip := caller(r)
	if err := a.auth.SetDisabled(r.Context(), adminID, chi.URLParam(r, "id"), req.Disabled, ip); err != nil {
		a.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type inviteRequest struct {
	Label     string `json:"label"`
	ExpiresAt int64  `json:"expires_at"`
}

func (a *API) handleCreateInvite(w http.ResponseWriter, r *http.Request) {
	var req inviteRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	adminID, ip := caller(r)
	invite, err := a.auth.CreateInvite(r.Context(), adminID, req.Label, req.ExpiresAt, ip)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, a.inviteBody(invite))
}

func (a *API) handleListInvites(w http.ResponseWriter, r *http.Request) {
	adminID, _ := caller(r)
	list, err := a.auth.ListInvites(r.Context(), adminID)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, inv := range list {
		out = append(out, a.inviteBody(inv))
	}
	writeJSON(w, http.StatusOK, map[string]any{"invites": out})
}

func (a *API) handleRevokeInvite(w http.ResponseWriter, r *http.Request) {
	adminID, ip := caller(r)
	if err := a.auth.RevokeInvite(r.Context(), adminID, chi.URLParam(r, "id"), ip); err != nil {
		a.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// inviteBody returns the code, a shareable link, and the payload a client
// renders as a QR locally, so the code never leaves this server.
func (a *API) inviteBody(inv models.Invite) map[string]any {
	link := "/invite/" + inv.Code
	if a.cfg.PublicBaseURL != "" {
		link = a.cfg.PublicBaseURL + link
	}
	return map[string]any{
		"id":         inv.ID,
		"code":       inv.Code,
		"label":      inv.Label,
		"link":       link,
		"qr_payload": link,
		"expires_at": inv.ExpiresAt,
		"used_by":    inv.UsedBy,
		"used_at":    inv.UsedAt,
		"revoked_at": inv.RevokedAt,
		"created_at": inv.CreatedAt,
		"usable":     inv.Usable(nowMillis()),
	}
}

// sessions and device approval

func (a *API) handleListSessions(w http.ResponseWriter, r *http.Request) {
	userID, _ := caller(r)
	list, err := a.auth.ListSessions(r.Context(), userID)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"sessions": sessionBodies(list, mw.SessionFrom(r.Context())),
	})
}

func (a *API) handleRevokeSession(w http.ResponseWriter, r *http.Request) {
	user, _ := mw.UserFrom(r.Context())
	if err := a.auth.RevokeSession(r.Context(), user, chi.URLParam(r, "id"), clientIP(r)); err != nil {
		a.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) handleListPendingDevices(w http.ResponseWriter, r *http.Request) {
	userID, _ := caller(r)
	list, err := a.auth.ListPendingDevices(r.Context(), userID, false)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"devices": sessionBodies(list, "")})
}

func (a *API) handleAdminPendingDevices(w http.ResponseWriter, r *http.Request) {
	userID, _ := caller(r)
	list, err := a.auth.ListPendingDevices(r.Context(), userID, true)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"devices": sessionBodies(list, "")})
}

func (a *API) handleApproveDevice(w http.ResponseWriter, r *http.Request) {
	user, _ := mw.UserFrom(r.Context())
	if err := a.auth.ApproveDevice(r.Context(), user, chi.URLParam(r, "id"), clientIP(r)); err != nil {
		a.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) handleDenyDevice(w http.ResponseWriter, r *http.Request) {
	user, _ := mw.UserFrom(r.Context())
	if err := a.auth.DenyDevice(r.Context(), user, chi.URLParam(r, "id"), clientIP(r)); err != nil {
		a.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func sessionBodies(list []models.Session, currentID string) []map[string]any {
	out := make([]map[string]any, 0, len(list))
	for _, s := range list {
		out = append(out, map[string]any{
			"id":           s.ID,
			"user_id":      s.UserID,
			"device_name":  s.DeviceName,
			"platform":     s.Platform,
			"status":       string(s.Status),
			"ip":           s.IP,
			"created_at":   s.CreatedAt,
			"last_seen_at": s.LastSeenAt,
			"approved_at":  s.ApprovedAt,
			"current":      currentID != "" && s.ID == currentID,
		})
	}
	return out
}

// server settings

func (a *API) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	cfg := a.settings.Get()
	writeJSON(w, http.StatusOK, settingsBody(cfg))
}

type settingsRequest struct {
	ServerName            *string `json:"server_name"`
	RequireDeviceApproval *bool   `json:"require_device_approval"`
	EnableLANDiscovery    *bool   `json:"enable_lan_discovery"`
	AllowSelfRegistration *bool   `json:"allow_self_registration"`
	TrashRetentionDays    *int    `json:"trash_retention_days"`
	VersionRetentionCount *int    `json:"version_retention_count"`
	VersionRetentionDays  *int    `json:"version_retention_days"`
}

func (a *API) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	user, _ := mw.UserFrom(r.Context())
	if !user.IsAdmin() {
		writeError(w, http.StatusForbidden, "forbidden", "that is an admin action")
		return
	}
	var req settingsRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	updated, err := a.settings.Apply(r.Context(), settings.Update{
		ServerName:            req.ServerName,
		RequireDeviceApproval: req.RequireDeviceApproval,
		EnableLANDiscovery:    req.EnableLANDiscovery,
		AllowSelfRegistration: req.AllowSelfRegistration,
		TrashRetentionDays:    req.TrashRetentionDays,
		VersionRetentionCount: req.VersionRetentionCount,
		VersionRetentionDays:  req.VersionRetentionDays,
	})
	if err != nil {
		a.fail(w, r, err)
		return
	}
	a.audit.Record(r.Context(), audit.Entry{
		UserID: user.ID, Action: audit.ActionSettingsChanged, IP: clientIP(r),
	})
	a.refreshDiscovery(r.Context())

	if list, err := a.auth.ListPublicUsers(r.Context(), ""); err == nil {
		ids := make([]string, 0, len(list))
		for _, u := range list {
			ids = append(ids, u.ID)
		}
		a.hub.Publish(ws.NewEvent(ws.EventSettingsChanged, nowMillis(), settingsBody(updated)), ids...)
	}
	writeJSON(w, http.StatusOK, settingsBody(updated))
}

func settingsBody(s models.ServerSettings) map[string]any {
	return map[string]any{
		"server_id":               s.ServerID,
		"server_name":             s.ServerName,
		"require_device_approval": s.RequireDeviceApproval,
		"enable_lan_discovery":    s.EnableLANDiscovery,
		"allow_self_registration": s.AllowSelfRegistration,
		"trash_retention_days":    s.TrashRetentionDays,
		"version_retention_count": s.VersionRetentionCount,
		"version_retention_days":  s.VersionRetentionDays,
		"setup_completed_at":      s.SetupCompletedAt,
	}
}
