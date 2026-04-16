package pixeloffice

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nextlevelbuilder/goclaw/internal/agent"
	"github.com/nextlevelbuilder/goclaw/pkg/protocol"
)

// seedCollector creates a collector with some pre-populated agent state.
func seedCollector() *Collector {
	c := NewCollector()
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunStarted,
		AgentID: "agent-a",
		RunID:   "run-1",
	})
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunStarted,
		AgentID: "agent-b",
		RunID:   "run-2",
	})
	return c
}

func TestHandler_Snapshot(t *testing.T) {
	c := seedCollector()
	h := NewHandler(c, nil)

	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/v1/pixel-office/agents", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	ct := rec.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("expected Content-Type application/json, got %q", ct)
	}

	var resp snapshotResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}

	if len(resp.Agents) != 2 {
		t.Fatalf("expected 2 agents, got %d", len(resp.Agents))
	}

	ids := map[string]bool{}
	for _, a := range resp.Agents {
		ids[a.ID] = true
		if a.Status != StatusTyping {
			t.Errorf("agent %s: expected status %q, got %q", a.ID, StatusTyping, a.Status)
		}
	}
	if !ids["agent-a"] || !ids["agent-b"] {
		t.Errorf("expected agents agent-a and agent-b, got %v", ids)
	}
}

func TestHandler_Snapshot_Empty(t *testing.T) {
	c := NewCollector()
	h := NewHandler(c, nil)

	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/v1/pixel-office/agents", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp snapshotResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}

	if resp.Agents == nil {
		t.Fatal("expected non-nil agents slice (empty array, not null)")
	}
	if len(resp.Agents) != 0 {
		t.Fatalf("expected 0 agents, got %d", len(resp.Agents))
	}
}

func TestHandler_RegisterRoutes(t *testing.T) {
	c := NewCollector()

	// Create a fake FS for the SPA.
	fakeFS := fstest.MapFS{
		"index.html":        {Data: []byte("<html>pixel office</html>")},
		"assets/app.js":     {Data: []byte("console.log('app')")},
		"assets/style.css":  {Data: []byte("body{}")},
	}

	h := NewHandler(c, fakeFS)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	tests := []struct {
		name       string
		method     string
		path       string
		wantStatus int
	}{
		{
			name:       "snapshot endpoint",
			method:     http.MethodGet,
			path:       "/v1/pixel-office/agents",
			wantStatus: http.StatusOK,
		},
		{
			name:       "SPA index",
			method:     http.MethodGet,
			path:       "/pixel-office/",
			wantStatus: http.StatusOK,
		},
		{
			name:       "SPA static asset",
			method:     http.MethodGet,
			path:       "/pixel-office/assets/app.js",
			wantStatus: http.StatusOK,
		},
		{
			name:       "SPA fallback to index.html",
			method:     http.MethodGet,
			path:       "/pixel-office/some/route",
			wantStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d", tt.wantStatus, rec.Code)
			}
		})
	}
}

func TestHandler_SPA_CacheHeader(t *testing.T) {
	fakeFS := fstest.MapFS{
		"index.html":    {Data: []byte("<html></html>")},
		"assets/app.js": {Data: []byte("js")},
	}

	h := NewHandler(NewCollector(), fakeFS)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	// Assets path should get cache header.
	req := httptest.NewRequest(http.MethodGet, "/pixel-office/assets/app.js", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	cc := rec.Header().Get("Cache-Control")
	if !strings.Contains(cc, "max-age=31536000") {
		t.Errorf("expected long-lived cache for assets, got %q", cc)
	}

	// Non-asset path should NOT get cache header.
	req = httptest.NewRequest(http.MethodGet, "/pixel-office/", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	cc = rec.Header().Get("Cache-Control")
	if strings.Contains(cc, "max-age=31536000") {
		t.Errorf("index.html should not get long-lived cache, got %q", cc)
	}
}

func TestHandler_SPA_NilFS(t *testing.T) {
	// When uiFS is nil, the SPA route should not be registered.
	h := NewHandler(NewCollector(), nil)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/pixel-office/", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Without a catch-all handler, the default mux returns 404.
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 when uiFS is nil, got %d", rec.Code)
	}
}

func TestHandler_WS_InitialSnapshot(t *testing.T) {
	c := seedCollector()
	h := NewHandler(c, nil)

	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	srv := httptest.NewServer(mux)
	defer srv.Close()

	// Connect via WebSocket.
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/pixel-office"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("ws dial: %v", err)
	}
	defer conn.Close()

	// Read the initial snapshot message.
	var initMsg wsInitMessage
	if err := conn.ReadJSON(&initMsg); err != nil {
		t.Fatalf("read init: %v", err)
	}

	if initMsg.Type != "snapshot" {
		t.Errorf("expected type %q, got %q", "snapshot", initMsg.Type)
	}
	if len(initMsg.Agents) != 2 {
		t.Errorf("expected 2 agents in snapshot, got %d", len(initMsg.Agents))
	}
}

func TestHandler_WS_EventStream(t *testing.T) {
	c := NewCollector()
	h := NewHandler(c, nil)

	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	srv := httptest.NewServer(mux)
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/pixel-office"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("ws dial: %v", err)
	}
	defer conn.Close()

	// Drain the initial snapshot.
	var initMsg wsInitMessage
	if err := conn.ReadJSON(&initMsg); err != nil {
		t.Fatalf("read init: %v", err)
	}

	// Trigger an event on the collector.
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunStarted,
		AgentID: "agent-x",
		RunID:   "run-99",
	})

	// Read the event from WebSocket.
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var ev PixelEvent
	if err := conn.ReadJSON(&ev); err != nil {
		t.Fatalf("read event: %v", err)
	}

	if ev.AgentID != "agent-x" {
		t.Errorf("expected AgentID %q, got %q", "agent-x", ev.AgentID)
	}
	if ev.Status != StatusTyping {
		t.Errorf("expected status %q, got %q", StatusTyping, ev.Status)
	}
	if ev.Type != protocol.AgentEventRunStarted {
		t.Errorf("expected type %q, got %q", protocol.AgentEventRunStarted, ev.Type)
	}
}

func TestHandler_WS_CleanupOnDisconnect(t *testing.T) {
	c := NewCollector()
	h := NewHandler(c, nil)

	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	srv := httptest.NewServer(mux)
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/pixel-office"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("ws dial: %v", err)
	}

	// Read initial snapshot.
	var initMsg wsInitMessage
	_ = conn.ReadJSON(&initMsg)

	// Record subscriber count before disconnect.
	c.subMu.RLock()
	subsBefore := len(c.subs)
	c.subMu.RUnlock()

	if subsBefore != 1 {
		t.Fatalf("expected 1 subscriber, got %d", subsBefore)
	}

	// Close the connection.
	conn.Close()

	// Give the handler goroutine time to clean up.
	time.Sleep(100 * time.Millisecond)

	c.subMu.RLock()
	subsAfter := len(c.subs)
	c.subMu.RUnlock()

	if subsAfter != 0 {
		t.Errorf("expected 0 subscribers after disconnect, got %d", subsAfter)
	}
}

// Verify that the Handler satisfies fs.FS interface expectations when uiFS is provided.
func TestHandler_UIFSInterface(t *testing.T) {
	fakeFS := fstest.MapFS{
		"index.html": {Data: []byte("<html></html>")},
	}

	// Verify it implements fs.FS.
	var _ fs.FS = fakeFS

	h := NewHandler(NewCollector(), fakeFS)
	if h.uiFS == nil {
		t.Fatal("expected uiFS to be set")
	}
}
