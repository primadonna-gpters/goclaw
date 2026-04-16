package openclaw

import (
	"encoding/json"
	"fmt"

	"github.com/nextlevelbuilder/goclaw/internal/store/pg"
)

// ImportArchiveData is a portable representation that can be fed into
// the existing GoClaw import pipeline (agents_import_*.go).
type ImportArchiveData struct {
	AgentKey       string
	DisplayName    string
	AgentConfig    map[string]json.RawMessage
	ContextFiles   []ContextFile
	MemoryGlobal   []MemoryExportItem
	CronJobs       []pg.CronJobExport
	WorkspaceFiles map[string][]byte
}

// ContextFile is a named file that seeds an agent's context window.
type ContextFile struct {
	FileName string
	Content  string
}

// MemoryExportItem matches the shape of http.MemoryExport but is defined here
// to avoid circular import between openclaw and http packages.
type MemoryExportItem struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	UserID  string `json:"user_id,omitempty"`
}

// mustMarshal panics only on types that cannot be marshalled to JSON (should never happen
// for the plain map/string/bool/int inputs used in BuildImportArchive).
func mustMarshal(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(fmt.Sprintf("archive_builder: unexpected marshal error: %v", err))
	}
	return json.RawMessage(b)
}

// BuildImportArchive assembles a WorkspaceScanResult and related data into an
// ImportArchiveData that the GoClaw import pipeline can consume.
// model and provider are the default values applied to the new agent; empty
// strings cause the import pipeline to fall back to its own defaults.
func BuildImportArchive(
	agentKey, displayName string,
	ws *WorkspaceScanResult,
	cronJobs []pg.CronJobExport,
	defaults *AgentDefaults,
	model, provider string,
) *ImportArchiveData {
	cfg := map[string]json.RawMessage{
		"agent_key":    mustMarshal(agentKey),
		"display_name": mustMarshal(displayName),
		"agent_type":   mustMarshal("predefined"),
	}

	if model != "" {
		cfg["model"] = mustMarshal(model)
	}
	if provider != "" {
		cfg["provider"] = mustMarshal(provider)
	}

	if defaults != nil {
		if defaults.MemorySearch {
			cfg["memory_config"] = mustMarshal(map[string]any{"enabled": true})
		}
		// Skip compaction_config: OpenClaw uses "mode": "safeguard" (string),
		// but GoClaw's CompactionConfig expects numeric tuning fields
		// (reserveTokensFloor, maxHistoryShare, keepLastMessages). Unknown
		// "mode" key parses to zero values, which silently disables history,
		// preventing the agent from ever calling the LLM. Leave empty so
		// GoClaw falls back to its own defaults.
		if defaults.MaxConcurrent > 0 {
			cfg["other_config"] = mustMarshal(map[string]any{"max_concurrent": defaults.MaxConcurrent})
		}
	}

	var contextFiles []ContextFile
	if ws != nil {
		for _, bf := range ws.BootstrapFiles {
			contextFiles = append(contextFiles, ContextFile{
				FileName: bf.Name,
				Content:  bf.Content,
			})
		}
	}

	var memoryGlobal []MemoryExportItem
	if ws != nil {
		for _, md := range ws.MemoryDocs {
			memoryGlobal = append(memoryGlobal, MemoryExportItem{
				Path:    md.Path,
				Content: md.Content,
				// UserID always empty for global memory
			})
		}
	}

	var workspaceFiles map[string][]byte
	if ws != nil {
		workspaceFiles = ws.WorkspaceFiles
	}

	return &ImportArchiveData{
		AgentKey:       agentKey,
		DisplayName:    displayName,
		AgentConfig:    cfg,
		ContextFiles:   contextFiles,
		MemoryGlobal:   memoryGlobal,
		CronJobs:       cronJobs,
		WorkspaceFiles: workspaceFiles,
	}
}
