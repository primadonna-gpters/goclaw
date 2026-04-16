package openclaw

import (
	"encoding/json"
	"testing"

	"github.com/nextlevelbuilder/goclaw/internal/store/pg"
)

// helper to decode a json.RawMessage into a map for assertions.
func decodeMap(t *testing.T, raw json.RawMessage) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("decodeMap: %v", err)
	}
	return m
}

func TestBuildImportArchive(t *testing.T) {
	ws := &WorkspaceScanResult{
		BootstrapFiles: []BootstrapFile{
			{Name: "SOUL.md", Content: "soul content"},
			{Name: "IDENTITY.md", Content: "identity content"},
		},
		MemoryDocs: []MemoryDoc{
			{Path: "memory/note.md", Content: "note"},
			{Path: "memory/devlogs/log1.md", Content: "log"},
		},
		WorkspaceFiles: map[string][]byte{
			"tools/foo.py": []byte("print('hello')"),
			"tools/bar.py": []byte("pass"),
		},
	}

	cronJobs := []pg.CronJobExport{
		{Name: "daily-job", ScheduleKind: "cron"},
	}

	archive := BuildImportArchive("my-agent", "My Agent", ws, cronJobs, nil, "", "")

	// Basic identity fields
	if archive.AgentKey != "my-agent" {
		t.Errorf("AgentKey = %q, want %q", archive.AgentKey, "my-agent")
	}
	if archive.DisplayName != "My Agent" {
		t.Errorf("DisplayName = %q, want %q", archive.DisplayName, "My Agent")
	}

	// AgentConfig core fields
	cfg := archive.AgentConfig
	if cfg == nil {
		t.Fatal("AgentConfig is nil")
	}

	var agentKey string
	if err := json.Unmarshal(cfg["agent_key"], &agentKey); err != nil || agentKey != "my-agent" {
		t.Errorf("agent_key = %q, want %q", agentKey, "my-agent")
	}

	var displayName string
	if err := json.Unmarshal(cfg["display_name"], &displayName); err != nil || displayName != "My Agent" {
		t.Errorf("display_name = %q, want %q", displayName, "My Agent")
	}

	var agentType string
	if err := json.Unmarshal(cfg["agent_type"], &agentType); err != nil || agentType != "predefined" {
		t.Errorf("agent_type = %q, want %q", agentType, "predefined")
	}

	// Context files
	if len(archive.ContextFiles) != 2 {
		t.Errorf("ContextFiles count = %d, want 2", len(archive.ContextFiles))
	}
	if archive.ContextFiles[0].FileName != "SOUL.md" {
		t.Errorf("ContextFiles[0].FileName = %q, want SOUL.md", archive.ContextFiles[0].FileName)
	}

	// Memory docs
	if len(archive.MemoryGlobal) != 2 {
		t.Errorf("MemoryGlobal count = %d, want 2", len(archive.MemoryGlobal))
	}
	for _, m := range archive.MemoryGlobal {
		if m.UserID != "" {
			t.Errorf("MemoryGlobal UserID should be empty, got %q", m.UserID)
		}
	}

	// Workspace files
	if len(archive.WorkspaceFiles) != 2 {
		t.Errorf("WorkspaceFiles count = %d, want 2", len(archive.WorkspaceFiles))
	}

	// Cron jobs
	if len(archive.CronJobs) != 1 {
		t.Errorf("CronJobs count = %d, want 1", len(archive.CronJobs))
	}
}

func TestBuildImportArchive_WithDefaults(t *testing.T) {
	ws := &WorkspaceScanResult{}
	defaults := &AgentDefaults{
		MemorySearch:   true,
		CompactionMode: "aggressive",
		MaxConcurrent:  5,
	}

	archive := BuildImportArchive("agent-x", "Agent X", ws, nil, defaults, "", "")
	cfg := archive.AgentConfig

	// memory_config
	if raw, ok := cfg["memory_config"]; !ok {
		t.Error("memory_config key missing from AgentConfig")
	} else {
		m := decodeMap(t, raw)
		if enabled, _ := m["enabled"].(bool); !enabled {
			t.Errorf("memory_config.enabled = %v, want true", m["enabled"])
		}
	}

	// compaction_config
	if raw, ok := cfg["compaction_config"]; !ok {
		t.Error("compaction_config key missing from AgentConfig")
	} else {
		m := decodeMap(t, raw)
		if mode, _ := m["mode"].(string); mode != "aggressive" {
			t.Errorf("compaction_config.mode = %q, want aggressive", mode)
		}
	}

	// other_config
	if raw, ok := cfg["other_config"]; !ok {
		t.Error("other_config key missing from AgentConfig")
	} else {
		m := decodeMap(t, raw)
		// JSON numbers unmarshal as float64
		if mc, _ := m["max_concurrent"].(float64); int(mc) != 5 {
			t.Errorf("other_config.max_concurrent = %v, want 5", m["max_concurrent"])
		}
	}
}

func TestBuildImportArchive_WithDefaults_ZeroValues(t *testing.T) {
	// When defaults have zero/false values, optional keys must NOT appear.
	ws := &WorkspaceScanResult{}
	defaults := &AgentDefaults{
		MemorySearch:   false,
		CompactionMode: "",
		MaxConcurrent:  0,
	}

	archive := BuildImportArchive("agent-z", "Agent Z", ws, nil, defaults, "", "")
	cfg := archive.AgentConfig

	if _, ok := cfg["memory_config"]; ok {
		t.Error("memory_config should not be present when MemorySearch is false")
	}
	if _, ok := cfg["compaction_config"]; ok {
		t.Error("compaction_config should not be present when CompactionMode is empty")
	}
	if _, ok := cfg["other_config"]; ok {
		t.Error("other_config should not be present when MaxConcurrent is 0")
	}
}

func TestBuildImportArchive_EmptyInput(t *testing.T) {
	ws := &WorkspaceScanResult{}

	archive := BuildImportArchive("empty-agent", "Empty Agent", ws, nil, nil, "", "")

	if archive == nil {
		t.Fatal("BuildImportArchive returned nil")
	}
	if archive.AgentKey != "empty-agent" {
		t.Errorf("AgentKey = %q, want empty-agent", archive.AgentKey)
	}
	if len(archive.ContextFiles) != 0 {
		t.Errorf("ContextFiles count = %d, want 0", len(archive.ContextFiles))
	}
	if len(archive.MemoryGlobal) != 0 {
		t.Errorf("MemoryGlobal count = %d, want 0", len(archive.MemoryGlobal))
	}
	if len(archive.CronJobs) != 0 {
		t.Errorf("CronJobs count = %d, want 0", len(archive.CronJobs))
	}

	// AgentConfig must still have the three required keys
	for _, key := range []string{"agent_key", "display_name", "agent_type"} {
		if _, ok := archive.AgentConfig[key]; !ok {
			t.Errorf("AgentConfig missing required key %q", key)
		}
	}
}
