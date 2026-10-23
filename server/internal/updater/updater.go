// Package updater checks for a newer release and replaces this binary with it.
//
// Downloading and verifying happen while the server keeps serving. Swapping
// the file needs a restart, because a process cannot become a different
// program without one, so there is a gap of a few seconds and the CLI says so.
//
// Nothing here touches the database or the library. Only the executable is
// replaced, and the previous one is kept next to it so a bad release can be
// undone without a download.
package updater

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// DefaultDomain is the primary update endpoint
const DefaultDomain = "https://drive.kiyo.vn"

// DefaultRepo is the fallback GitHub repository for releases
const DefaultRepo = "kiyogo/kidrive"

// GetUpdateBaseURL returns the configured update server domain
func GetUpdateBaseURL() string {
	if u := strings.TrimSpace(os.Getenv("LOCALDRIVE_UPDATE_URL")); u != "" {
		return strings.TrimRight(u, "/")
	}
	if u := strings.TrimSpace(os.Getenv("KIDRIVE_UPDATE_URL")); u != "" {
		return strings.TrimRight(u, "/")
	}
	return DefaultDomain
}

// GetRepo returns the fallback GitHub repository
func GetRepo() string {
	if r := strings.TrimSpace(os.Getenv("LOCALDRIVE_REPO")); r != "" {
		return r
	}
	if r := strings.TrimSpace(os.Getenv("KIDRIVE_REPO")); r != "" {
		return r
	}
	return DefaultRepo
}

// ErrNoUpdate means the newest release is the one already running.
var ErrNoUpdate = errors.New("hệ thống đang chạy phiên bản mới nhất")

// ErrNotSupported means this build cannot replace itself, which is the case
// inside a container: the image is the unit of update there, not the file.
var ErrNotSupported = errors.New("bản cài đặt trong container cập nhật qua image")

// Release is a published version and the file for this platform.
type Release struct {
	Version      string
	Notes        string
	URL          string
	AssetName    string
	AssetURL     string
	Size         int64
	ChecksumsURL string
	DirectHash   string
}

// AssetName returns the primary binary name for this platform
func AssetName() string {
	switch {
	case runtime.GOOS == "windows":
		return "localdrive-win-x64.exe"
	case runtime.GOOS == "linux" && runtime.GOARCH == "arm64":
		return "localdrive-linux-arm64"
	case runtime.GOOS == "linux":
		return "localdrive-linux-x64"
	case runtime.GOOS == "darwin" && runtime.GOARCH == "arm64":
		return "localdrive-macos-arm64"
	case runtime.GOOS == "darwin":
		return "localdrive-macos-x64"
	default:
		return ""
	}
}

// matchesPlatform checks if an asset name matches current GOOS and GOARCH
func matchesPlatform(name string) bool {
	n := strings.ToLower(name)
	// Loại trừ các tệp nén hoặc gói cài đặt client
	if strings.HasSuffix(n, ".tar.gz") || strings.Contains(n, "setup") || strings.HasSuffix(n, ".apk") {
		return false
	}
	switch {
	case runtime.GOOS == "windows":
		return strings.HasSuffix(n, ".exe") && (strings.Contains(n, "win") || strings.Contains(n, "windows") || n == "localdrive.exe" || n == "server.exe")
	case runtime.GOOS == "linux" && runtime.GOARCH == "arm64":
		return strings.Contains(n, "linux") && strings.Contains(n, "arm64")
	case runtime.GOOS == "linux":
		return strings.Contains(n, "linux") && (strings.Contains(n, "x64") || strings.Contains(n, "amd64") || strings.Contains(n, "x86_64"))
	case runtime.GOOS == "darwin" && runtime.GOARCH == "arm64":
		return (strings.Contains(n, "macos") || strings.Contains(n, "darwin")) && strings.Contains(n, "arm64")
	case runtime.GOOS == "darwin":
		return (strings.Contains(n, "macos") || strings.Contains(n, "darwin")) && (strings.Contains(n, "x64") || strings.Contains(n, "amd64") || strings.Contains(n, "x86_64"))
	default:
		return false
	}
}

// DomainVersionResponse represents version.json served by custom domain
type DomainVersionResponse struct {
	Version string `json:"version"`
	Notes   string `json:"notes"`
	URL     string `json:"url"`
	Assets  map[string]struct {
		URL    string `json:"url"`
		Size   int64  `json:"size"`
		SHA256 string `json:"sha256"`
	} `json:"assets"`
}

// Check asks for the newest stable release and reports whether it is newer
// than what is running.
func Check(ctx context.Context, current string) (*Release, error) {
	primaryAsset := AssetName()
	if primaryAsset == "" {
		return nil, fmt.Errorf("không có bản build hỗ trợ cho %s/%s", runtime.GOOS, runtime.GOARCH)
	}

	// 1. Kiểm tra qua domain riêng trước (ưu tiên hàng đầu)
	baseURL := GetUpdateBaseURL()
	if baseURL != "" {
		domainCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		domainRel, err := checkFromDomain(domainCtx, baseURL, current, primaryAsset)
		cancel()
		if err == nil && domainRel != nil {
			return domainRel, nil
		}
		if errors.Is(err, ErrNoUpdate) {
			return nil, ErrNoUpdate
		}
	}

	// 2. Dự phòng: Kiểm tra qua GitHub Releases nếu domain chưa phản hồi
	repo := GetRepo()
	if repo == "" {
		return nil, ErrNoUpdate
	}

	return checkFromGitHub(ctx, repo, current)
}

func checkFromDomain(ctx context.Context, baseURL, current, targetAsset string) (*Release, error) {
	versionURL := baseURL + "/version.json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, versionURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "KiDrive-Updater")

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("domain trả về mã trạng thái %d", resp.StatusCode)
	}

	var data DomainVersionResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	for assetKey, assetInfo := range data.Assets {
		if matchesPlatform(assetKey) {
			rel := &Release{
				Version:    strings.TrimPrefix(data.Version, "v"),
				Notes:      strings.TrimSpace(data.Notes),
				URL:        data.URL,
				AssetName:  assetKey,
				AssetURL:   assetInfo.URL,
				Size:       assetInfo.Size,
				DirectHash: assetInfo.SHA256,
			}
			if !newer(rel.Version, current) {
				return nil, ErrNoUpdate
			}
			return rel, nil
		}
	}

	return nil, fmt.Errorf("không tìm thấy tệp phù hợp cho %s/%s", runtime.GOOS, runtime.GOARCH)
}

func checkFromGitHub(ctx context.Context, repo, current string) (*Release, error) {
	apiURL := "https://api.github.com/repos/" + repo + "/releases?per_page=10"
	var payload []struct {
		TagName    string `json:"tag_name"`
		Body       string `json:"body"`
		HTMLURL    string `json:"html_url"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
		Assets     []struct {
			Name string `json:"name"`
			URL  string `json:"browser_download_url"`
			Size int64  `json:"size"`
		} `json:"assets"`
	}

	if err := getJSON(ctx, apiURL, &payload); err != nil {
		return nil, err
	}

	for _, entry := range payload {
		if entry.Draft || entry.Prerelease {
			continue
		}

		release := &Release{
			Version: strings.TrimPrefix(entry.TagName, "v"),
			Notes:   strings.TrimSpace(entry.Body),
			URL:     entry.HTMLURL,
		}
		for _, item := range entry.Assets {
			if matchesPlatform(item.Name) {
				release.AssetName = item.Name
				release.AssetURL = item.URL
				release.Size = item.Size
			} else if item.Name == "SHA256SUMS" || item.Name == "SHA256SUMS.txt" {
				release.ChecksumsURL = item.URL
			}
		}

		if release.AssetURL == "" {
			continue
		}
		if !newer(release.Version, current) {
			return nil, ErrNoUpdate
		}
		return release, nil
	}

	return nil, ErrNoUpdate
}

// Apply downloads the release, checks it against the published hash, and puts
// it in place of the running binary.
func Apply(ctx context.Context, release *Release) (installedAt string, err error) {
	self, err := os.Executable()
	if err != nil {
		return "", err
	}
	if self, err = filepath.EvalSymlinks(self); err != nil {
		return "", err
	}

	staged := self + ".new"
	backup := self + ".old"

	if err := download(ctx, release, staged); err != nil {
		os.Remove(staged)
		return "", err
	}

	os.Remove(backup)
	if err := os.Rename(self, backup); err != nil {
		os.Remove(staged)
		return "", fmt.Errorf("không thể di chuyển tệp nhị phân hiện tại sang backup: %w", err)
	}

	if err := os.Rename(staged, self); err != nil {
		if restoreErr := os.Rename(backup, self); restoreErr != nil {
			return "", fmt.Errorf(
				"cập nhật thất bại và không thể khôi phục lại bản cũ: %w", err)
		}
		os.Remove(staged)
		return "", fmt.Errorf("không thể thay thế tệp nhị phân mới: %w", err)
	}

	if runtime.GOOS != "windows" {
		_ = os.Chmod(self, 0o755)
	}
	return self, nil
}

// Rollback puts the previous binary back, for a release that starts but
// misbehaves. Downloading nothing, so it works with no network.
func Rollback() error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	if self, err = filepath.EvalSymlinks(self); err != nil {
		return err
	}

	backup := self + ".old"
	if _, err := os.Stat(backup); err != nil {
		return fmt.Errorf("không có bản sao lưu trước đó tại %s", backup)
	}

	current := self + ".new"
	os.Remove(current)
	if err := os.Rename(self, current); err != nil {
		return err
	}
	if err := os.Rename(backup, self); err != nil {
		_ = os.Rename(current, self)
		return err
	}
	os.Remove(current)
	return nil
}

// TriggerRestart restarts the current executable process
func TriggerRestart() error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	if self, err = filepath.EvalSymlinks(self); err != nil {
		return err
	}

	if runtime.GOOS != "windows" {
		return syscall.Exec(self, os.Args, os.Environ())
	}

	cmd := exec.Command(self, os.Args[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	if err := cmd.Start(); err != nil {
		return err
	}
	os.Exit(0)
	return nil
}

func download(ctx context.Context, release *Release, into string) error {
	want, err := publishedHash(ctx, release)
	// If a checksum was specified, we must verify it
	hasExpectedHash := err == nil && want != ""

	response, err := get(ctx, release.AssetURL)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	file, err := os.OpenFile(into, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
	if err != nil {
		return err
	}

	digest := sha256.New()
	var writer io.Writer = file
	if hasExpectedHash {
		writer = io.MultiWriter(file, digest)
	}

	if _, err := io.Copy(writer, response.Body); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}

	if hasExpectedHash {
		got := hex.EncodeToString(digest.Sum(nil))
		if !strings.EqualFold(got, want) {
			os.Remove(into)
			return fmt.Errorf("tệp tải về không khớp mã kiểm tra SHA256 (kỳ vọng: %s, thực tế: %s)", want, got)
		}
	}
	return nil
}

func publishedHash(ctx context.Context, release *Release) (string, error) {
	if release.DirectHash != "" {
		return release.DirectHash, nil
	}
	if release.ChecksumsURL == "" {
		return "", errors.New("không có liên kết SHA256SUMS")
	}

	response, err := get(ctx, release.ChecksumsURL)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	scanner := bufio.NewScanner(response.Body)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) != 2 {
			continue
		}
		cleanName := strings.TrimPrefix(fields[1], "*")
		if cleanName == release.AssetName || matchesPlatform(cleanName) {
			return fields[0], nil
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	return "", fmt.Errorf("không tìm thấy mã băm cho %s", release.AssetName)
}

func get(ctx context.Context, url string) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("User-Agent", "KiDrive-Updater")

	client := &http.Client{Timeout: 10 * time.Minute}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		return nil, fmt.Errorf("%s trả về mã trạng thái %s", url, response.Status)
	}
	return response, nil
}

func getJSON(ctx context.Context, url string, into any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "KiDrive-Updater")

	client := &http.Client{Timeout: 30 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("không thể kết nối tới máy chủ cập nhật: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusForbidden {
		return errors.New("máy chủ bị giới hạn tần suất yêu cầu, vui lòng thử lại sau")
	}
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("máy chủ cập nhật trả về %s", response.Status)
	}
	return json.NewDecoder(response.Body).Decode(into)
}

func newer(candidate, current string) bool {
	a, aOK := parse(candidate)
	b, bOK := parse(current)
	if !aOK {
		return false
	}
	if !bOK {
		return true
	}
	for i := range 3 {
		if a[i] != b[i] {
			return a[i] > b[i]
		}
	}
	return false
}

func parse(value string) ([3]int, bool) {
	var out [3]int
	value = strings.TrimPrefix(value, "v")
	if index := strings.IndexAny(value, "-+"); index >= 0 {
		value = value[:index]
	}

	parts := strings.Split(value, ".")
	if len(parts) != 3 {
		return out, false
	}
	for i, part := range parts {
		number, err := strconv.Atoi(part)
		if err != nil {
			return out, false
		}
		out[i] = number
	}
	return out, true
}
