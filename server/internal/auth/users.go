package auth

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/MultiX0/LocalDrive/server/internal/audit"
	"github.com/MultiX0/LocalDrive/server/internal/db"
	"github.com/MultiX0/LocalDrive/server/internal/models"
)

const userColumns = `id, email, username, display_name, password_hash, must_change_password, role,
	quota_bytes, quota_bytes_used, avatar_seed, totp_secret, totp_enabled, disabled_at,
	COALESCE(dataset_permissions, '{}'), created_at, updated_at`

type userScanner interface {
	Scan(dest ...any) error
}

func scanUser(row userScanner) (models.User, error) {
	var (
		u                   models.User
		email, totpSecret   sql.NullString
		mustChange, totpOn  int
		disabledAt          sql.NullInt64
		datasetPermissions  sql.NullString
		role                string
	)
	err := row.Scan(&u.ID, &email, &u.Username, &u.DisplayName, &u.PasswordHash, &mustChange, &role,
		&u.QuotaBytes, &u.QuotaBytesUsed, &u.AvatarSeed, &totpSecret, &totpOn, &disabledAt,
		&datasetPermissions, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return models.User{}, err
	}
	u.Email = db.StringOrEmpty(email)
	u.TOTPSecret = db.StringOrEmpty(totpSecret)
	u.MustChangePassword = mustChange != 0
	u.TOTPEnabled = totpOn != 0
	u.DisabledAt = db.Int64OrZero(disabledAt)
	u.DatasetPermissions = db.StringOrEmpty(datasetPermissions)
	if u.DatasetPermissions == "" {
		u.DatasetPermissions = "{}"
	}
	u.Role = models.Role(role)
	return u, nil
}

type newUserParams struct {
	Username     string
	Email        string
	PasswordHash string
	Role         models.Role
	Quota        int64
	MustChange   bool
}

func insertUser(ctx context.Context, tx *sql.Tx, p newUserParams) (models.User, error) {
	email, err := normalizeEmail(p.Email)
	if err != nil {
		return models.User{}, err
	}
	username := strings.TrimSpace(p.Username)

	var clash int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE lower(username) = lower(?)`, username).Scan(&clash); err != nil {
		return models.User{}, err
	}
	if clash > 0 {
		return models.User{}, ErrUserExists
	}
	if email != "" {
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE email = ?`, email).Scan(&clash); err != nil {
			return models.User{}, err
		}
		if clash > 0 {
			return models.User{}, ErrEmailExists
		}
	}

	now := db.NowMillis()
	u := models.User{
		ID: db.NewID(), Username: username, Email: email, DisplayName: username,
		PasswordHash: p.PasswordHash, Role: p.Role, QuotaBytes: p.Quota,
		AvatarSeed: db.RandomToken(8), MustChangePassword: p.MustChange,
		CreatedAt: now, UpdatedAt: now,
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO users (id, email, username, display_name, password_hash, must_change_password,
		                   role, quota_bytes, quota_bytes_used, avatar_seed, totp_enabled,
		                   created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`,
		u.ID, db.NullString(u.Email), u.Username, u.DisplayName, u.PasswordHash,
		boolInt(u.MustChangePassword), string(u.Role), u.QuotaBytes, u.AvatarSeed, now, now)
	if err != nil {
		return models.User{}, err
	}
	return u, nil
}

// UserByID loads one account.
func (s *Service) UserByID(ctx context.Context, id string) (models.User, error) {
	row := s.database.Read().QueryRowContext(ctx, `SELECT `+userColumns+` FROM users WHERE id = ?`, id)
	u, err := scanUser(row)
	if errors.Is(err, sql.ErrNoRows) {
		return models.User{}, ErrNotFound
	}
	return u, err
}

func (s *Service) userByUsername(ctx context.Context, username string) (models.User, error) {
	row := s.database.Read().QueryRowContext(ctx,
		`SELECT `+userColumns+` FROM users WHERE lower(username) = lower(?)`, strings.TrimSpace(username))
	u, err := scanUser(row)
	if errors.Is(err, sql.ErrNoRows) {
		return models.User{}, ErrNotFound
	}
	return u, err
}

// PublicUser is what every account may see about another account: a name and
// an avatar seed, never an email or a role.
type PublicUser struct {
	ID         string
	Name       string
	AvatarSeed string
}

// ListPublicUsers powers the People picker in the share sheet.
func (s *Service) ListPublicUsers(ctx context.Context, query string) ([]PublicUser, error) {
	sqlText := `SELECT id, username, display_name, avatar_seed FROM users WHERE disabled_at IS NULL`
	var args []any
	if q := strings.TrimSpace(query); q != "" {
		sqlText += ` AND (username LIKE ? OR display_name LIKE ?)`
		pattern := "%" + q + "%"
		args = append(args, pattern, pattern)
	}
	sqlText += ` ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE LIMIT 500`
	rows, err := s.database.Read().QueryContext(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PublicUser
	for rows.Next() {
		var id, username, display, seed string
		if err := rows.Scan(&id, &username, &display, &seed); err != nil {
			return nil, err
		}
		name := display
		if name == "" {
			name = username
		}
		out = append(out, PublicUser{ID: id, Name: name, AvatarSeed: seed})
	}
	return out, rows.Err()
}

// ListUsers is the admin view, with the fields the People picker hides.
func (s *Service) ListUsers(ctx context.Context) ([]models.User, error) {
	rows, err := s.database.Read().QueryContext(ctx,
		`SELECT `+userColumns+` FROM users ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		u.PasswordHash = ""
		u.TOTPSecret = ""
		out = append(out, u)
	}
	return out, rows.Err()
}

// ListUsersPaged returns a page of users with optional search and sort.
func (s *Service) ListUsersPaged(ctx context.Context, limit, offset int, search, sortBy, order string) ([]models.User, int64, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	sortCol := "created_at"
	switch strings.ToLower(sortBy) {
	case "username", "name":
		sortCol = "lower(username)"
	case "email":
		sortCol = "lower(email)"
	case "role":
		sortCol = "role"
	case "quota":
		sortCol = "quota_bytes"
	case "updated":
		sortCol = "updated_at"
	}

	orderDir := "ASC"
	if strings.EqualFold(order, "desc") {
		orderDir = "DESC"
	}

	var total int64
	var whereClause string
	var args []any

	if search != "" {
		whereClause = " WHERE (lower(username) LIKE ? OR lower(display_name) LIKE ? OR lower(email) LIKE ?)"
		pattern := "%" + strings.ToLower(search) + "%"
		args = append(args, pattern, pattern, pattern)
	}

	countQuery := "SELECT COUNT(*) FROM users" + whereClause
	if err := s.database.Read().QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := "SELECT " + userColumns + " FROM users" + whereClause + " ORDER BY " + sortCol + " " + orderDir + ", id ASC LIMIT ? OFFSET ?"
	queryArgs := append([]any{}, args...)
	queryArgs = append(queryArgs, limit, offset)

	rows, err := s.database.Read().QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []models.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, 0, err
		}
		u.PasswordHash = ""
		u.TOTPSecret = ""
		out = append(out, u)
	}
	return out, total, rows.Err()
}

// ChangePassword updates the caller's own password and clears the
// must-change flag.
func (s *Service) ChangePassword(ctx context.Context, userID, current, next, ip string) error {
	if err := ValidatePassword(next); err != nil {
		return err
	}
	user, err := s.UserByID(ctx, userID)
	if err != nil {
		return err
	}
	// an account still on a temporary password proves nothing by repeating it,
	// but every other account must confirm the one it is replacing
	if !user.MustChangePassword {
		ok, _, err := s.hasher.Verify(user.PasswordHash, current)
		if err != nil || !ok {
			return ErrCredentials
		}
	}
	hash, err := s.hasher.Hash(next)
	if err != nil {
		return err
	}
	return s.database.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			`UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?`,
			hash, db.NowMillis(), userID); err != nil {
			return err
		}
		// changing a password ends every other session on the account
		if _, err := tx.ExecContext(ctx,
			`UPDATE sessions SET status = 'revoked', revoked_at = ?, refresh_token_hash = NULL
			 WHERE user_id = ? AND status = 'pending'`, db.NowMillis(), userID); err != nil {
			return err
		}
		return s.audit.RecordTx(ctx, tx, audit.Entry{
			UserID: userID, Action: audit.ActionPasswordChanged, IP: ip,
		})
	})
}

// AdminResetPassword issues a temporary password for a locked-out account.
// This path always works, since it never depends on SMTP being configured.
func (s *Service) AdminResetPassword(ctx context.Context, adminID, targetID, newPassword, ip string) (string, error) {
	admin, err := s.UserByID(ctx, adminID)
	if err != nil {
		return "", err
	}
	if !admin.IsAdmin() {
		return "", ErrForbidden
	}
	if newPassword == "" {
		newPassword = db.RandomCode(3)
	}
	if err := ValidatePassword(newPassword); err != nil {
		return "", err
	}
	hash, err := s.hasher.Hash(newPassword)
	if err != nil {
		return "", err
	}
	err = s.database.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx,
			`UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?`,
			hash, db.NowMillis(), targetID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		if _, err := tx.ExecContext(ctx,
			`UPDATE sessions SET status = 'revoked', revoked_at = ?, refresh_token_hash = NULL WHERE user_id = ?`,
			db.NowMillis(), targetID); err != nil {
			return err
		}
		return s.audit.RecordTx(ctx, tx, audit.Entry{
			UserID: adminID, Action: audit.ActionPasswordReset, IP: ip,
			Metadata: map[string]any{"target_user": targetID},
		})
	})
	if err != nil {
		return "", err
	}
	return newPassword, nil
}

// SetRole promotes or demotes an account. The last admin cannot be demoted.
func (s *Service) SetRole(ctx context.Context, adminID, targetID string, role models.Role, ip string) error {
	if role != models.RoleAdmin && role != models.RoleMember {
		return ErrForbidden
	}
	admin, err := s.UserByID(ctx, adminID)
	if err != nil {
		return err
	}
	if !admin.IsAdmin() {
		return ErrForbidden
	}
	return s.database.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if role == models.RoleMember {
			var admins int
			if err := tx.QueryRowContext(ctx,
				`SELECT COUNT(*) FROM users WHERE role = 'admin' AND disabled_at IS NULL AND id != ?`,
				targetID).Scan(&admins); err != nil {
				return err
			}
			if admins == 0 {
				return errors.New("auth: this is the only admin account, promote someone else first")
			}
		}
		res, err := tx.ExecContext(ctx, `UPDATE users SET role = ?, updated_at = ? WHERE id = ?`,
			string(role), db.NowMillis(), targetID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return s.audit.RecordTx(ctx, tx, audit.Entry{
			UserID: adminID, Action: audit.ActionUserRoleChanged, IP: ip,
			Metadata: map[string]any{"target_user": targetID, "role": string(role)},
		})
	})
}

// SetQuota changes how much space an account may use. Zero means unlimited.
func (s *Service) SetQuota(ctx context.Context, adminID, targetID string, quota int64, ip string) error {
	admin, err := s.UserByID(ctx, adminID)
	if err != nil {
		return err
	}
	if !admin.IsAdmin() {
		return ErrForbidden
	}
	if quota < 0 {
		return ErrForbidden
	}
	return s.database.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `UPDATE users SET quota_bytes = ?, updated_at = ? WHERE id = ?`,
			quota, db.NowMillis(), targetID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return s.audit.RecordTx(ctx, tx, audit.Entry{
			UserID: adminID, Action: audit.ActionSettingsChanged, IP: ip,
			Metadata: map[string]any{"target_user": targetID, "quota_bytes": quota},
		})
	})
}

// SetDisabled locks or unlocks an account.
func (s *Service) SetDisabled(ctx context.Context, adminID, targetID string, disabled bool, ip string) error {
	admin, err := s.UserByID(ctx, adminID)
	if err != nil {
		return err
	}
	if !admin.IsAdmin() {
		return ErrForbidden
	}
	if adminID == targetID {
		return errors.New("auth: an admin cannot disable their own account")
	}
	var at any
	if disabled {
		at = db.NowMillis()
	}
	return s.database.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?`,
			at, db.NowMillis(), targetID); err != nil {
			return err
		}
		if disabled {
			if _, err := tx.ExecContext(ctx,
				`UPDATE sessions SET status = 'revoked', revoked_at = ?, refresh_token_hash = NULL WHERE user_id = ?`,
				db.NowMillis(), targetID); err != nil {
				return err
			}
		}
		return s.audit.RecordTx(ctx, tx, audit.Entry{
			UserID: adminID, Action: audit.ActionUserDisabled, IP: ip,
			Metadata: map[string]any{"target_user": targetID, "disabled": disabled},
		})
	})
}

// UpdateProfile changes the caller's own display name.
func (s *Service) UpdateProfile(ctx context.Context, userID, displayName string) error {
	name := strings.TrimSpace(displayName)
	if name == "" || len(name) > 64 {
		return errors.New("auth: a display name must be 1 to 64 characters")
	}
	return s.database.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`,
			name, db.NowMillis(), userID)
		return err
	})
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// AdminCreateUserParams holds values for creating a new user.
type AdminCreateUserParams struct {
	Username           string
	Password           string
	DisplayName        string
	Email              string
	Role               models.Role
	QuotaBytes         int64
	DatasetPermissions string
}

func (s *Service) AdminCreateUser(ctx context.Context, adminID string, p AdminCreateUserParams, ip string) (models.User, error) {
	admin, err := s.UserByID(ctx, adminID)
	if err != nil {
		return models.User{}, err
	}
	if !admin.IsAdmin() {
		return models.User{}, ErrForbidden
	}
	if err := validateUsername(p.Username); err != nil {
		return models.User{}, err
	}
	if err := ValidatePassword(p.Password); err != nil {
		return models.User{}, err
	}
	hash, err := s.hasher.Hash(p.Password)
	if err != nil {
		return models.User{}, err
	}
	role := p.Role
	if role != models.RoleAdmin && role != models.RoleMember {
		role = models.RoleMember
	}
	displayName := strings.TrimSpace(p.DisplayName)
	if displayName == "" {
		displayName = strings.TrimSpace(p.Username)
	}
	perms := strings.TrimSpace(p.DatasetPermissions)
	if perms == "" {
		perms = "{}"
	}

	var created models.User
	err = s.database.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		var clash int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE lower(username) = lower(?)`, strings.TrimSpace(p.Username)).Scan(&clash); err != nil {
			return err
		}
		if clash > 0 {
			return ErrUserExists
		}
		now := db.NowMillis()
		created = models.User{
			ID:                 db.NewID(),
			Username:           strings.TrimSpace(p.Username),
			Email:              strings.TrimSpace(p.Email),
			DisplayName:        displayName,
			PasswordHash:       hash,
			Role:               role,
			QuotaBytes:         p.QuotaBytes,
			AvatarSeed:         db.RandomToken(8),
			DatasetPermissions: perms,
			CreatedAt:          now,
			UpdatedAt:          now,
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO users (id, email, username, display_name, password_hash, must_change_password,
			                   role, quota_bytes, quota_bytes_used, avatar_seed, totp_enabled,
			                   dataset_permissions, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0, ?, 0, ?, ?, ?)`,
			created.ID, db.NullString(created.Email), created.Username, created.DisplayName, created.PasswordHash,
			string(created.Role), created.QuotaBytes, created.AvatarSeed, created.DatasetPermissions, now, now)
		if err != nil {
			return err
		}
		return s.audit.RecordTx(ctx, tx, audit.Entry{
			UserID: adminID, Action: audit.ActionUserCreated, IP: ip,
			Metadata: map[string]any{"username": created.Username, "created_by_admin": true},
		})
	})
	if err != nil {
		return models.User{}, err
	}
	return created, nil
}

// AdminUpdateUserParams holds values for modifying an existing user.
type AdminUpdateUserParams struct {
	Username           string
	Password           string
	DisplayName        string
	Email              string
	Role               models.Role
	QuotaBytes         *int64
	Disabled           *bool
	DatasetPermissions *string
}

func (s *Service) AdminUpdateUser(ctx context.Context, adminID, targetID string, p AdminUpdateUserParams, ip string) error {
	admin, err := s.UserByID(ctx, adminID)
	if err != nil {
		return err
	}
	if !admin.IsAdmin() {
		return ErrForbidden
	}
	target, err := s.UserByID(ctx, targetID)
	if err != nil {
		return err
	}

	return s.database.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		now := db.NowMillis()
		if p.Username != "" && p.Username != target.Username {
			if err := validateUsername(p.Username); err != nil {
				return err
			}
			var clash int
			if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE lower(username) = lower(?) AND id != ?`, strings.TrimSpace(p.Username), targetID).Scan(&clash); err != nil {
				return err
			}
			if clash > 0 {
				return ErrUserExists
			}
			if _, err := tx.ExecContext(ctx, `UPDATE users SET username = ?, updated_at = ? WHERE id = ?`, strings.TrimSpace(p.Username), now, targetID); err != nil {
				return err
			}
		}

		if p.DisplayName != "" {
			if _, err := tx.ExecContext(ctx, `UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`, strings.TrimSpace(p.DisplayName), now, targetID); err != nil {
				return err
			}
		}

		if p.Email != "" {
			if _, err := tx.ExecContext(ctx, `UPDATE users SET email = ?, updated_at = ? WHERE id = ?`, strings.TrimSpace(p.Email), now, targetID); err != nil {
				return err
			}
		}

		if p.Password != "" {
			if err := ValidatePassword(p.Password); err != nil {
				return err
			}
			hash, err := s.hasher.Hash(p.Password)
			if err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, hash, now, targetID); err != nil {
				return err
			}
		}

		if p.Role != "" && p.Role != target.Role {
			if p.Role == models.RoleMember {
				var admins int
				if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE role = 'admin' AND disabled_at IS NULL AND id != ?`, targetID).Scan(&admins); err != nil {
					return err
				}
				if admins == 0 {
					return errors.New("auth: this is the only admin account, promote someone else first")
				}
			}
			if _, err := tx.ExecContext(ctx, `UPDATE users SET role = ?, updated_at = ? WHERE id = ?`, string(p.Role), now, targetID); err != nil {
				return err
			}
		}

		if p.QuotaBytes != nil {
			if _, err := tx.ExecContext(ctx, `UPDATE users SET quota_bytes = ?, updated_at = ? WHERE id = ?`, *p.QuotaBytes, now, targetID); err != nil {
				return err
			}
		}

		if p.Disabled != nil {
			if adminID == targetID && *p.Disabled {
				return errors.New("auth: an admin cannot disable their own account")
			}
			var disabledVal any
			if *p.Disabled {
				disabledVal = now
			}
			if _, err := tx.ExecContext(ctx, `UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?`, disabledVal, now, targetID); err != nil {
				return err
			}
		}

		if p.DatasetPermissions != nil {
			if _, err := tx.ExecContext(ctx, `UPDATE users SET dataset_permissions = ?, updated_at = ? WHERE id = ?`, *p.DatasetPermissions, now, targetID); err != nil {
				return err
			}
		}

		return s.audit.RecordTx(ctx, tx, audit.Entry{
			UserID: adminID, Action: audit.ActionSettingsChanged, IP: ip,
			Metadata: map[string]any{"target_user": targetID},
		})
	})
}

func (s *Service) AdminDeleteUser(ctx context.Context, adminID, targetID, ip string) error {
	admin, err := s.UserByID(ctx, adminID)
	if err != nil {
		return err
	}
	if !admin.IsAdmin() {
		return ErrForbidden
	}
	if adminID == targetID {
		return errors.New("auth: an admin cannot delete their own account")
	}
	return s.database.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, _ = tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, targetID)
		_, _ = tx.ExecContext(ctx, `DELETE FROM permissions WHERE user_id = ?`, targetID)
		_, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, targetID)
		if err != nil {
			return err
		}
		return s.audit.RecordTx(ctx, tx, audit.Entry{
			UserID: adminID, Action: audit.ActionUserDeleted, IP: ip,
			Metadata: map[string]any{"target_user": targetID},
		})
	})
}
