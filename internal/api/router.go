package api

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/RandomCodeSpace/docsgraphcontext/internal/config"
	"github.com/RandomCodeSpace/docsgraphcontext/internal/embedder"
	"github.com/RandomCodeSpace/docsgraphcontext/internal/llm"
	"github.com/RandomCodeSpace/docsgraphcontext/internal/mcp"
	"github.com/RandomCodeSpace/docsgraphcontext/internal/store"
	"github.com/RandomCodeSpace/docsgraphcontext/ui"
)

// NewRouter builds the single http.ServeMux with all routes.
func NewRouter(st *store.Store, prov llm.Provider, emb *embedder.Embedder, cfg *config.Config) http.Handler {
	mcpServer := mcp.New(st, prov, emb, cfg)
	h := &handlers{store: st, provider: prov, embedder: emb, cfg: cfg}

	mux := http.NewServeMux()

	// MCP Streamable HTTP transport (POST /mcp, GET /mcp for SSE stream)
	mux.Handle("/mcp", mcpServer.Handler())

	// REST API
	mux.HandleFunc("GET /api/stats", h.getStats)
	mux.HandleFunc("GET /api/documents", h.listDocuments)
	mux.HandleFunc("GET /api/documents/{id}", h.getDocument)
	mux.HandleFunc("GET /api/documents/{id}/versions", h.getDocumentVersions)
	mux.HandleFunc("POST /api/search", h.search)
	mux.HandleFunc("GET /api/graph/neighborhood", h.graphNeighborhood)
	mux.HandleFunc("GET /api/entities", h.listEntities)
	mux.HandleFunc("GET /api/communities", h.listCommunities)
	mux.HandleFunc("GET /api/communities/{id}", h.getCommunity)
	mux.HandleFunc("POST /api/upload", h.upload)
	mux.HandleFunc("GET /api/upload/progress", h.uploadProgress)

	// Embedded UI
	mux.Handle("/", http.FileServer(http.FS(ui.Assets)))

	return loggingMiddleware(mux)
}

// loggingMiddleware logs method, path, status code, and duration for every request.
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		duration := time.Since(start)

		level := slog.LevelInfo
		if rw.status >= 500 {
			level = slog.LevelError
		} else if rw.status >= 400 {
			level = slog.LevelWarn
		}

		slog.Log(r.Context(), level, "http",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.status,
			"duration_ms", duration.Milliseconds(),
		)
	})
}

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}
