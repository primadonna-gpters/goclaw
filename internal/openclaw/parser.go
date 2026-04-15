// Package openclaw provides a parser for OpenClaw's openclaw.json configuration file.
// This is used by the OpenClaw → GoClaw migration tool to read the source config.
package openclaw

import "encoding/json"

// OpenClawConfig is the top-level parsed representation of openclaw.json.
type OpenClawConfig struct {
	Agents      []AgentEntry
	Defaults    AgentDefaults
	Channels    []ChannelConfig
	MCPServers  []MCPServerEntry
	GatewayPort int
}

// AgentEntry represents a single agent defined in the "agents.list" array.
type AgentEntry struct {
	ID              string
	MentionPatterns []string
}

// AgentDefaults holds the values from "agents.defaults".
type AgentDefaults struct {
	Model          string
	CompactionMode string
	MaxConcurrent  int
	SubagentMax    int
	MemorySearch   bool
}

// ChannelConfig represents a single channel connection.
// Slack channels that are per-agent (from "accounts") carry the agent ID in AgentID.
// The default Slack channel has AgentID="".
type ChannelConfig struct {
	Type           string
	Enabled        bool
	AgentID        string
	SlackBotToken  string
	SlackAppToken  string
	TelegramToken  string
	RequireMention bool
	GroupPolicy    string
	DMPolicy       string
	AllowFrom      []string
}

// MCPServerEntry represents one MCP server from "mcp.servers".
type MCPServerEntry struct {
	Name      string
	Command   string
	Args      []string
	Env       map[string]string
	Transport string
}

// --- raw JSON shapes ----------------------------------------------------------

type rawConfig struct {
	Agents   rawAgents          `json:"agents"`
	Channels rawChannels        `json:"channels"`
	MCP      rawMCP             `json:"mcp"`
	Gateway  rawGateway         `json:"gateway"`
}

type rawAgents struct {
	Defaults rawDefaults  `json:"defaults"`
	List     []rawAgent   `json:"list"`
}

type rawDefaults struct {
	Model struct {
		Primary string `json:"primary"`
	} `json:"model"`
	Compaction struct {
		Mode string `json:"mode"`
	} `json:"compaction"`
	MaxConcurrent int `json:"maxConcurrent"`
	Subagents     struct {
		MaxConcurrent int `json:"maxConcurrent"`
	} `json:"subagents"`
	MemorySearch struct {
		Enabled bool `json:"enabled"`
	} `json:"memorySearch"`
}

type rawAgent struct {
	ID        string `json:"id"`
	GroupChat struct {
		MentionPatterns []string `json:"mentionPatterns"`
	} `json:"groupChat"`
}

type rawChannels struct {
	Slack    *rawSlack    `json:"slack"`
	Telegram *rawTelegram `json:"telegram"`
}

type rawSlack struct {
	Enabled        bool              `json:"enabled"`
	BotToken       string            `json:"botToken"`
	AppToken       string            `json:"appToken"`
	RequireMention bool              `json:"requireMention"`
	GroupPolicy    string            `json:"groupPolicy"`
	DMPolicy       string            `json:"dmPolicy"`
	AllowFrom      []string          `json:"allowFrom"`
	Accounts       map[string]rawSlackAccount `json:"accounts"`
}

type rawSlackAccount struct {
	BotToken string `json:"botToken"`
	AppToken string `json:"appToken"`
}

type rawTelegram struct {
	Token   string `json:"token"`
	Enabled bool   `json:"enabled"`
}

type rawMCP struct {
	Servers map[string]rawMCPServer `json:"servers"`
}

type rawMCPServer struct {
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env"`
	Transport string          `json:"transport"`
}

type rawGateway struct {
	Port int `json:"port"`
}

// ParseConfig parses raw bytes from an openclaw.json file into an OpenClawConfig.
// All fields are optional; an empty JSON object returns a zero-value config without error.
func ParseConfig(data []byte) (*OpenClawConfig, error) {
	var raw rawConfig
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}

	cfg := &OpenClawConfig{}

	// --- defaults ---
	cfg.Defaults = AgentDefaults{
		Model:          raw.Agents.Defaults.Model.Primary,
		CompactionMode: raw.Agents.Defaults.Compaction.Mode,
		MaxConcurrent:  raw.Agents.Defaults.MaxConcurrent,
		SubagentMax:    raw.Agents.Defaults.Subagents.MaxConcurrent,
		MemorySearch:   raw.Agents.Defaults.MemorySearch.Enabled,
	}

	// --- agents ---
	for _, a := range raw.Agents.List {
		cfg.Agents = append(cfg.Agents, AgentEntry{
			ID:              a.ID,
			MentionPatterns: a.GroupChat.MentionPatterns,
		})
	}

	// --- channels: slack ---
	if s := raw.Channels.Slack; s != nil {
		// default slack channel (no per-agent override)
		cfg.Channels = append(cfg.Channels, ChannelConfig{
			Type:           "slack",
			Enabled:        s.Enabled,
			AgentID:        "",
			SlackBotToken:  s.BotToken,
			SlackAppToken:  s.AppToken,
			RequireMention: s.RequireMention,
			GroupPolicy:    s.GroupPolicy,
			DMPolicy:       s.DMPolicy,
			AllowFrom:      s.AllowFrom,
		})

		// per-agent slack channels
		for agentID, acct := range s.Accounts {
			cfg.Channels = append(cfg.Channels, ChannelConfig{
				Type:           "slack",
				Enabled:        s.Enabled,
				AgentID:        agentID,
				SlackBotToken:  acct.BotToken,
				SlackAppToken:  acct.AppToken,
				RequireMention: s.RequireMention,
				GroupPolicy:    s.GroupPolicy,
				DMPolicy:       s.DMPolicy,
				AllowFrom:      s.AllowFrom,
			})
		}
	}

	// --- channels: telegram ---
	if tg := raw.Channels.Telegram; tg != nil {
		cfg.Channels = append(cfg.Channels, ChannelConfig{
			Type:          "telegram",
			Enabled:       tg.Enabled,
			TelegramToken: tg.Token,
		})
	}

	// --- MCP servers ---
	for name, srv := range raw.MCP.Servers {
		transport := srv.Transport
		if transport == "" {
			transport = "stdio"
		}
		cfg.MCPServers = append(cfg.MCPServers, MCPServerEntry{
			Name:      name,
			Command:   srv.Command,
			Args:      srv.Args,
			Env:       srv.Env,
			Transport: transport,
		})
	}

	// --- gateway ---
	cfg.GatewayPort = raw.Gateway.Port

	return cfg, nil
}
