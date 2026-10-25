package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"syscall"

	"github.com/MultiX0/LocalDrive/server/internal/db"
	mw "github.com/MultiX0/LocalDrive/server/internal/middleware"
)

func nowMillis() int64 { return db.NowMillis() }

func clientIP(r *http.Request) string { return mw.ClientIPFrom(r.Context()) }

// isReadOnlyError checks whether an error is caused by a read-only filesystem or write-protection.
func isReadOnlyError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, syscall.EROFS) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "read-only") || strings.Contains(msg, "write protected") || strings.Contains(msg, "permission denied")
}

// decodeQuiet reads an optional body, returning false rather than writing an
// error, for endpoints where a body is allowed but not required.
func decodeQuiet(r *http.Request, target any) bool {
	if r.Body == nil {
		return false
	}
	defer r.Body.Close()
	decoder := json.NewDecoder(io.LimitReader(r.Body, maxJSONBody))
	return decoder.Decode(target) == nil
}
