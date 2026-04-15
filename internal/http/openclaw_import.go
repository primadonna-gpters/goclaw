package http

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"github.com/nextlevelbuilder/goclaw/internal/config"
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
	Agents     []openClawAgentPreview `json:"agents"`
	Channels   []openClawChannelPreview `json:"channels"`
	MCPServers []openClawMCPPreview   `json:"mcp_servers"`
	EnvVars    []openClawEnvPreview   `json:"env_vars"`
	Warnings   []string               `json:"warnings"`
}

type openClawAgentPreview struct {
	ID             string `json:"id"`
	WorkspacePath  string `json:"workspace_path"`
	BootstrapFiles int    `json:"bootstrap_files"`
	MemoryDocs     int    `json:"memory_docs"`
	Skills         int    `json:"skills"`
	CronJobs       int    `json:"cron_jobs"`
	HasEnv         bool   `json:"has_env"`
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
	Path               string   `json:"path"`
	SelectedAgents     []string `json:"selected_agents"`
	IncludeCredentials bool     `json:"include_credentials"`
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

		preview.BootstrapFiles = len(ws.BootstrapFiles)
		preview.MemoryDocs = len(ws.MemoryDocs)
		preview.Skills = len(ws.Skills)
		preview.HasEnv = len(ws.EnvVars) > 0
		resp.Warnings = append(resp.Warnings, ws.Warnings...)

		// Count cron jobs for this agent
		if len(cronData) > 0 {
			crons, err := openclaw.ParseCronJobs(cronData, agent.ID)
			if err != nil {
				slog.Warn("openclaw.scan: cron parse failed", "agent_id", agent.ID, "error", err)
			} else {
				preview.CronJobs = len(crons)
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
		var envKeys []string
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

	// Read cron/jobs.json (optional)
	cronData, _ := os.ReadFile(filepath.Join(ocPath, "cron", "jobs.json"))

	// Build selected set
	selectedSet := make(map[string]bool, len(req.SelectedAgents))
	for _, a := range req.SelectedAgents {
		selectedSet[a] = true
	}

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

		// b. Parse cron jobs for this agent
		var cronJobs []pg.CronJobExport
		if len(cronData) > 0 {
			cronJobs, err = openclaw.ParseCronJobs(cronData, agent.ID)
			if err != nil {
				slog.Warn("openclaw.import: cron parse failed", "agent_id", agent.ID, "error", err)
			}
		}

		// c. Build import archive
		displayName := agent.ID // use agent ID as display name; can be updated later
		arc := openclaw.BuildImportArchive(agent.ID, displayName, ws, cronJobs, &cfg.Defaults)

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

		// g. Create channels for this agent
		if agentID != "" {
			for _, ch := range cfg.Channels {
				// Default channels (no agent ID) go to all agents; per-agent channels match
				if ch.AgentID != "" && ch.AgentID != agent.ID {
					continue
				}
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

		results = append(results, result)
	}

	writeJSON(w, http.StatusOK, openClawImportResponse{Results: results})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
func (h *AgentsHandler) importOpenClawSkill(ctx context.Context, agentID string, skill openclaw.SkillEntry) {
	tid := importTenantID(ctx)

	_, err := h.db.ExecContext(ctx,
		`INSERT INTO skills (slug, name, description, content, tenant_id)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (slug, tenant_id) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			content = EXCLUDED.content,
			updated_at = NOW()`,
		skill.Slug, skill.Name, skill.Description, skill.Content, tid,
	)
	if err != nil {
		slog.Warn("openclaw.import.skill", "slug", skill.Slug, "error", err)
		return
	}

	_, err = h.db.ExecContext(ctx,
		`INSERT INTO skill_agent_grants (skill_slug, agent_id, tenant_id)
		 VALUES ($1, $2::uuid, $3)
		 ON CONFLICT DO NOTHING`,
		skill.Slug, agentID, tid,
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

	channelConfig, _ := json.Marshal(map[string]any{
		"require_mention": ch.RequireMention,
		"group_policy":    ch.GroupPolicy,
		"dm_policy":       ch.DMPolicy,
		"allow_from":      ch.AllowFrom,
	})

	// Channels created as disabled for safety (Slack socket mode conflict)
	_, err := h.db.ExecContext(ctx,
		`INSERT INTO channel_instances (agent_id, channel_type, name, enabled, credentials, config, tenant_id)
		 VALUES ($1::uuid, $2, $3, false, $4, $5, $6)
		 ON CONFLICT (agent_id, name, tenant_id) DO UPDATE SET
			credentials = EXCLUDED.credentials,
			config = EXCLUDED.config,
			updated_at = NOW()`,
		agentID, ch.Type, channelName, credentials, channelConfig, tid,
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

	_, err := h.db.ExecContext(ctx,
		`INSERT INTO mcp_servers (name, command, args, env, transport, tenant_id)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (name, tenant_id) DO UPDATE SET
			command = EXCLUDED.command,
			args = EXCLUDED.args,
			env = EXCLUDED.env,
			transport = EXCLUDED.transport,
			updated_at = NOW()`,
		mcp.Name, mcp.Command, argsJSON, envJSON, mcp.Transport, tid,
	)
	if err != nil {
		slog.Warn("openclaw.import.mcp_server", "name", mcp.Name, "error", err)
		return ""
	}

	_, err = h.db.ExecContext(ctx,
		`INSERT INTO mcp_agent_grants (mcp_server_name, agent_id, tenant_id)
		 VALUES ($1, $2::uuid, $3)
		 ON CONFLICT DO NOTHING`,
		mcp.Name, agentID, tid,
	)
	if err != nil {
		slog.Warn("openclaw.import.mcp_grant", "name", mcp.Name, "agent_id", agentID, "error", err)
	}

	return mcp.Name
}
