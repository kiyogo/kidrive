package webui

import (
	"embed"
	"io/fs"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

// Handler returns an http.Handler that serves the embedded web-client on port 5437
// and reverse-proxies API requests to the backend server.
func Handler(backendAddr string) http.Handler {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(sub))

	// Backend URL for proxying
	backendHost := backendAddr
	if strings.HasPrefix(backendHost, ":") {
		backendHost = "127.0.0.1" + backendHost
	}
	if !strings.HasPrefix(backendHost, "http://") && !strings.HasPrefix(backendHost, "https://") {
		backendHost = "http://" + backendHost
	}
	targetURL, _ := url.Parse(backendHost)
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Forward API, share, websocket, and health endpoints to backend
		if strings.HasPrefix(path, "/api/") ||
			strings.HasPrefix(path, "/s/") ||
			path == "/ws" ||
			path == "/healthz" ||
			path == "/metrics" {
			proxy.ServeHTTP(w, r)
			return
		}

		cleanPath := strings.TrimPrefix(path, "/")
		if cleanPath == "" {
			fileServer.ServeHTTP(w, r)
			return
		}

		// Check if file physically exists in dist
		if f, err := sub.Open(cleanPath); err == nil {
			_ = f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		// If it's a direct file asset like .js, .css, .png that wasn't found, 404
		if strings.Contains(cleanPath, ".") && !strings.HasSuffix(cleanPath, ".html") {
			http.NotFound(w, r)
			return
		}

		// Fallback to index.html for SPA client-side routes (e.g. /files, /storage, /settings)
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})
}
