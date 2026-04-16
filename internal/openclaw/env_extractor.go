package openclaw

// CategorizedEnv holds the result of categorizing OpenClaw workspace .env variables.
type CategorizedEnv struct {
	GoClawMapped []EnvMapping // Has GOCLAW_* equivalent → add to GoClaw .env
	CronOnly     []EnvPair    // Used by cron scripts only → keep in workspace .env
	Unknown      []EnvPair    // No known mapping
}

// EnvMapping represents an env var that maps directly to a GoClaw config key.
type EnvMapping struct {
	SourceKey string
	TargetKey string
	Value     string
}

// EnvPair is a simple key/value env pair with no GoClaw equivalent.
type EnvPair struct {
	Key   string
	Value string
}

// goclawEnvMapping maps OpenClaw env var keys to their GoClaw GOCLAW_* equivalents.
// Derived from real migration experience on the dahtmad server and internal/config/config_load.go.
var goclawEnvMapping = map[string]string{
	"ELEVENLABS_API_KEY": "GOCLAW_TTS_ELEVENLABS_API_KEY",
	"GEMINI_API_KEY":     "GOCLAW_GEMINI_API_KEY",
	"OPENAI_API_KEY":     "GOCLAW_OPENAI_API_KEY",
	"ANTHROPIC_API_KEY":  "GOCLAW_ANTHROPIC_API_KEY",
	"DEEPSEEK_API_KEY":   "GOCLAW_DEEPSEEK_API_KEY",
	"GROQ_API_KEY":       "GOCLAW_GROQ_API_KEY",
}

// cronOnlyKeys contains env vars used exclusively by cron script payloads
// via `source .env`. They have no GoClaw config equivalent.
var cronOnlyKeys = map[string]bool{
	"AIRTABLE_API_KEY":          true,
	"GPTERS_API_TOKEN":          true,
	"BETTERMODE_CLIENT_ID":      true,
	"BETTERMODE_CLIENT_SECRET":  true,
	"CHANNEL_TALK_ACCESS_KEY":   true,
	"CHANNEL_TALK_ACCESS_SECRET": true,
	"BITLY_API_TOKEN":           true,
	"BITLY_TOKEN":               true,
	"ZOOM_ACCOUNT_ID":           true,
	"ZOOM_CLIENT_ID":            true,
	"ZOOM_CLIENT_SECRET":        true,
	"HEDRA_API_KEY":             true,
	"KAKAOCLI_API_KEY":          true,
	"NOTION_API_TOKEN":          true,
	"SLACK_BOT_TOKEN_BBOJJAK":   true,
}

// CategorizeEnvVars classifies a flat map of env vars into three buckets:
// GoClaw-mapped, cron-only, and unknown.
func CategorizeEnvVars(vars map[string]string) *CategorizedEnv {
	result := &CategorizedEnv{
		GoClawMapped: []EnvMapping{},
		CronOnly:     []EnvPair{},
		Unknown:      []EnvPair{},
	}

	for key, value := range vars {
		if targetKey, ok := goclawEnvMapping[key]; ok {
			result.GoClawMapped = append(result.GoClawMapped, EnvMapping{
				SourceKey: key,
				TargetKey: targetKey,
				Value:     value,
			})
		} else if cronOnlyKeys[key] {
			result.CronOnly = append(result.CronOnly, EnvPair{Key: key, Value: value})
		} else {
			result.Unknown = append(result.Unknown, EnvPair{Key: key, Value: value})
		}
	}

	return result
}
