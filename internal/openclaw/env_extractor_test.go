package openclaw

import (
	"testing"
)

func TestCategorizeEnvVars(t *testing.T) {
	input := map[string]string{
		// GoClaw-mapped
		"OPENAI_API_KEY":     "sk-openai-test",
		"ANTHROPIC_API_KEY":  "sk-ant-test",
		"GEMINI_API_KEY":     "gemini-test",
		"ELEVENLABS_API_KEY": "eleven-test",
		"DEEPSEEK_API_KEY":   "deepseek-test",
		"GROQ_API_KEY":       "groq-test",
		// Cron-only
		"AIRTABLE_API_KEY":   "airtable-test",
		"NOTION_API_TOKEN":   "notion-test",
		"ZOOM_CLIENT_ID":     "zoom-id",
		// Unknown
		"CUSTOM_INTERNAL_KEY": "custom-value",
		"MY_SECRET_TOKEN":     "my-secret",
	}

	result := CategorizeEnvVars(input)

	// Verify GoClaw-mapped count
	if len(result.GoClawMapped) != 6 {
		t.Errorf("expected 6 GoClawMapped entries, got %d", len(result.GoClawMapped))
	}

	// Verify cron-only count
	if len(result.CronOnly) != 3 {
		t.Errorf("expected 3 CronOnly entries, got %d", len(result.CronOnly))
	}

	// Verify unknown count
	if len(result.Unknown) != 2 {
		t.Errorf("expected 2 Unknown entries, got %d", len(result.Unknown))
	}

	// Verify a specific GoClaw mapping
	foundOpenAI := false
	for _, m := range result.GoClawMapped {
		if m.SourceKey == "OPENAI_API_KEY" {
			foundOpenAI = true
			if m.TargetKey != "GOCLAW_OPENAI_API_KEY" {
				t.Errorf("expected TargetKey GOCLAW_OPENAI_API_KEY, got %s", m.TargetKey)
			}
			if m.Value != "sk-openai-test" {
				t.Errorf("expected value sk-openai-test, got %s", m.Value)
			}
		}
	}
	if !foundOpenAI {
		t.Error("OPENAI_API_KEY not found in GoClawMapped")
	}

	// Verify ElevenLabs maps to TTS key
	foundEleven := false
	for _, m := range result.GoClawMapped {
		if m.SourceKey == "ELEVENLABS_API_KEY" {
			foundEleven = true
			if m.TargetKey != "GOCLAW_TTS_ELEVENLABS_API_KEY" {
				t.Errorf("expected TargetKey GOCLAW_TTS_ELEVENLABS_API_KEY, got %s", m.TargetKey)
			}
		}
	}
	if !foundEleven {
		t.Error("ELEVENLABS_API_KEY not found in GoClawMapped")
	}

	// Verify a cron-only key
	foundAirtable := false
	for _, p := range result.CronOnly {
		if p.Key == "AIRTABLE_API_KEY" {
			foundAirtable = true
			if p.Value != "airtable-test" {
				t.Errorf("expected value airtable-test, got %s", p.Value)
			}
		}
	}
	if !foundAirtable {
		t.Error("AIRTABLE_API_KEY not found in CronOnly")
	}

	// Verify an unknown key
	foundCustom := false
	for _, p := range result.Unknown {
		if p.Key == "CUSTOM_INTERNAL_KEY" {
			foundCustom = true
			if p.Value != "custom-value" {
				t.Errorf("expected value custom-value, got %s", p.Value)
			}
		}
	}
	if !foundCustom {
		t.Error("CUSTOM_INTERNAL_KEY not found in Unknown")
	}
}

func TestCategorizeEnvVars_Empty(t *testing.T) {
	result := CategorizeEnvVars(map[string]string{})

	if len(result.GoClawMapped) != 0 {
		t.Errorf("expected 0 GoClawMapped, got %d", len(result.GoClawMapped))
	}
	if len(result.CronOnly) != 0 {
		t.Errorf("expected 0 CronOnly, got %d", len(result.CronOnly))
	}
	if len(result.Unknown) != 0 {
		t.Errorf("expected 0 Unknown, got %d", len(result.Unknown))
	}
}

func TestCategorizeEnvVars_AllGoClaw(t *testing.T) {
	input := map[string]string{
		"ELEVENLABS_API_KEY": "eleven-val",
		"GEMINI_API_KEY":     "gemini-val",
		"OPENAI_API_KEY":     "openai-val",
		"ANTHROPIC_API_KEY":  "anthropic-val",
		"DEEPSEEK_API_KEY":   "deepseek-val",
		"GROQ_API_KEY":       "groq-val",
	}

	result := CategorizeEnvVars(input)

	if len(result.GoClawMapped) != 6 {
		t.Errorf("expected 6 GoClawMapped entries, got %d", len(result.GoClawMapped))
	}
	if len(result.CronOnly) != 0 {
		t.Errorf("expected 0 CronOnly entries, got %d", len(result.CronOnly))
	}
	if len(result.Unknown) != 0 {
		t.Errorf("expected 0 Unknown entries, got %d", len(result.Unknown))
	}

	// Verify all 6 expected target keys are present
	expectedMappings := map[string]string{
		"ELEVENLABS_API_KEY": "GOCLAW_TTS_ELEVENLABS_API_KEY",
		"GEMINI_API_KEY":     "GOCLAW_GEMINI_API_KEY",
		"OPENAI_API_KEY":     "GOCLAW_OPENAI_API_KEY",
		"ANTHROPIC_API_KEY":  "GOCLAW_ANTHROPIC_API_KEY",
		"DEEPSEEK_API_KEY":   "GOCLAW_DEEPSEEK_API_KEY",
		"GROQ_API_KEY":       "GOCLAW_GROQ_API_KEY",
	}

	for _, m := range result.GoClawMapped {
		expectedTarget, ok := expectedMappings[m.SourceKey]
		if !ok {
			t.Errorf("unexpected SourceKey: %s", m.SourceKey)
			continue
		}
		if m.TargetKey != expectedTarget {
			t.Errorf("SourceKey %s: expected TargetKey %s, got %s", m.SourceKey, expectedTarget, m.TargetKey)
		}
	}
}
