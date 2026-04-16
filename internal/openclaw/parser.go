// Package openclaw provides a parser for OpenClaw's openclaw.json configuration file.
// This is used by the OpenClaw → GoClaw migration tool to read the source config.
package openclaw

import "encoding/json"

// OpenClawConfig is the top-level parsed representation of openclaw.json.
type OpenClawConfig struct {
	Agents         []AgentEntry
	Defaults       AgentDefaults
	Channels       []ChannelConfig
	MCPServers     []MCPServerEntry
	SkillExtraDirs []string // skills.load.extraDirs — shared skill directories
	GatewayPort    int
}

// AgentEntry represents a single agent defined in the "agents.list" array.
type AgentEntry struct {
	ID              string
	Name            string
	MentionPatterns []string
	IsDefault       bool   // agent-level "default": true flag (implies default slack account)
	SlackAccount    string // explicit channel binding, when agent.channels.slack.account is set
	Disabled        bool   // agent-level "disabled": true flag
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
// For slack, each entry in "slack.accounts" becomes one ChannelConfig with its
// account name preserved in AccountName. AgentID is resolved later by the
// import handler using a matching rule (default/name/explicit binding).
type ChannelConfig struct {
	Type           string
	Enabled        bool
	AgentID        string // resolved agent binding (set by import handler, not parser)
	AccountName    string // slack account key ("default", "personal", "bbojjak", ...)
	DisplayName    string // human-readable name (from slack account.name or similar)
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
	Skills   rawSkills          `json:"skills"`
}

type rawSkills struct {
	Load struct {
		ExtraDirs []string `json:"extraDirs"`
	} `json:"load"`
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
	Name      string `json:"name"`
	Default   bool   `json:"default"`
	Disabled  bool   `json:"disabled"`
	GroupChat struct {
		MentionPatterns []string `json:"mentionPatterns"`
	} `json:"groupChat"`
	Channels struct {
		Slack struct {
			Account string `json:"account"`
		} `json:"slack"`
	} `json:"channels"`
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
	Name     string   `json:"name"`
	BotToken string   `json:"botToken"`
	AppToken string   `json:"appToken"`
	Enabled  *bool    `json:"enabled"` // optional; nil means inherit top-level
	GroupPolicy string `json:"groupPolicy"`
	DMPolicy    string `json:"dmPolicy"`
	AllowFrom   []string `json:"allowFrom"`
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
			Name:            a.Name,
			MentionPatterns: a.GroupChat.MentionPatterns,
			IsDefault:       a.Default,
			SlackAccount:    a.Channels.Slack.Account,
			Disabled:        a.Disabled,
		})
	}

	// --- channels: slack ---
	// OpenClaw stores per-account credentials under slack.accounts.<name>.
	// Top-level slack.botToken/appToken is rarely used (legacy). We surface
	// every account as its own ChannelConfig so the import handler can match
	// accounts to agents using default/name/explicit-binding rules.
	if s := raw.Channels.Slack; s != nil {
		// Legacy top-level slack credentials (only if actually present)
		if s.BotToken != "" {
			cfg.Channels = append(cfg.Channels, ChannelConfig{
				Type:           "slack",
				Enabled:        s.Enabled,
				AccountName:    "",
				SlackBotToken:  s.BotToken,
				SlackAppToken:  s.AppToken,
				RequireMention: s.RequireMention,
				GroupPolicy:    s.GroupPolicy,
				DMPolicy:       s.DMPolicy,
				AllowFrom:      s.AllowFrom,
			})
		}

		for accountName, acct := range s.Accounts {
			enabled := s.Enabled
			if acct.Enabled != nil {
				enabled = *acct.Enabled
			}
			groupPolicy := acct.GroupPolicy
			if groupPolicy == "" {
				groupPolicy = s.GroupPolicy
			}
			dmPolicy := acct.DMPolicy
			if dmPolicy == "" {
				dmPolicy = s.DMPolicy
			}
			allowFrom := acct.AllowFrom
			if len(allowFrom) == 0 {
				allowFrom = s.AllowFrom
			}
			cfg.Channels = append(cfg.Channels, ChannelConfig{
				Type:           "slack",
				Enabled:        enabled,
				AccountName:    accountName,
				DisplayName:    acct.Name,
				SlackBotToken:  acct.BotToken,
				SlackAppToken:  acct.AppToken,
				RequireMention: s.RequireMention,
				GroupPolicy:    groupPolicy,
				DMPolicy:       dmPolicy,
				AllowFrom:      allowFrom,
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

	// --- skills ---
	cfg.SkillExtraDirs = raw.Skills.Load.ExtraDirs

	return cfg, nil
}

// MergeMCPJSON parses a Claude CLI standard .mcp.json file and merges the
// discovered servers into the config (duplicates by name are skipped).
func MergeMCPJSON(cfg *OpenClawConfig, data []byte) error {
	if cfg == nil || len(data) == 0 {
		return nil
	}
	var parsed struct {
		MCPServers map[string]struct {
			Command   string            `json:"command"`
			Args      []string          `json:"args"`
			Env       map[string]string `json:"env"`
			Transport string            `json:"transport"`
			URL       string            `json:"url"`
		} `json:"mcpServers"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		return err
	}
	existing := make(map[string]bool, len(cfg.MCPServers))
	for _, s := range cfg.MCPServers {
		existing[s.Name] = true
	}
	for name, srv := range parsed.MCPServers {
		if existing[name] {
			continue
		}
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
	return nil
}
