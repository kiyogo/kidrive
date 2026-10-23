package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/MultiX0/LocalDrive/server/internal/auth"
	"github.com/MultiX0/LocalDrive/server/internal/files"
	"github.com/MultiX0/LocalDrive/server/internal/libraries"
	"github.com/MultiX0/LocalDrive/server/internal/models"
	"github.com/MultiX0/LocalDrive/server/internal/settings"
	"github.com/MultiX0/LocalDrive/server/internal/shares"
)

// maxJSONBody caps a request body. Uploads never come through here.
const maxJSONBody = 1 << 20

// apiError is the one error envelope every endpoint returns.
type apiError struct {
	Error apiErrorBody `json:"error"`
}

type apiErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Default().Debug("response encode failed", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, apiError{Error: apiErrorBody{Code: code, Message: message}})
}

// fail maps a domain error onto a status and a plain, direct message. Keeping
// fail maps a domain error onto a status and a plain, direct message. Keeping
// this in one place is what stops handlers from inventing their own wording.
func (a *API) fail(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, files.ErrNotFound), errors.Is(err, auth.ErrNotFound),
		errors.Is(err, shares.ErrNotFound), errors.Is(err, libraries.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "Mục này không tồn tại hoặc đã bị xóa")

	case errors.Is(err, files.ErrForbidden), errors.Is(err, auth.ErrForbidden),
		errors.Is(err, shares.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "Bạn không có quyền thực hiện thao tác này")

	case errors.Is(err, files.ErrQuota):
		writeError(w, http.StatusInsufficientStorage, "quota_exceeded", "Dung lượng lưu trữ đã đầy, không thể tải tệp lên")

	case errors.Is(err, files.ErrNoStoragePool):
		writeError(w, http.StatusPreconditionRequired, "no_storage_pool", "Máy chủ chưa cấu hình Nhóm lưu trữ (Storage Pool), không thể lưu tệp")

	case errors.Is(err, files.ErrNoDataset):
		writeError(w, http.StatusPreconditionRequired, "no_dataset", "Máy chủ chưa cấu hình Tập dữ liệu (Dataset), không thể lưu tệp")

	case errors.Is(err, files.ErrNoCategoryPermission):
		writeError(w, http.StatusForbidden, "no_category_permission", "Tài khoản chưa được phân quyền danh mục lưu trữ (Tập dữ liệu), không thể lưu tệp")

	case errors.Is(err, files.ErrInvalidName), errors.Is(err, files.ErrNotAFolder),
		errors.Is(err, files.ErrNotAFile), errors.Is(err, files.ErrCycle),
		errors.Is(err, files.ErrCrossLibrary), errors.Is(err, files.ErrConflict),
		errors.Is(err, shares.ErrInvalid), errors.Is(err, settings.ErrInvalid),
		errors.Is(err, libraries.ErrInvalid), errors.Is(err, shares.ErrSelfShare):
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())

	case errors.Is(err, files.ErrTrashed):
		writeError(w, http.StatusConflict, "in_trash", "Mục này hiện đang nằm trong thùng rác")

	case errors.Is(err, auth.ErrCredentials):
		writeError(w, http.StatusUnauthorized, "bad_credentials", "Tên đăng nhập hoặc mật khẩu không chính xác")

	case errors.Is(err, auth.ErrDisabled):
		writeError(w, http.StatusForbidden, "account_disabled", "Tài khoản này đã bị vô hiệu hóa")

	case errors.Is(err, auth.ErrTOTPRequired):
		writeError(w, http.StatusUnauthorized, "totp_required", "Vui lòng nhập mã từ ứng dụng xác thực hai bước")

	case errors.Is(err, auth.ErrTOTPInvalid):
		writeError(w, http.StatusUnauthorized, "totp_invalid", "Mã xác thực hai bước không hợp lệ")

	case errors.Is(err, auth.ErrSessionInvalid):
		writeError(w, http.StatusUnauthorized, "session_invalid", "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại")

	case errors.Is(err, auth.ErrSetupDone):
		writeError(w, http.StatusConflict, "setup_done", "Máy chủ này đã được khởi tạo trước đó")

	case errors.Is(err, auth.ErrSetupRequired):
		writeError(w, http.StatusConflict, "setup_required", "Máy chủ chưa được khởi tạo tài khoản quản trị")

	case errors.Is(err, auth.ErrInviteRequired):
		writeError(w, http.StatusForbidden, "invite_required", "Cần có mã mời để tạo tài khoản mới")

	case errors.Is(err, auth.ErrInviteInvalid):
		writeError(w, http.StatusBadRequest, "invite_invalid", "Mã mời không hợp lệ")

	case errors.Is(err, auth.ErrUserExists):
		writeError(w, http.StatusConflict, "username_taken", "Tên đăng nhập này đã được sử dụng")

	case errors.Is(err, auth.ErrEmailExists):
		writeError(w, http.StatusConflict, "email_taken", "Địa chỉ email này đã được sử dụng")

	case errors.Is(err, auth.ErrWeakPassword), errors.Is(err, auth.ErrInvalidUsername):
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())

	case errors.Is(err, libraries.ErrOffline):
		writeError(w, http.StatusServiceUnavailable, "library_offline",
			"Ổ đĩa lưu trữ hiện không kết nối")

	case errors.Is(err, libraries.ErrDuplicate):
		writeError(w, http.StatusConflict, "already_registered", "Đường dẫn lưu trữ này đã được đăng ký")

	case errors.Is(err, libraries.ErrLastOne):
		writeError(w, http.StatusConflict, "last_library", "Đây là thư viện duy nhất, cần tạo thêm trước khi xóa")

	case errors.Is(err, shares.ErrExpired):
		writeError(w, http.StatusGone, "share_expired", "Liên kết chia sẻ này đã hết hạn")

	case errors.Is(err, shares.ErrPasswordNeeded):
		writeError(w, http.StatusUnauthorized, "share_password_required", "Liên kết này yêu cầu nhập mật khẩu bảo vệ")

	case errors.Is(err, shares.ErrPasswordWrong):
		writeError(w, http.StatusUnauthorized, "share_password_wrong", "Mật khẩu truy cập không chính xác")

	case errors.Is(err, shares.ErrDownloadBlocked):
		writeError(w, http.StatusForbidden, "download_disabled", "Liên kết này chỉ hỗ trợ xem trực tiếp, không cho phép tải về")

	default:
		a.log.Error("unhandled request error",
			"error", err, "path", r.URL.Path, "method", r.Method)
		msg := err.Error()
		if msg == "" {
			msg = "Đã xảy ra lỗi trên máy chủ, vui lòng thử lại sau"
		}
		writeError(w, http.StatusInternalServerError, "internal", msg)
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	defer r.Body.Close()
	decoder := json.NewDecoder(io.LimitReader(r.Body, maxJSONBody))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "the request body could not be read")
		return false
	}
	return true
}

// ownerDTO is the small public shape of an account.
type ownerDTO struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	AvatarSeed string `json:"avatar_seed"`
}

// nodeDTO is what every listing and detail endpoint returns for one item.
type nodeDTO struct {
	ID             string `json:"id"`
	ParentID       string `json:"parent_id,omitempty"`
	LibraryID      string `json:"library_id"`
	Name           string `json:"name"`
	Type           string `json:"type"`
	Category       string `json:"category"`
	MimeType       string `json:"mime_type,omitempty"`
	SizeBytes      int64  `json:"size_bytes"`
	Checksum       string `json:"checksum_sha256,omitempty"`
	Color          string `json:"color,omitempty"`
	HasThumbnail   bool   `json:"has_thumbnail"`
	Previewable    bool   `json:"previewable"`
	VersionCount   int    `json:"version_count"`
	Starred        bool   `json:"starred"`
	SharedWithMe   bool   `json:"shared_with_me"`
	HasActiveShare bool   `json:"has_active_share"`
	Role           string `json:"role"`

	// pixel dimensions, so a photo grid lays itself out before a single
	// thumbnail has arrived. Omitted for anything that is not an image
	ImageWidth  int `json:"image_width,omitempty"`
	ImageHeight int `json:"image_height,omitempty"`

	// when the picture was taken, which is not when it was uploaded. Omitted
	// when the file carries no capture time, so a client can fall back rather
	// than be handed an invented one
	TakenAt int64 `json:"taken_at,omitempty"`

	Owner     *ownerDTO `json:"owner,omitempty"`
	CreatedAt int64     `json:"created_at"`
	UpdatedAt int64     `json:"updated_at"`
	TrashedAt int64     `json:"trashed_at,omitempty"`
}

func nodeView(v files.View, callerID string) nodeDTO {
	category := models.CategoryOf(v.Node.Type, v.Node.MimeType, v.Node.Name)
	dto := nodeDTO{
		ID: v.Node.ID, ParentID: v.Node.ParentID, LibraryID: v.Node.LibraryID,
		Name: v.Node.Name, Type: string(v.Node.Type), Category: string(category),
		MimeType: v.Node.MimeType, SizeBytes: v.Node.SizeBytes,
		Checksum: v.Node.ChecksumSHA256, Color: v.Node.Color,
		HasThumbnail: v.Node.HasThumbnail, Previewable: models.Previewable(category),
		VersionCount: v.Node.VersionCount, Starred: v.Starred,
		SharedWithMe: v.SharedWithMe, HasActiveShare: v.HasActiveShare,
		Role: v.Role.String(), CreatedAt: v.Node.CreatedAt, UpdatedAt: v.Node.UpdatedAt,
		TrashedAt:   v.Node.TrashedAt,
		ImageWidth:  v.Node.ImageWidth,
		ImageHeight: v.Node.ImageHeight,
		TakenAt:     v.Node.TakenAt,
	}
	// the owner badge is only meaningful on something the caller does not own
	if v.Owner.ID != "" && v.Owner.ID != callerID {
		dto.Owner = &ownerDTO{ID: v.Owner.ID, Name: v.Owner.Name, AvatarSeed: v.Owner.AvatarSeed}
	}
	return dto
}

func nodeViews(list []files.View, callerID string) []nodeDTO {
	out := make([]nodeDTO, 0, len(list))
	for _, v := range list {
		out = append(out, nodeView(v, callerID))
	}
	return out
}

func plainNode(n models.Node) nodeDTO {
	category := models.CategoryOf(n.Type, n.MimeType, n.Name)
	return nodeDTO{
		ID: n.ID, ParentID: n.ParentID, LibraryID: n.LibraryID, Name: n.Name,
		Type: string(n.Type), Category: string(category), MimeType: n.MimeType,
		SizeBytes: n.SizeBytes, Checksum: n.ChecksumSHA256, Color: n.Color,
		HasThumbnail: n.HasThumbnail, Previewable: models.Previewable(category),
		VersionCount: n.VersionCount, CreatedAt: n.CreatedAt, UpdatedAt: n.UpdatedAt,
		TrashedAt:   n.TrashedAt,
		ImageWidth:  n.ImageWidth,
		ImageHeight: n.ImageHeight,
		TakenAt:     n.TakenAt,
	}
}

func intQuery(r *http.Request, key string, def int) int {
	raw := strings.TrimSpace(r.URL.Query().Get(key))
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return def
	}
	return n
}

func int64Query(r *http.Request, key string, def int64) int64 {
	raw := strings.TrimSpace(r.URL.Query().Get(key))
	if raw == "" {
		return def
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return def
	}
	return n
}

func boolQuery(r *http.Request, key string) bool {
	raw := strings.ToLower(strings.TrimSpace(r.URL.Query().Get(key)))
	return raw == "1" || raw == "true" || raw == "yes"
}
