package pixeloffice

import (
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// Handler serves pixel-office REST snapshots, WebSocket event streams,
// and the optional embedded SPA.
type Handler struct {
	collector *Collector
	upgrader  websocket.Upgrader
	uiFS      fs.FS // may be nil when no SPA is embedded
}

// NewHandler creates a Handler backed by the given collector.
// uiFS may be nil; when nil the SPA route is not registered.
func NewHandler(collector *Collector, uiFS fs.FS) *Handler {
	return &Handler{
		collector: collector,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin:     func(*http.Request) bool { return true },
		},
		uiFS: uiFS,
	}
}

// RegisterRoutes adds pixel-office routes to the given mux.
// Implements the gateway routeRegistrar interface.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	// Debug endpoint to verify routing works.
	mux.HandleFunc("/pixel-office-ping", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte("pong"))
	})

	mux.HandleFunc("GET /v1/pixel-office/agents", h.handleSnapshot)
	mux.HandleFunc("/ws/pixel-office", h.handleWS)

	if h.uiFS != nil {
		fileServer := http.FileServer(http.FS(h.uiFS))
		mux.Handle("/pixel-office/", h.spaHandler(fileServer))
		slog.Info("pixel-office: serving embedded UI at /pixel-office/")
	} else {
		slog.Info("pixel-office: UI not embedded (uiFS is nil), API-only mode")
	}
	slog.Info("pixel-office: routes registered", "hasUI", h.uiFS != nil)
}

// snapshotResponse is the JSON envelope for the snapshot endpoint.
type snapshotResponse struct {
	Agents []AgentState `json:"agents"`
}

// handleSnapshot returns the current agent states as JSON.
func (h *Handler) handleSnapshot(w http.ResponseWriter, _ *http.Request) {
	snap := h.collector.Snapshot()

	agents := make([]AgentState, 0, len(snap))
	for _, st := range snap {
		agents = append(agents, st)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(snapshotResponse{Agents: agents}); err != nil {
		slog.Error("pixeloffice: snapshot encode", "error", err)
	}
}

// wsInitMessage is the first message sent to a newly connected WS client.
type wsInitMessage struct {
	Type   string       `json:"type"`
	Agents []AgentState `json:"agents"`
}

// handleWS upgrades the connection to WebSocket, sends an initial snapshot,
// then streams collector events until the client disconnects.
func (h *Handler) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("pixeloffice: ws upgrade", "error", err)
		return
	}
	defer conn.Close()

	// Send initial snapshot.
	snap := h.collector.Snapshot()
	agents := make([]AgentState, 0, len(snap))
	for _, st := range snap {
		agents = append(agents, st)
	}
	initMsg := wsInitMessage{Type: "snapshot", Agents: agents}
	if err := conn.WriteJSON(initMsg); err != nil {
		slog.Error("pixeloffice: ws init write", "error", err)
		return
	}

	// Event channel — buffered to avoid blocking broadcast under burst.
	eventCh := make(chan PixelEvent, 64)
	subID := h.collector.Subscribe(func(ev PixelEvent) {
		select {
		case eventCh <- ev:
		default:
			// Drop event if channel is full — client is too slow.
		}
	})
	defer h.collector.Unsubscribe(subID)

	// done signals the write pump to exit when the read pump detects disconnect.
	done := make(chan struct{})

	// Read pump — drain client messages; close done on disconnect.
	go func() {
		defer close(done)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	// Write pump — forward events from channel to WS with deadline.
	const writeWait = 10 * time.Second
	for {
		select {
		case ev := <-eventCh:
			_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteJSON(ev); err != nil {
				return
			}
		case <-done:
			return
		}
	}
}

// spaHandler returns an http.Handler that serves the pixel-office SPA.
// Static files are served directly; unmatched paths fall back to index.html.
func (h *Handler) spaHandler(fileServer http.Handler) http.Handler {
	return http.StripPrefix("/pixel-office/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Determine the file path within the FS.
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		// Try serving the file directly.
		if _, err := fs.Stat(h.uiFS, path); err == nil {
			// Cache hashed assets aggressively.
			if strings.HasPrefix(path, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback: serve index.html for client-side routing.
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	}))
}
