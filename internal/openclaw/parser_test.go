package openclaw_test

import (
	"os"
	"testing"

	"github.com/nextlevelbuilder/goclaw/internal/openclaw"
)

func TestParseConfig_MinimalFixture(t *testing.T) {
	data, err := os.ReadFile("testdata/minimal-openclaw.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	cfg, err := openclaw.ParseConfig(data)
	if err != nil {
		t.Fatalf("ParseConfig: %v", err)
	}

	// agents
	if got := len(cfg.Agents); got != 2 {
		t.Errorf("Agents: want 2, got %d", got)
	}
	if cfg.Agents[0].ID != "bbojjak" {
		t.Errorf("Agents[0].ID: want bbojjak, got %q", cfg.Agents[0].ID)
	}
	if len(cfg.Agents[0].MentionPatterns) != 2 {
		t.Errorf("Agents[0].MentionPatterns: want 2, got %d", len(cfg.Agents[0].MentionPatterns))
	}

	// defaults
	if cfg.Defaults.Model != "anthropic/claude-opus-4-6" {
		t.Errorf("Defaults.Model: want anthropic/claude-opus-4-6, got %q", cfg.Defaults.Model)
	}
	if cfg.Defaults.CompactionMode != "safeguard" {
		t.Errorf("Defaults.CompactionMode: want safeguard, got %q", cfg.Defaults.CompactionMode)
	}
	if cfg.Defaults.MaxConcurrent != 4 {
		t.Errorf("Defaults.MaxConcurrent: want 4, got %d", cfg.Defaults.MaxConcurrent)
	}
	if cfg.Defaults.SubagentMax != 8 {
		t.Errorf("Defaults.SubagentMax: want 8, got %d", cfg.Defaults.SubagentMax)
	}
	if !cfg.Defaults.MemorySearch {
		t.Error("Defaults.MemorySearch: want true, got false")
	}

	// channels: default slack + per-agent slack (bbojjak) + telegram = 3
	if got := len(cfg.Channels); got != 3 {
		t.Errorf("Channels: want 3, got %d", got)
	}

	// verify one slack channel has AgentID="" (default)
	var defaultSlack, agentSlack, telegram *openclaw.ChannelConfig
	for i := range cfg.Channels {
		ch := &cfg.Channels[i]
		switch {
		case ch.Type == "slack" && ch.AgentID == "":
			defaultSlack = ch
		case ch.Type == "slack" && ch.AgentID == "bbojjak":
			agentSlack = ch
		case ch.Type == "telegram":
			telegram = ch
		}
	}
	if defaultSlack == nil {
		t.Error("expected default slack channel (AgentID='')")
	} else {
		if !defaultSlack.Enabled {
			t.Error("default slack: want enabled=true")
		}
		if defaultSlack.SlackBotToken != "xoxb-default-token" {
			t.Errorf("default slack BotToken: got %q", defaultSlack.SlackBotToken)
		}
		if defaultSlack.GroupPolicy != "open" {
			t.Errorf("default slack GroupPolicy: got %q", defaultSlack.GroupPolicy)
		}
		if len(defaultSlack.AllowFrom) != 1 {
			t.Errorf("default slack AllowFrom: want 1, got %d", len(defaultSlack.AllowFrom))
		}
	}
	if agentSlack == nil {
		t.Error("expected per-agent slack channel (AgentID='bbojjak')")
	} else {
		if agentSlack.SlackBotToken != "xoxb-bbojjak-token" {
			t.Errorf("bbojjak slack BotToken: got %q", agentSlack.SlackBotToken)
		}
	}
	if telegram == nil {
		t.Error("expected telegram channel")
	} else {
		if !telegram.Enabled {
			t.Error("telegram: want enabled=true")
		}
		if telegram.TelegramToken != "8539012345:AAFakeTokenForTesting" {
			t.Errorf("telegram token: got %q", telegram.TelegramToken)
		}
	}

	// MCP servers
	if got := len(cfg.MCPServers); got != 2 {
		t.Errorf("MCPServers: want 2, got %d", got)
	}
	for _, srv := range cfg.MCPServers {
		if srv.Transport != "stdio" {
			t.Errorf("MCPServer %q transport: want stdio, got %q", srv.Name, srv.Transport)
		}
	}

	// gateway port
	if cfg.GatewayPort != 18789 {
		t.Errorf("GatewayPort: want 18789, got %d", cfg.GatewayPort)
	}
}

func TestParseConfig_EmptyConfig(t *testing.T) {
	cfg, err := openclaw.ParseConfig([]byte(`{}`))
	if err != nil {
		t.Fatalf("ParseConfig empty: %v", err)
	}
	if cfg == nil {
		t.Fatal("want non-nil config")
	}
	if len(cfg.Agents) != 0 {
		t.Errorf("Agents: want 0, got %d", len(cfg.Agents))
	}
	if len(cfg.Channels) != 0 {
		t.Errorf("Channels: want 0, got %d", len(cfg.Channels))
	}
	if len(cfg.MCPServers) != 0 {
		t.Errorf("MCPServers: want 0, got %d", len(cfg.MCPServers))
	}
}

func TestParseConfig_InvalidJSON(t *testing.T) {
	_, err := openclaw.ParseConfig([]byte(`{not valid json`))
	if err == nil {
		t.Error("want error for invalid JSON, got nil")
	}
}
