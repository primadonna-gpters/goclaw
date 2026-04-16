package http

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/nextlevelbuilder/goclaw/internal/config"
	"github.com/nextlevelbuilder/goclaw/internal/crypto"
	"github.com/nextlevelbuilder/goclaw/internal/openclaw"
	"github.com/nextlevelbuilder/goclaw/internal/store"
	"github.com/nextlevelbuilder/goclaw/internal/store/pg"
	"github.com/nextlevelbuilder/goclaw/pkg/protocol"
)

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

type openClawScanRequest struct {
	Path string `json:"path"`
}

type openClawScanResponse struct {
	Agents     []openClawAgentPreview   `json:"agents"`
	Channels   []openClawChannelPreview `json:"channels"`
	MCPServers []openClawMCPPreview     `json:"mcp_servers"`
	EnvVars    []openClawEnvPreview     `json:"env_vars"`
	LargeDirs  []openClawLargeDirInfo   `json:"large_dirs"`
	Warnings   []string                 `json:"warnings"`
}

type openClawLargeDirInfo struct {
	AgentID   string `json:"agent_id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	SizeHuman string `json:"size_human"`
	SizeBytes int64  `json:"size_bytes"`
}

type openClawAgentPreview struct {
	ID                 string                   `json:"id"`
	WorkspacePath      string                   `json:"workspace_path"`
	BootstrapFiles     int                      `json:"bootstrap_files"`
	BootstrapFileNames []string                 `json:"bootstrap_file_names"`
	MemoryDocs         int                      `json:"memory_docs"`
	Skills             int                      `json:"skills"`
	SkillList          []openClawSkillPreview    `json:"skill_list"`
	CronJobs           int                      `json:"cron_jobs"`
	CronJobNames       []string                 `json:"cron_job_names"`
	HasEnv             bool                     `json:"has_env"`
}

type openClawSkillPreview struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Source      string `json:"source"` // "workspace" or "shared"
}

type openClawChannelPreview struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	AgentID       string `json:"agent_id"`
	HasCredential bool   `json:"has_credential"`
}

type openClawMCPPreview struct {
	Name      string   `json:"name"`
	Command   string   `json:"command"`
	Transport string   `json:"transport"`
	EnvKeys   []string `json:"env_keys"`
}

type openClawEnvPreview struct {
	Key       string `json:"key"`
	SourceKey string `json:"source_key"`
	TargetKey string `json:"target_key"`
	Category  string `json:"category"`
}

type openClawImportRequest struct {
	Path               string                          `json:"path"`
	SelectedAgents     []string                        `json:"selected_agents"`
	IncludeCredentials bool                            `json:"include_credentials"`
	WorkspaceMode      string                          `json:"workspace_mode"` // "symlink" (default) or "copy"
	AgentSelections    map[string]openClawAgentSelection `json:"agent_selections,omitempty"`
}

type openClawAgentSelection struct {
	BootstrapFiles []string `json:"bootstrap_files,omitempty"` // nil = all
	Skills         []string `json:"skills,omitempty"`          // nil = all, list of slugs
	CronJobs       []string `json:"cron_jobs,omitempty"`       // nil = all, list of slugified names
}

type openClawImportResponse struct {
	Results []openClawImportResult `json:"results"`
}

type openClawImportResult struct {
	AgentKey          string              `json:"agent_key"`
	Summary           *ImportSummary      `json:"summary"`
	SkillsImported    int                 `json:"skills_imported"`
	ChannelsCreated   []string            `json:"channels_created"`
	MCPServersCreated []string            `json:"mcp_servers_created"`
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// handleOpenClawScan scans an OpenClaw directory and returns a migration preview.
// POST /v1/import/openclaw/scan
func (h *AgentsHandler) handleOpenClawScan(w http.ResponseWriter, r *http.Request) {
	userID := store.UserIDFromContext(r.Context())
	if !h.canImport(userID) {
		writeError(w, http.StatusForbidden, protocol.ErrUnauthorized, "openclaw import requires system owner")
		return
	}

	var req openClawScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, protocol.ErrInvalidRequest, "invalid JSON body")
		return
	}
	if req.Path == "" {
		writeError(w, http.StatusBadRequest, protocol.ErrInvalidRequest, "path is required")
		return
	}

	ocPath := config.ExpandHome(req.Path)

	// 1. Read openclaw.json
	configData, err := os.ReadFile(filepath.Join(ocPath, "openclaw.json"))
	if err != nil {
		writeError(w, http.StatusBadRequest, protocol.ErrInvalidRequest, "cannot read openclaw.json: "+err.Error())
		return
	}
	cfg, err := openclaw.ParseConfig(configData)
	if err != nil {
		writeError(w, http.StatusBadRequest, protocol.ErrInvalidRequest, "cannot parse openclaw.json: "+err.Error())
		return
	}

	// 1b. Merge Claude CLI standard .mcp.json (optional)
	if mcpData, err := os.ReadFile(filepath.Join(ocPath, ".mcp.json")); err == nil {
		if mErr := openclaw.MergeMCPJSON(cfg, mcpData); mErr != nil {
			slog.Warn("openclaw.scan: .mcp.json parse failed", "error", mErr)
		}
	}

	// 2. Read cron/jobs.json (optional)
	cronData, _ := os.ReadFile(filepath.Join(ocPath, "cron", "jobs.json"))

	// 3. Scan each agent workspace
	resp := openClawScanResponse{
		Agents:     []openClawAgentPreview{},
		Channels:   []openClawChannelPreview{},
		MCPServers: []openClawMCPPreview{},
		EnvVars:    []openClawEnvPreview{},
		Warnings:   []string{},
	}

	for _, agent := range cfg.Agents {
		wsPath := resolveOpenClawWorkspace(ocPath, agent.ID)
		preview := openClawAgentPreview{
			ID:            agent.ID,
			WorkspacePath: wsPath,
		}

		ws, err := openclaw.ScanWorkspace(wsPath)
		if err != nil {
			slog.Warn("openclaw.scan: workspace scan failed", "agent_id", agent.ID, "path", wsPath, "error", err)
			resp.Warnings = append(resp.Warnings, fmt.Sprintf("agent %q: workspace scan failed: %v", agent.ID, err))
			resp.Agents = append(resp.Agents, preview)
			continue
		}

		// Track workspace-local skill count before scanning shared dirs
		wsSkillCount := len(ws.Skills)

		// Scan shared skill directories from openclaw.json skills.load.extraDirs
		for _, extraDir := range cfg.SkillExtraDirs {
			expandedDir := config.ExpandHome(extraDir)
			if _, err := os.Stat(expandedDir); err == nil {
				_ = openclaw.ScanSkillsDir(expandedDir, ws)
			}
		}

		// Auto-detect shared skill directories under ocPath (1-depth).
		// Skips the agent's own workspace (already scanned).
		if entries, err := os.ReadDir(ocPath); err == nil {
			for _, e := range entries {
				if !e.IsDir() {
					continue
				}
				dirPath := filepath.Join(ocPath, e.Name())
				if dirPath == wsPath {
					continue
				}
				// Skip other known workspace patterns to avoid double-counting
				if strings.HasPrefix(e.Name(), "workspace-") || e.Name() == "workspace" || e.Name() == "agents" {
					continue
				}
				candidate := filepath.Join(dirPath, "skills")
				if _, err := os.Stat(candidate); err == nil {
					_ = openclaw.ScanSkillsDir(candidate, ws)
				}
			}
		}

		preview.BootstrapFiles = len(ws.BootstrapFiles)
		for _, bf := range ws.BootstrapFiles {
			preview.BootstrapFileNames = append(preview.BootstrapFileNames, bf.Name)
		}
		preview.MemoryDocs = len(ws.MemoryDocs)
		preview.Skills = len(ws.Skills)
		for i, sk := range ws.Skills {
			source := "shared"
			if i < wsSkillCount {
				source = "workspace"
			}
			preview.SkillList = append(preview.SkillList, openClawSkillPreview{
				Slug:        sk.Slug,
				Name:        sk.Name,
				Description: sk.Description,
				Source:      source,
			})
		}
		preview.HasEnv = len(ws.EnvVars) > 0
		for _, w := range ws.Warnings {
			resp.Warnings = append(resp.Warnings, fmt.Sprintf("[%s] %s", agent.ID, w))
		}
		for _, ld := range ws.LargeDirs {
			resp.LargeDirs = append(resp.LargeDirs, openClawLargeDirInfo{
				AgentID:   agent.ID,
				Name:      ld.Name,
				Path:      ld.Path,
				SizeHuman: ld.SizeHuman,
				SizeBytes: ld.SizeBytes,
			})
		}

		// Count cron jobs for this agent
		if len(cronData) > 0 {
			crons, err := openclaw.ParseCronJobs(cronData, agent.ID)
			if err != nil {
				slog.Warn("openclaw.scan: cron parse failed", "agent_id", agent.ID, "error", err)
			} else {
				preview.CronJobs = len(crons)
				for _, c := range crons {
					preview.CronJobNames = append(preview.CronJobNames, c.Name)
				}
			}
		}

		// 4. Categorize env vars
		if len(ws.EnvVars) > 0 {
			cats := openclaw.CategorizeEnvVars(ws.EnvVars)
			for _, m := range cats.GoClawMapped {
				resp.EnvVars = append(resp.EnvVars, openClawEnvPreview{
					Key:       m.SourceKey,
					SourceKey: m.SourceKey,
					TargetKey: m.TargetKey,
					Category:  "goclaw_mapped",
				})
			}
			for _, p := range cats.CronOnly {
				resp.EnvVars = append(resp.EnvVars, openClawEnvPreview{
					Key:       p.Key,
					SourceKey: p.Key,
					TargetKey: "",
					Category:  "cron_only",
				})
			}
			for _, p := range cats.Unknown {
				resp.EnvVars = append(resp.EnvVars, openClawEnvPreview{
					Key:       p.Key,
					SourceKey: p.Key,
					TargetKey: "",
					Category:  "unknown",
				})
			}
		}

		resp.Agents = append(resp.Agents, preview)
	}

	// Channels
	for _, ch := range cfg.Channels {
		hasCred := false
		name := ch.Type
		if ch.Type == "slack" {
			hasCred = ch.SlackBotToken != "" || ch.SlackAppToken != ""
			if ch.AgentID != "" {
				name = "slack-" + ch.AgentID
			}
		} else if ch.Type == "telegram" {
			hasCred = ch.TelegramToken != ""
		}
		resp.Channels = append(resp.Channels, openClawChannelPreview{
			Name:          name,
			Type:          ch.Type,
			AgentID:       ch.AgentID,
			HasCredential: hasCred,
		})
	}

	// MCP servers
	for _, mcp := range cfg.MCPServers {
		envKeys := make([]string, 0, len(mcp.Env)) // empty slice, never nil
		for k := range mcp.Env {
			envKeys = append(envKeys, k)
		}
		resp.MCPServers = append(resp.MCPServers, openClawMCPPreview{
			Name:      mcp.Name,
			Command:   mcp.Command,
			Transport: mcp.Transport,
			EnvKeys:   envKeys,
		})
	}

	// Slack socket mode warning
	slackCount := 0
	for _, ch := range cfg.Channels {
		if ch.Type == "slack" {
			slackCount++
		}
	}
	if slackCount > 1 {
		resp.Warnings = append(resp.Warnings, "Slack Socket Mode channels can only connect to one gateway; multiple Slack channels detected")
	}

	writeJSON(w, http.StatusOK, resp)
}

// handleOpenClawImport executes migration for selected agents.
// POST /v1/import/openclaw
func (h *AgentsHandler) handleOpenClawImport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := store.UserIDFromContext(ctx)
	if !h.canImport(userID) {
		writeError(w, http.StatusForbidden, protocol.ErrUnauthorized, "openclaw import requires system owner")
		return
	}

	var req openClawImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, protocol.ErrInvalidRequest, "invalid JSON body")
		return
	}
	if req.Path == "" || len(req.SelectedAgents) == 0 {
		writeError(w, http.StatusBadRequest, protocol.ErrInvalidRequest, "path and selected_agents are required")
		return
	}

	ocPath := config.ExpandHome(req.Path)

	// Read openclaw.json
	configData, err := os.ReadFile(filepath.Join(ocPath, "openclaw.json"))
	if err != nil {
		writeError(w, http.StatusBadRequest, protocol.ErrInvalidRequest, "cannot read openclaw.json: "+err.Error())
		return
	}
	cfg, err := openclaw.ParseConfig(configData)
	if err != nil {
		writeError(w, http.StatusBadRequest, protocol.ErrInvalidRequest, "cannot parse openclaw.json: "+err.Error())
		return
	}

	// Merge Claude CLI standard .mcp.json (optional)
	if mcpData, err := os.ReadFile(filepath.Join(ocPath, ".mcp.json")); err == nil {
		if mErr := openclaw.MergeMCPJSON(cfg, mcpData); mErr != nil {
			slog.Warn("openclaw.import: .mcp.json parse failed", "error", mErr)
		}
	}

	// Read cron/jobs.json (optional)
	cronData, _ := os.ReadFile(filepath.Join(ocPath, "cron", "jobs.json"))

	// Build selected set
	selectedSet := make(map[string]bool, len(req.SelectedAgents))
	for _, a := range req.SelectedAgents {
		selectedSet[a] = true
	}

	// Pick a default provider name from existing GoClaw providers.
	// Prefers claude_cli type, then falls back to any enabled provider.
	var defaultProvider string
	_ = h.db.QueryRowContext(ctx,
		`SELECT name FROM llm_providers WHERE enabled = true
		 ORDER BY CASE WHEN provider_type = 'claude_cli' THEN 1 ELSE 2 END,
		          created_at LIMIT 1`).Scan(&defaultProvider)

	var results []openClawImportResult

	for _, agent := range cfg.Agents {
		if !selectedSet[agent.ID] {
			continue
		}

		result := openClawImportResult{
			AgentKey:          agent.ID,
			ChannelsCreated:   []string{},
			MCPServersCreated: []string{},
		}

		// a. Scan workspace
		wsPath := resolveOpenClawWorkspace(ocPath, agent.ID)
		ws, err := openclaw.ScanWorkspace(wsPath)
		if err != nil {
			slog.Error("openclaw.import: workspace scan failed", "agent_id", agent.ID, "error", err)
			results = append(results, result)
			continue
		}

		// Scan shared skill dirs (extraDirs + auto-detect 1-depth under ocPath)
		for _, extraDir := range cfg.SkillExtraDirs {
			expandedDir := config.ExpandHome(extraDir)
			if _, err := os.Stat(expandedDir); err == nil {
				_ = openclaw.ScanSkillsDir(expandedDir, ws)
			}
		}
		if entries, err := os.ReadDir(ocPath); err == nil {
			for _, e := range entries {
				if !e.IsDir() {
					continue
				}
				dirPath := filepath.Join(ocPath, e.Name())
				if dirPath == wsPath {
					continue
				}
				if strings.HasPrefix(e.Name(), "workspace-") || e.Name() == "workspace" || e.Name() == "agents" {
					continue
				}
				candidate := filepath.Join(dirPath, "skills")
				if _, err := os.Stat(candidate); err == nil {
					_ = openclaw.ScanSkillsDir(candidate, ws)
				}
			}
		}

		// Apply per-agent selections if provided
		if sel, ok := req.AgentSelections[agent.ID]; ok {
			ws = applyAgentSelection(ws, sel)
		}

		// b. Parse cron jobs for this agent
		var cronJobs []pg.CronJobExport
		if len(cronData) > 0 {
			cronJobs, err = openclaw.ParseCronJobs(cronData, agent.ID)
			if err != nil {
				slog.Warn("openclaw.import: cron parse failed", "agent_id", agent.ID, "error", err)
			}
			// Filter cron jobs by selection
			if sel, ok := req.AgentSelections[agent.ID]; ok && sel.CronJobs != nil {
				cronJobs = filterCronJobs(cronJobs, sel.CronJobs)
			}
		}

		// c. Build import archive
		displayName := agent.ID
		// Default model alias (Claude CLI compatible); provider is a known GoClaw provider.
		arc := openclaw.BuildImportArchive(agent.ID, displayName, ws, cronJobs, &cfg.Defaults, "opus", defaultProvider)

		// d. Convert to internal importArchive format
		ia := convertOpenClawArchive(arc)

		// e. Call existing doImportNewAgent
		summary, importErr := h.doImportNewAgent(ctx, r, ia, nil)
		if importErr != nil {
			slog.Error("openclaw.import: doImportNewAgent failed", "agent_id", agent.ID, "error", importErr)
		}
		result.Summary = summary

		// Resolve the created agent ID for subsequent operations
		agentID := ""
		if summary != nil {
			agentID = summary.AgentID
		}

		// f. Import skills (direct DB)
		if agentID != "" {
			for _, skill := range ws.Skills {
				h.importOpenClawSkill(ctx, agentID, skill)
				result.SkillsImported++
			}
		}

		// g. Create channels for this agent using the resolved slack account + telegram.
		if agentID != "" {
			wantSlackAccount := resolveSlackAccount(agent, cfg.Channels)
			for _, ch := range cfg.Channels {
				if ch.Type == "slack" {
					// Only import the slack account that belongs to this agent.
					if wantSlackAccount == "" || ch.AccountName != wantSlackAccount {
						continue
					}
				}
				// telegram and legacy channels fall through.
				chName := h.createOpenClawChannel(ctx, agentID, ch, agent.ID)
				if chName != "" {
					result.ChannelsCreated = append(result.ChannelsCreated, chName)
				}
			}
		}

		// h. Create MCP servers
		if agentID != "" {
			for _, mcp := range cfg.MCPServers {
				mcpName := h.createOpenClawMCP(ctx, agentID, mcp, req.IncludeCredentials)
				if mcpName != "" {
					result.MCPServersCreated = append(result.MCPServersCreated, mcpName)
				}
			}
		}

		// i. Handle large directories (symlink or copy)
		if agentID != "" && len(ws.LargeDirs) > 0 {
			agentWS := config.ExpandHome(fmt.Sprintf("%s/%s", h.defaultWorkspace, agent.ID))
			mode := req.WorkspaceMode
			if mode == "" {
				mode = "symlink"
			}
			for _, ld := range ws.LargeDirs {
				target := filepath.Join(agentWS, ld.Name)
				if _, err := os.Lstat(target); err == nil {
					continue // already exists
				}
				if mode == "symlink" {
					if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
						slog.Warn("openclaw.import: mkdir for symlink failed", "path", target, "error", err)
						continue
					}
					if err := os.Symlink(ld.Path, target); err != nil {
						slog.Warn("openclaw.import: symlink failed", "src", ld.Path, "dst", target, "error", err)
					} else {
						slog.Info("openclaw.import: symlinked large dir", "src", ld.Path, "dst", target)
					}
				}
				// "copy" mode: skip for now — too large for synchronous HTTP.
				// Users should copy manually or use rsync for multi-GB directories.
			}
		}

		results = append(results, result)
	}

	writeJSON(w, http.StatusOK, openClawImportResponse{Results: results})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// resolveSlackAccount picks the slack account name bound to the given agent.
// Resolution order:
//  1. agent.channels.slack.account is explicitly set in openclaw.json
//  2. an account whose key matches the agent ID (bbojjak → "bbojjak")
//  3. agent.default == true → "default" account (if present)
//  4. otherwise empty (no slack channel is imported)
func resolveSlackAccount(agent openclaw.AgentEntry, channels []openclaw.ChannelConfig) string {
	accountSet := make(map[string]bool, len(channels))
	for _, ch := range channels {
		if ch.Type == "slack" && ch.AccountName != "" {
			accountSet[ch.AccountName] = true
		}
	}
	if agent.SlackAccount != "" && accountSet[agent.SlackAccount] {
		return agent.SlackAccount
	}
	if accountSet[agent.ID] {
		return agent.ID
	}
	if agent.IsDefault && accountSet["default"] {
		return "default"
	}
	return ""
}

// applyAgentSelection filters workspace scan results based on user selections.
// nil slices mean "include all".
func applyAgentSelection(ws *openclaw.WorkspaceScanResult, sel openClawAgentSelection) *openclaw.WorkspaceScanResult {
	filtered := *ws // shallow copy

	if sel.BootstrapFiles != nil {
		allowed := make(map[string]bool, len(sel.BootstrapFiles))
		for _, name := range sel.BootstrapFiles {
			allowed[name] = true
		}
		filtered.BootstrapFiles = nil
		for _, bf := range ws.BootstrapFiles {
			if allowed[bf.Name] {
				filtered.BootstrapFiles = append(filtered.BootstrapFiles, bf)
			}
		}
	}

	if sel.Skills != nil {
		allowed := make(map[string]bool, len(sel.Skills))
		for _, slug := range sel.Skills {
			allowed[slug] = true
		}
		filtered.Skills = nil
		for _, sk := range ws.Skills {
			if allowed[sk.Slug] {
				filtered.Skills = append(filtered.Skills, sk)
			}
		}
	}

	return &filtered
}

// filterCronJobs returns only cron jobs whose name is in the allowed list.
func filterCronJobs(jobs []pg.CronJobExport, allowed []string) []pg.CronJobExport {
	set := make(map[string]bool, len(allowed))
	for _, name := range allowed {
		set[name] = true
	}
	var filtered []pg.CronJobExport
	for _, j := range jobs {
		if set[j.Name] {
			filtered = append(filtered, j)
		}
	}
	return filtered
}

// convertOpenClawArchive converts an openclaw.ImportArchiveData into the internal
// importArchive format consumed by doImportNewAgent.
func convertOpenClawArchive(arc *openclaw.ImportArchiveData) *importArchive {
	ia := &importArchive{
		manifest: &ExportManifest{
			Version:  1,
			Format:   "openclaw-migration",
			AgentKey: arc.AgentKey,
			Sections: map[string]any{},
		},
		agentConfig:    arc.AgentConfig,
		workspaceFiles: arc.WorkspaceFiles,
	}
	for _, cf := range arc.ContextFiles {
		ia.contextFiles = append(ia.contextFiles, importContextFile{
			fileName: cf.FileName,
			content:  cf.Content,
		})
	}
	for _, md := range arc.MemoryGlobal {
		ia.memoryGlobal = append(ia.memoryGlobal, MemoryExport{
			Path:    md.Path,
			Content: md.Content,
			UserID:  md.UserID,
		})
	}
	ia.cronJobs = arc.CronJobs
	return ia
}

// resolveOpenClawWorkspace tries multiple workspace layouts and returns the
// first existing path, or falls back to the main workspace directory.
func resolveOpenClawWorkspace(ocPath, agentID string) string {
	// Try: ocPath/workspace-<agentID> (bbojjak pattern)
	candidate := filepath.Join(ocPath, "workspace-"+agentID)
	if info, err := os.Stat(candidate); err == nil && info.IsDir() {
		return candidate
	}
	// Try: ocPath/agents/<agentID> (friday pattern)
	candidate = filepath.Join(ocPath, "agents", agentID)
	if info, err := os.Stat(candidate); err == nil && info.IsDir() {
		return candidate
	}
	// Default: ocPath/workspace (main agent)
	return filepath.Join(ocPath, "workspace")
}

// importOpenClawSkill inserts a skill and grants it to the agent.
// The skill's source SKILL.md lives on disk at skill.FilePath; GoClaw reads it
// lazily via file_path. Content is sha256-hashed for change detection.
func (h *AgentsHandler) importOpenClawSkill(ctx context.Context, agentID string, skill openclaw.SkillEntry) {
	tid := importTenantID(ctx)

	fileSize := int64(len(skill.Content))
	hash := sha256.Sum256([]byte(skill.Content))
	fileHash := hex.EncodeToString(hash[:])

	// Minimal frontmatter from parsed name/description
	fmObj := map[string]string{}
	if skill.Name != "" {
		fmObj["name"] = skill.Name
	}
	if skill.Description != "" {
		fmObj["description"] = skill.Description
	}
	fmJSON, _ := json.Marshal(fmObj)

	displayName := skill.Name
	if displayName == "" {
		displayName = skill.Slug
	}

	var skillID string
	err := h.db.QueryRowContext(ctx,
		`INSERT INTO skills (name, slug, description, owner_id, visibility, version, status,
			frontmatter, file_path, file_size, file_hash, is_system, deps, enabled, tenant_id)
		 VALUES ($1, $2, $3, 'admin', 'private', 1, 'active',
			$4::jsonb, $5, $6, $7, false, '{}'::jsonb, true, $8)
		 ON CONFLICT (tenant_id, slug) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			frontmatter = EXCLUDED.frontmatter,
			file_path = EXCLUDED.file_path,
			file_size = EXCLUDED.file_size,
			file_hash = EXCLUDED.file_hash,
			updated_at = NOW()
		 RETURNING id`,
		displayName, skill.Slug, skill.Description, fmJSON,
		skill.FilePath, fileSize, fileHash, tid,
	).Scan(&skillID)
	if err != nil {
		slog.Warn("openclaw.import.skill", "slug", skill.Slug, "error", err)
		return
	}

	_, err = h.db.ExecContext(ctx,
		`INSERT INTO skill_agent_grants (skill_id, agent_id, pinned_version, granted_by, tenant_id)
		 VALUES ($1::uuid, $2::uuid, 1, 'openclaw-import', $3)
		 ON CONFLICT (skill_id, agent_id) DO NOTHING`,
		skillID, agentID, tid,
	)
	if err != nil {
		slog.Warn("openclaw.import.skill_grant", "slug", skill.Slug, "agent_id", agentID, "error", err)
	}
}

// createOpenClawChannel creates a channel instance for the agent (disabled for safety).
// Returns the channel name on success, empty string on failure.
func (h *AgentsHandler) createOpenClawChannel(ctx context.Context, agentID string, ch openclaw.ChannelConfig, sourceAgentID string) string {
	tid := importTenantID(ctx)

	var credentials json.RawMessage
	channelName := ch.Type

	switch ch.Type {
	case "slack":
		if ch.AgentID != "" {
			channelName = "slack-" + ch.AgentID
		} else {
			channelName = "slack-" + sourceAgentID
		}
		cred := map[string]string{}
		if ch.SlackBotToken != "" {
			cred["bot_token"] = ch.SlackBotToken
		}
		if ch.SlackAppToken != "" {
			cred["app_token"] = ch.SlackAppToken
		}
		credentials, _ = json.Marshal(cred)
	case "telegram":
		channelName = "telegram-" + sourceAgentID
		cred := map[string]string{}
		if ch.TelegramToken != "" {
			cred["token"] = ch.TelegramToken
		}
		credentials, _ = json.Marshal(cred)
	default:
		slog.Warn("openclaw.import.channel: unknown type", "type", ch.Type)
		return ""
	}

	// Slack defaults follow OpenClaw conventions:
	//  - require_mention: true   (force-on to break bot-to-bot loops; OpenClaw
	//                              relies on per-channel mention rules that
	//                              GoClaw does not model 1:1)
	//  - allow_bots: true        (OpenClaw enables this for delegation between
	//                              agents — combined with require_mention=true
	//                              the loop only triggers on explicit @mention)
	requireMention := ch.RequireMention
	allowBots := true
	if ch.Type == "slack" {
		requireMention = true
	}

	channelConfig, _ := json.Marshal(map[string]any{
		"require_mention": requireMention,
		"allow_bots":      allowBots,
		"group_policy":    ch.GroupPolicy,
		"dm_policy":       ch.DMPolicy,
		"allow_from":      ch.AllowFrom,
	})

	// Encrypt credentials the same way PGChannelInstanceStore.Create does.
	// Channel readers call crypto.Decrypt at runtime — plain bytes would fail.
	var credsBytes []byte
	encKey := os.Getenv("GOCLAW_ENCRYPTION_KEY")
	if len(credentials) > 0 && encKey != "" {
		enc, encErr := crypto.Encrypt(string(credentials), encKey)
		if encErr != nil {
			slog.Warn("openclaw.import.channel: encrypt failed", "name", channelName, "error", encErr)
			return ""
		}
		credsBytes = []byte(enc)
	} else {
		credsBytes = credentials
	}

	// Channels created as disabled for safety (Slack socket mode conflict).
	// Unique index is (tenant_id, name).
	_, err := h.db.ExecContext(ctx,
		`INSERT INTO channel_instances (name, display_name, channel_type, agent_id, credentials, config, enabled, created_by, tenant_id)
		 VALUES ($1, $2, $3, $4::uuid, $5, $6, false, 'openclaw-import', $7)
		 ON CONFLICT (tenant_id, name) DO UPDATE SET
			agent_id = EXCLUDED.agent_id,
			channel_type = EXCLUDED.channel_type,
			credentials = EXCLUDED.credentials,
			config = EXCLUDED.config,
			updated_at = NOW()`,
		channelName, channelName, ch.Type, agentID, credsBytes, channelConfig, tid,
	)
	if err != nil {
		slog.Warn("openclaw.import.channel", "name", channelName, "agent_id", agentID, "error", err)
		return ""
	}
	return channelName
}

// createOpenClawMCP inserts an MCP server and grants it to the agent.
// Returns the MCP server name on success, empty string on failure.
func (h *AgentsHandler) createOpenClawMCP(ctx context.Context, agentID string, mcp openclaw.MCPServerEntry, includeCredentials bool) string {
	tid := importTenantID(ctx)

	env := mcp.Env
	if !includeCredentials {
		env = make(map[string]string) // strip secrets
	}

	argsJSON, _ := json.Marshal(mcp.Args)
	envJSON, _ := json.Marshal(env)

	transport := mcp.Transport
	if transport == "" {
		transport = "stdio"
	}

	var serverID string
	err := h.db.QueryRowContext(ctx,
		`INSERT INTO mcp_servers (name, display_name, transport, command, args, env, enabled, created_by, tenant_id)
		 VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, true, 'openclaw-import', $7)
		 ON CONFLICT (tenant_id, name) DO UPDATE SET
			command = EXCLUDED.command,
			args = EXCLUDED.args,
			env = EXCLUDED.env,
			transport = EXCLUDED.transport,
			updated_at = NOW()
		 RETURNING id`,
		mcp.Name, mcp.Name, transport, mcp.Command, argsJSON, envJSON, tid,
	).Scan(&serverID)
	if err != nil {
		slog.Warn("openclaw.import.mcp_server", "name", mcp.Name, "error", err)
		return ""
	}

	_, err = h.db.ExecContext(ctx,
		`INSERT INTO mcp_agent_grants (server_id, agent_id, enabled, granted_by, tenant_id)
		 VALUES ($1::uuid, $2::uuid, true, 'openclaw-import', $3)
		 ON CONFLICT (server_id, agent_id) DO NOTHING`,
		serverID, agentID, tid,
	)
	if err != nil {
		slog.Warn("openclaw.import.mcp_grant", "name", mcp.Name, "agent_id", agentID, "error", err)
	}

	return mcp.Name
}
