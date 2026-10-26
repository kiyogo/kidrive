package runner

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	qrcode "github.com/skip2/go-qrcode"
	"golang.org/x/term"

	"github.com/MultiX0/LocalDrive/server/internal/auth"
	"github.com/MultiX0/LocalDrive/server/internal/httpapi"
)

// RunSetup is the interactive installer.
func RunSetup(args []string) int {
	if err := doSetup(args); err != nil {
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "  Setup stopped: "+err.Error())
		fmt.Fprintln(os.Stderr)
		return 1
	}
	return 0
}

// RunResetAdmin recovers a locked-out admin.
func RunResetAdmin(args []string) int {
	if err := doResetAdmin(args); err != nil {
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "  Reset stopped: "+err.Error())
		fmt.Fprintln(os.Stderr)
		return 1
	}
	return 0
}

func setupHeader() {
	fmt.Println()
	fmt.Println("  Local Drive")
	fmt.Println("  Your own file server, on your own hardware.")
	fmt.Println("  ------------------------------------------")
	fmt.Println()
}

func doSetup(args []string) error {
	setupHeader()
	in := bufio.NewReader(os.Stdin)

	install, err := FindInstall(args)
	if err != nil {
		return err
	}

	// 1. where everything lives
	setupStep("Where should Local Drive keep everything")
	dir := setupAsk(in, "Folder", install.Dir)
	install.Dir, err = filepath.Abs(dir)
	if err != nil {
		return err
	}
	install.EnvPath = filepath.Join(install.Dir, ".env")
	install.DataDir = filepath.Join(install.Dir, "data")
	if err := os.MkdirAll(install.DataDir, 0o750); err != nil {
		return fmt.Errorf("could not create %s: %w", install.DataDir, err)
	}
	setupOk("Using " + install.Dir)

	if install.Exists() {
		fmt.Println()
		fmt.Println("  There is already a server configured here.")
		if !setupConfirm(in, "Reconfigure it") {
			fmt.Println()
			fmt.Println("  Nothing changed. To start it: localdrive start")
			fmt.Println()
			return nil
		}
	}

	// 2. how it will run. running directly is the default: it is one process
	// instead of three, it starts faster and it uses noticeably less memory,
	// which is the difference between comfortable and not on a small machine.
	// docker is offered because it adds the proxy, drive management and
	// network discovery, none of which the bare binary can do alone.
	setupStep("How should it run")
	useDocker := false
	if EnsureDocker(true) {
		fmt.Println("    Docker is installed and running.")
		fmt.Println()
		fmt.Println("    Running directly is lighter and is the default. Docker adds")
		fmt.Println("    https, drive management and network discovery.")
		useDocker = !setupConfirm(in, "Run it directly on this machine (recommended)")
	} else {
		fmt.Println()
		fmt.Println("    Local Drive will run directly on this machine.")
		if !setupConfirm(in, "Run it directly on this machine") {
			return errors.New("nothing to do then; install Docker and run this again")
		}
	}
	setupOk(map[bool]string{true: "Using Docker", false: "Running directly on this machine"}[useDocker])

	// 3. the port. not 443: a self-hosted machine usually has other things on
	// it, and 443 is the first port anything else will want.
	setupStep("Which port should it serve on")
	port := DefaultPort
	for {
		raw := setupAsk(in, "Port", strconv.Itoa(DefaultPort))
		parsed, convErr := strconv.Atoi(raw)
		if convErr != nil || parsed < 1 || parsed > 65535 {
			fmt.Println("    That is not a usable port number.")
			continue
		}
		if !PortAvailable(parsed) {
			fmt.Printf("    Port %d is already in use on this machine. Pick another one.\n", parsed)
			continue
		}
		port = parsed
		break
	}
	setupOk(fmt.Sprintf("Serving on port %d", port))

	// 4. a domain, only if they actually have one. the ordinary case is an
	// address on the local network, and this must not pretend otherwise.
	setupStep("Do you have a domain name for this server")
	fmt.Println("    Most people do not, and do not need one. Leave this empty and")
	fmt.Println("    Local Drive is reached at this machine's address on your network.")
	fmt.Println()
	domain := strings.TrimSpace(setupAsk(in, "Domain (leave empty for none)", ""))
	tlsEmail := ""
	if domain != "" {
		fmt.Println()
		fmt.Println("    A certificate authority can send renewal notices. This is optional.")
		tlsEmail = strings.TrimSpace(setupAsk(in, "Email for certificate notices (optional)", ""))
		setupOk("Using " + domain)
	} else {
		setupOk("No domain, which is the normal case")
	}

	// 5. the admin account
	//
	// Only worth asking when this tool can actually create it, which means
	// Docker, because there the server is up by the end of setup and can be
	// called. Running directly it is not, so asking here collected a password,
	// checked it twice, and threw it away.
	username := "admin"
	password := ""
	skipAccount := true
	if useDocker {
		setupStep("Create the admin account")
		fmt.Println("    This is the account you sign in with. You can skip it and use a")
		fmt.Println("    temporary login instead, which has to be changed before anything")
		fmt.Println("    else works.")
		fmt.Println()

		username = setupAsk(in, "Admin username", "admin")
		skipAccount = false
		for {
			password = setupAskSecret("Admin password (leave empty to skip)")
			if password == "" {
				if setupConfirm(in, "Skip and use a temporary login") {
					skipAccount = true
					break
				}
				continue
			}
			if err := auth.ValidatePassword(password); err != nil {
				fmt.Println("    " + err.Error())
				continue
			}
			if setupAskSecret("Type it once more") != password {
				fmt.Println("    Those did not match.")
				continue
			}
			break
		}
	}
	serverName := setupAsk(in, "What should this server be called", "Local Drive")

	// 6. every secret, generated, never blank and never a placeholder
	setupStep("Writing configuration")
	proxy := ProxyConfig{Port: port, Domain: domain, TLSEmail: tlsEmail, Proxied: useDocker}
	env := map[string]string{
		"LD_PORT":                         strconv.Itoa(port),
		"LD_DOMAIN":                       domain,
		"LD_TLS_EMAIL":                    tlsEmail,
		"APP_ENV":                         "production",
		"LOG_LEVEL":                       "info",
		"DATA_DIR":                        filepath.ToSlash(install.DataDir),
		"ACCESS_TOKEN_TTL":                "15m",
		"REFRESH_TOKEN_TTL":               "30d",
		"MAX_UPLOAD_CONCURRENCY":          "4",
		"WORKER_POOL_SIZE":                "2",
		"DEFAULT_QUOTA_BYTES":             "0",
		"TRASH_RETENTION_DAYS":            "30",
		"VERSION_RETENTION_COUNT":         "20",
		"VERSION_RETENTION_DAYS":          "180",
		"ENABLE_LAN_DISCOVERY_DEFAULT":    "true",
		"REQUIRE_DEVICE_APPROVAL_DEFAULT": "true",
		"ALLOW_SELF_REGISTRATION_DEFAULT": "false",
		"PUBLIC_BASE_URL":                 proxy.BaseURL(),
		"JWT_SECRET":                      setupSecret(48),
		"MOUNT_HELPER_SHARED_SECRET":      setupSecret(32),
		"LAN_DISCOVERY_SHARED_SECRET":     setupSecret(32),
	}

	if useDocker {
		env["LISTEN_ADDR"] = fmt.Sprintf(":%d", InternalPort)
		env["DB_PATH"] = "/data/db/localdrive.sqlite"
		env["LIBRARY_PATH"] = "/data/library"
		env["EXTERNAL_MOUNTS_PATH"] = "/data/external"
		env["EXTERNAL_MOUNTS_HOST"] = filepath.ToSlash(filepath.Join(install.DataDir, "external"))
		env["MOUNT_HELPER_SOCKET"] = "/run/localdrive/mount-helper.sock"
		env["LAN_DISCOVERY_SOCKET"] = "/run/localdrive-discovery/lan-discovery.sock"
	} else {
		// running directly, so it binds the real port itself and serves plain
		// http; there is no proxy in front to terminate tls
		env["LISTEN_ADDR"] = fmt.Sprintf(":%d", port)
		env["DB_PATH"] = filepath.ToSlash(filepath.Join(install.DataDir, "db", "localdrive.sqlite"))
		env["LIBRARY_PATH"] = filepath.ToSlash(filepath.Join(install.DataDir, "library"))
		env["EXTERNAL_MOUNTS_PATH"] = filepath.ToSlash(filepath.Join(install.DataDir, "external"))
		// the two helpers are a Docker arrangement; without it there is
		// nothing to talk to, and the server degrades cleanly
		env["MOUNT_HELPER_SOCKET"] = ""
		env["LAN_DISCOVERY_SOCKET"] = ""
	}

	if err := WriteEnvFile(install.EnvPath, env); err != nil {
		return err
	}
	setupOk("Wrote " + install.EnvPath)

	if useDocker {
		if wrote, err := writeIfAbsent(install.CaddyfilePath(), RenderCaddyfile(proxy)); err != nil {
			return err
		} else if wrote {
			setupOk("Wrote " + install.CaddyfilePath())
		}
		compose := RenderCompose(proxy, install.DataDir, env["EXTERNAL_MOUNTS_HOST"])
		if wrote, err := writeIfAbsent(install.ComposePath(), compose); err != nil {
			return err
		} else if wrote {
			setupOk("Wrote " + install.ComposePath())
		}
	}

	// 7. bring it up and wait for it to actually answer
	// https needs caddy, and caddy only exists in the compose file. Running
	// directly is the Go process on its own, speaking plain http whether or not
	// a domain points at it, so keying this off the domain alone advertised an
	// https address that nothing was listening for.
	scheme := "http"
	if domain != "" && useDocker {
		scheme = "https"
	}
	baseURL := fmt.Sprintf("%s://127.0.0.1:%d", scheme, port)
	if useDocker {
		setupStep("Starting Local Drive")
		if err := setupComposeUp(install); err != nil {
			return err
		}
		if err := setupWaitForHealth(port, domain); err != nil {
			return err
		}
		setupOk("The server is up")
	} else {
		baseURL = fmt.Sprintf("http://127.0.0.1:%d", port)
	}

	// 7a. video previews, fetched and proven here rather than later.
	//
	// Doing this now, while somebody is sitting in front of the terminal and
	// expecting setup to take a minute, is the one moment where a download is
	// not a surprise. Left to the server it happens in the background after
	// start, and every video uploaded before it lands has no preview.
	setupFFmpeg()

	// 7b. put the binary on PATH, so every command below can be typed from
	// anywhere instead of only from the directory it was downloaded into
	cli := CLIName()
	setupStep("Making " + CommandName + " a command you can type anywhere")
	if setupConfirm(in, "Install "+CommandName+" on your PATH") {
		installed, err := InstallOnPath()
		switch {
		case err != nil:
			setupOk("Could not install it: " + err.Error())
			setupOk("Keep using " + cli + " from this directory.")
		case installed.AlreadyThere:
			cli = CommandName
			setupOk("Already installed at " + installed.Target)
		default:
			cli = CommandName
			setupOk("Installed " + installed.Target)
			if installed.ProfileLine != "" {
				setupOk("Added it to your PATH in " + installed.Profile)
				setupOk("For this shell only, run: " + installed.ProfileLine)
			}
		}
	} else {
		setupOk("Skipped. Run it as " + cli + " from this directory.")
	}

	// 7c. keep it running. A server that stops when the terminal closes is not
	// one, and on a machine reached over ssh that is the moment you disconnect.
	startedAsService := false
	if !useDocker {
		setupStep("Keeping it running")
		fmt.Println("    It can run in the background and come back after a reboot,")
		fmt.Println("    or you can start it by hand in a terminal each time.")
		fmt.Println()
		if setupConfirm(in, "Run it in the background and start it at boot") {
			status, err := InstallService(install)
			if err != nil {
				setupOk("Could not set that up: " + err.Error())
				setupOk("Start it by hand with " + cli + " start")
			} else {
				PrintServiceResult(status)
				startedAsService = status.Running
			}
		} else {
			fmt.Println()
			fmt.Println("  Start it whenever you like with:")
			fmt.Println()
			fmt.Println("      " + cli + " start")
			fmt.Println()
			fmt.Println("  Or later, to run it in the background: " + cli + " service")
		}
	}
	_ = startedAsService

	// 8. create the real account now, so it exists before anyone opens the app
	if !skipAccount && useDocker {
		setupStep("Creating your account")
		if err := setupCallSetup(baseURL, username, password, serverName); err != nil {
			return err
		}
		setupOk("Signed up as " + username)
	} else if useDocker {
		fmt.Println()
		fmt.Println("  The temporary login is admin / admin12345.")
		fmt.Println("  Change it the first time you open the app. Nothing else works")
		fmt.Println("  until you do.")
	} else {
		setupStep("Your account")
		setupOk("The first person to sign up becomes the admin, so open the")
		setupOk("server once it is running and make yours. After that the")
		setupOk("server refuses to create another one that way.")
	}

	// 9. where to go, including from a phone
	setupStep("You are ready")
	kind := TLSKindFor(domain, "", useDocker)
	addresses := ServerAddresses(domain, port, kind)
	for _, address := range addresses {
		fmt.Println("    " + address)
	}
	if len(addresses) > 0 {
		fmt.Println()
		setupPrintQR(addresses[0])
	}
	fmt.Println()
	fmt.Println("  Open one of those, or scan the code above from a phone.")
	fmt.Println()
	fmt.Println("  " + AddressNote(domain, kind))
	fmt.Println()
	fmt.Println("  " + cli + " status    where it is and whether it is up")
	fmt.Println("  " + cli + " logs      follow the log")
	fmt.Println("  " + cli + " stop      stop it")
	fmt.Println()
	return nil
}

func doResetAdmin(args []string) error {
	install, err := FindInstall(args)
	if err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(install.DataDir, "db")); err != nil {
		if _, statErr := os.Stat("/var/lib/localdrive/data/db"); statErr == nil {
			install.Dir = "/var/lib/localdrive"
			install.DataDir = "/var/lib/localdrive/data"
			install.EnvPath = "/var/lib/localdrive/.env"
		}
	}

	env := install.ReadEnv()
	dataDir := firstNonEmpty(env["DATA_DIR"], install.DataDir)
	dbDir := filepath.Join(dataDir, "db")

	var username, password string
	var posArgs []string
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--dir" || arg == "-d" {
			i++
			continue
		}
		if strings.HasPrefix(arg, "--dir=") {
			continue
		}
		if (arg == "--user" || arg == "-u") && i+1 < len(args) {
			username = args[i+1]
			i++
			continue
		}
		if (arg == "--password" || arg == "-p") && i+1 < len(args) {
			password = args[i+1]
			i++
			continue
		}
		posArgs = append(posArgs, arg)
	}

	if password == "" {
		if len(posArgs) == 1 {
			password = posArgs[0]
		} else if len(posArgs) >= 2 {
			username = posArgs[0]
			password = posArgs[1]
		}
	}

	isInteractive := (password == "")
	if isInteractive {
		setupHeader()
		in := bufio.NewReader(os.Stdin)
		setupStep("Đặt lại mật khẩu quản trị viên (Admin)")
		dir := setupAsk(in, "Thư mục cài đặt", install.Dir)
		if d, err := filepath.Abs(dir); err == nil {
			install.Dir = d
			install.EnvPath = filepath.Join(install.Dir, ".env")
			install.DataDir = filepath.Join(install.Dir, "data")
			env = install.ReadEnv()
			dataDir = firstNonEmpty(env["DATA_DIR"], install.DataDir)
			dbDir = filepath.Join(dataDir, "db")
		}
		username = setupAsk(in, "Tài khoản cần đổi (để trống nếu đổi mật khẩu cho Admin đầu tiên)", username)
		password = setupAskSecret("Mật khẩu mới (để trống để tự sinh ngẫu nhiên)")
		if password == "" {
			password = setupSecret(10)
		}
	}

	if err := auth.ValidatePassword(password); err != nil {
		return err
	}

	// 1. Ghi tệp đánh dấu khôi phục recovery marker
	marker := auth.RecoveryMarker{
		Password:  password,
		Username:  strings.TrimSpace(username),
		CreatedAt: time.Now().UnixMilli(),
	}
	encoded, err := json.MarshalIndent(marker, "", "  ")
	if err == nil {
		_ = os.WriteFile(filepath.Join(dataDir, auth.RecoveryMarkerName), encoded, 0o600)
		_ = os.WriteFile(filepath.Join(dbDir, auth.RecoveryMarkerName), encoded, 0o600)
	}

	// 2. Cập nhật trực tiếp vào cơ sở dữ liệu SQLite nếu tệp DB tồn tại
	dbPath := filepath.Join(dbDir, "localdrive.sqlite")
	targetAdminName := strings.TrimSpace(username)
	if _, statErr := os.Stat(dbPath); statErr == nil {
		sqliteDB, sErr := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
		if sErr == nil {
			defer sqliteDB.Close()
			hasher := auth.NewHasher(65536, 2, 2)
			if hash, hErr := hasher.Hash(password); hErr == nil {
				now := time.Now().UnixMilli()
				var targetID, foundName string
				query := `SELECT id, username FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`
				queryArgs := []any{}
				if strings.TrimSpace(username) != "" {
					query = `SELECT id, username FROM users WHERE lower(username) = lower(?) LIMIT 1`
					queryArgs = append(queryArgs, strings.TrimSpace(username))
				}
				if scanErr := sqliteDB.QueryRow(query, queryArgs...).Scan(&targetID, &foundName); scanErr == nil {
					targetAdminName = foundName
					_, _ = sqliteDB.Exec(`UPDATE users SET password_hash = ?, must_change_password = 0, disabled_at = NULL, updated_at = ? WHERE id = ?`, hash, now, targetID)
					_, _ = sqliteDB.Exec(`UPDATE sessions SET status = 'revoked', revoked_at = ?, refresh_token_hash = NULL WHERE user_id = ?`, now, targetID)
					_ = httpapi.SyncSystemAndSambaUser(targetAdminName, password)
				}
			}
		}
	}

	// 3. Khởi động lại dịch vụ để áp dụng ngay lập tức
	if install.HasCompose() {
		_ = compose(install, "restart", "server")
	} else if runtime.GOOS == "linux" {
		_ = exec.Command("systemctl", "restart", "localdrive").Run()
	}

	if targetAdminName == "" {
		targetAdminName = "Admin (tài khoản đầu tiên)"
	}

	fmt.Println()
	fmt.Println("==================================================================")
	fmt.Println("  ✓ ĐÃ ĐỔI MẬT KHẨU QUẢN TRỊ VIÊN THÀNH CÔNG!")
	fmt.Println("==================================================================")
	fmt.Println()
	fmt.Printf("  • Tài khoản:    %s\n", targetAdminName)
	fmt.Printf("  • Mật khẩu mới: %s\n", password)
	fmt.Println()
	fmt.Println("  Bạn có thể đăng nhập ngay vào Web / Desktop / Mobile với mật khẩu trên.")
	fmt.Println("==================================================================")
	fmt.Println()
	return nil
}

// host checks

func setupComposeUp(install Install) error {
	cmd := exec.Command("docker", "compose", "up", "-d", "--build")
	cmd.Dir = install.Dir
	return setupRunWithProgress(cmd, "Building and starting")
}

// setupRunWithProgress shows a moving indicator instead of a wall of container
// logs, and only prints the log if something actually failed.
func setupRunWithProgress(cmd *exec.Cmd, label string) error {
	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output

	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	frames := []string{".  ", ".. ", "..."}
	ticker := time.NewTicker(400 * time.Millisecond)
	defer ticker.Stop()
	frame := 0
	for {
		select {
		case err := <-done:
			fmt.Printf("\r    %s ... done      \n", label)
			if err != nil {
				fmt.Println()
				fmt.Println(strings.TrimSpace(output.String()))
				return fmt.Errorf("%s failed", label)
			}
			return nil
		case <-ticker.C:
			fmt.Printf("\r    %s %s", label, frames[frame%len(frames)])
			frame++
		}
	}
}

func setupWaitForHealth(port int, domain string) error {
	deadline := time.Now().Add(3 * time.Minute)
	for time.Now().Before(deadline) {
		if up, _ := probeHealth(port, domain); up {
			fmt.Print("\r                                        \r")
			return nil
		}
		fmt.Print("\r    Waiting for the server to answer ...")
		time.Sleep(2 * time.Second)
	}
	fmt.Println()
	return errors.New("the server did not come up in time, check: localdrive logs")
}

func setupCallSetup(baseURL, username, password, serverName string) error {
	body, err := json.Marshal(map[string]string{
		"username":    username,
		"password":    password,
		"server_name": serverName,
		"device_name": "Setup",
		"platform":    runtime.GOOS,
	})
	if err != nil {
		return err
	}
	client := &http.Client{
		Timeout:   20 * time.Second,
		Transport: &http.Transport{TLSClientConfig: insecureLocalTLS()},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/api/v1/setup", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusConflict {
		return errors.New("this server already has an account, use: localdrive reset-admin")
	}
	if resp.StatusCode >= 400 {
		var payload map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&payload)
		return fmt.Errorf("the server refused the account: %v", payload)
	}
	return nil
}

// output helpers

func setupStep(label string) {
	fmt.Println()
	fmt.Println("  " + label)
}

func setupOk(message string) { fmt.Println("    " + message) }

func setupAsk(in *bufio.Reader, prompt, def string) string {
	if def != "" {
		fmt.Printf("  %s [%s]: ", prompt, def)
	} else {
		fmt.Printf("  %s: ", prompt)
	}
	line, err := in.ReadString('\n')
	if err != nil {
		return def
	}
	line = strings.TrimSpace(line)
	if line == "" {
		return def
	}
	return line
}

func setupAskSecret(prompt string) string {
	fmt.Printf("  %s: ", prompt)
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		reader := bufio.NewReader(os.Stdin)
		line, _ := reader.ReadString('\n')
		return strings.TrimSpace(line)
	}
	raw, err := term.ReadPassword(fd)
	fmt.Println()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(raw))
}

func setupConfirm(in *bufio.Reader, prompt string) bool {
	answer := strings.ToLower(setupAsk(in, prompt+" (y/n)", "y"))
	return answer == "y" || answer == "yes"
}

func setupSecret(bytesLen int) string {
	buf := make([]byte, bytesLen)
	if _, err := rand.Read(buf); err != nil {
		panic("crypto/rand unavailable: " + err.Error())
	}
	return base64.RawURLEncoding.EncodeToString(buf)
}

func setupPrintQR(target string) {
	code, err := qrcode.New(target, qrcode.Low)
	if err != nil {
		return
	}
	fmt.Print(code.ToSmallString(false))
}


// RunSyncShares syncs Samba shares, system users, and folder ACLs.
func RunSyncShares(args []string) int {
	if err := doSyncShares(args); err != nil {
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "  Sync failed: "+err.Error())
		fmt.Fprintln(os.Stderr)
		return 1
	}
	return 0
}

func doSyncShares(args []string) error {
	install, _ := FindInstall(args)
	for i := 0; i < len(args); i++ {
		if (args[i] == "--dir" || args[i] == "-d") && i+1 < len(args) {
			if d, err := filepath.Abs(args[i+1]); err == nil {
				install.Dir = d
				install.EnvPath = filepath.Join(install.Dir, ".env")
				install.DataDir = filepath.Join(install.Dir, "data")
			}
			i++
		}
	}
	env := install.ReadEnv()
	dataDir := firstNonEmpty(env["DATA_DIR"], install.DataDir)
	dbDir := filepath.Join(dataDir, "db")
	dbPath := filepath.Join(dbDir, "localdrive.sqlite")

	if _, err := os.Stat(dbPath); err != nil {
		for _, cand := range []string{
			"/var/lib/localdrive/data/db/localdrive.sqlite",
			"/var/lib/localdrive/db/localdrive.sqlite",
			"data/db/localdrive.sqlite",
		} {
			if _, sErr := os.Stat(cand); sErr == nil {
				dbPath = cand
				break
			}
		}
	}

	if err := httpapi.SyncAllACLsFromDB(dbPath); err != nil {
		return err
	}

	if runtime.GOOS == "linux" {
		_ = exec.Command("smbcontrol", "smbd", "reload-config").Run()
		_ = exec.Command("systemctl", "reload", "smbd").Run()
		_ = exec.Command("systemctl", "restart", "smbd").Run()
	}

	fmt.Println()
	fmt.Println("==================================================================")
	fmt.Println("  ✓ ĐÃ ĐỒNG BỘ PHÂN QUYỀN CHIA SẺ MẠNG NỘI BỘ VÀ ACL THÀNH CÔNG!")
	fmt.Println("==================================================================")
	fmt.Println()
	fmt.Println("  Tất cả thư mục tập dữ liệu đã được gán quyền POSIX ACL theo người dùng.")
	fmt.Println("  Người dùng chỉ có thể truy cập đúng thư mục được cấp quyền trên Samba.")
	fmt.Println("==================================================================")
	fmt.Println()
	return nil
}

// RunSetPassword sets a user's password and syncs Samba credentials.
func RunSetPassword(args []string) int {
	if err := doSetPassword(args); err != nil {
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "  Error: "+err.Error())
		fmt.Fprintln(os.Stderr)
		return 1
	}
	return 0
}

func doSetPassword(args []string) error {
	var username, password string
	install, _ := FindInstall(args)
	if _, err := os.Stat(filepath.Join(install.DataDir, "db")); err != nil {
		if _, statErr := os.Stat("/var/lib/localdrive/data/db"); statErr == nil {
			install.Dir = "/var/lib/localdrive"
			install.DataDir = "/var/lib/localdrive/data"
			install.EnvPath = "/var/lib/localdrive/.env"
		}
	}

	for i := 0; i < len(args); i++ {
		arg := args[i]
		if (arg == "--dir" || arg == "-d") && i+1 < len(args) {
			i++
			continue
		}
		if (arg == "--user" || arg == "-u") && i+1 < len(args) {
			username = args[i+1]
			i++
			continue
		}
		if (arg == "--password" || arg == "-p") && i+1 < len(args) {
			password = args[i+1]
			i++
			continue
		}
		if username == "" {
			username = arg
		} else if password == "" {
			password = arg
		}
	}

	username = strings.TrimSpace(username)
	password = strings.TrimSpace(password)
	if username == "" || password == "" {
		return errors.New("cần nhập: localdrive set-password <tên_người_dùng> <mật_khẩu>")
	}

	env := install.ReadEnv()
	dataDir := firstNonEmpty(env["DATA_DIR"], install.DataDir)
	dbDir := filepath.Join(dataDir, "db")
	dbPath := filepath.Join(dbDir, "localdrive.sqlite")

	if _, err := os.Stat(dbPath); err != nil {
		for _, cand := range []string{
			"/var/lib/localdrive/data/db/localdrive.sqlite",
			"/var/lib/localdrive/db/localdrive.sqlite",
			"data/db/localdrive.sqlite",
		} {
			if _, sErr := os.Stat(cand); sErr == nil {
				dbPath = cand
				break
			}
		}
	}

	sqliteDB, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return err
	}
	defer sqliteDB.Close()

	hasher := auth.NewHasher(65536, 2, 2)
	hash, err := hasher.Hash(password)
	if err != nil {
		return err
	}

	now := time.Now().UnixMilli()
	var targetID, foundName string
	query := `SELECT id, username FROM users WHERE lower(username) = lower(?) LIMIT 1`
	if err := sqliteDB.QueryRow(query, username).Scan(&targetID, &foundName); err != nil {
		return fmt.Errorf("không tìm thấy người dùng %q trong cơ sở dữ liệu", username)
	}

	_, _ = sqliteDB.Exec(`UPDATE users SET password_hash = ?, must_change_password = 0, disabled_at = NULL, updated_at = ? WHERE id = ?`, hash, now, targetID)
	_, _ = sqliteDB.Exec(`UPDATE sessions SET status = 'revoked', revoked_at = ?, refresh_token_hash = NULL WHERE user_id = ?`, now, targetID)

	_ = httpapi.SyncSystemAndSambaUser(foundName, password)

	fmt.Println()
	fmt.Println("==================================================================")
	fmt.Printf("  ✓ ĐÃ CẬP NHẬT MẬT KHẨU CHO %s THÀNH CÔNG!\n", foundName)
	fmt.Println("==================================================================")
	fmt.Println("  Mật khẩu và tài khoản Samba đã được đồng bộ.")
	fmt.Println("==================================================================")
	fmt.Println()
	return nil
}
