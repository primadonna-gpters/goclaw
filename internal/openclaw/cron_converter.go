package openclaw

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/nextlevelbuilder/goclaw/internal/store/pg"
)

// openclawCronFile represents the top-level structure of OpenClaw's cron/jobs.json.
type openclawCronFile struct {
	Version int              `json:"version"`
	Jobs    []openclawCronJob `json:"jobs"`
}

// openclawCronJob is one cron job entry in OpenClaw format.
type openclawCronJob struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	AgentID string `json:"agentId"`
	Enabled bool   `json:"enabled"`

	Schedule struct {
		Kind    string `json:"kind"`
		Expr    string `json:"expr"`
		EveryMs int64  `json:"everyMs"`
		AtMs    int64  `json:"atMs"`
		TZ      string `json:"tz"`
	} `json:"schedule"`

	Payload struct {
		Kind         string `json:"kind"`
		Message      string `json:"message"`
		LightContext bool   `json:"lightContext"`
	} `json:"payload"`

	Delivery struct {
		Mode    string `json:"mode"`
		Channel string `json:"channel"`
		To      string `json:"to"`
	} `json:"delivery"`

	WakeMode string `json:"wakeMode"`
}

// emojiRanges covers common Unicode emoji blocks for removal.
var emojiRanges = regexp.MustCompile(
	`[\x{1F600}-\x{1F64F}` + // emoticons
		`\x{1F300}-\x{1F5FF}` + // misc symbols and pictographs
		`\x{1F680}-\x{1F6FF}` + // transport and map
		`\x{1F700}-\x{1F77F}` + // alchemical
		`\x{1F780}-\x{1F7FF}` + // geometric shapes extended
		`\x{1F800}-\x{1F8FF}` + // supplemental arrows-c
		`\x{1F900}-\x{1F9FF}` + // supplemental symbols and pictographs
		`\x{1FA00}-\x{1FA6F}` + // chess symbols
		`\x{1FA70}-\x{1FAFF}` + // symbols and pictographs extended-a
		`\x{2600}-\x{26FF}` + // misc symbols
		`\x{2700}-\x{27BF}` + // dingbats
		`\x{FE00}-\x{FE0F}` + // variation selectors
		`\x{1F1E0}-\x{1F1FF}` + // flags
		`]+`,
)

var nonAlphanumRe = regexp.MustCompile(`[^a-z0-9]+`)

// Slugify converts an arbitrary display name into a GoClaw-safe slug.
// Rules: strip emoji, strip non-ASCII (e.g. Korean), lowercase,
// replace runs of non-alphanumeric chars with "-", trim "-", max 60 chars.
// If the result is empty, falls back to "cron-" + first 8 chars of jobID.
func Slugify(name string) string {
	s := emojiRanges.ReplaceAllString(name, "")

	// Remove non-ASCII characters (Korean, Chinese, etc.)
	var ascii strings.Builder
	for _, r := range s {
		if r <= unicode.MaxASCII {
			ascii.WriteRune(r)
		}
	}
	s = ascii.String()

	s = strings.ToLower(s)
	s = nonAlphanumRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")

	if len(s) > 60 {
		// Trim to 60, then strip any trailing "-"
		s = strings.TrimRight(s[:60], "-")
	}

	return s
}

// slugifyWithFallback returns a slug, or "cron-<jobID[:8]>" if empty.
func slugifyWithFallback(name, jobID string) string {
	s := Slugify(name)
	if s == "" {
		id := jobID
		if len(id) > 8 {
			id = id[:8]
		}
		return "cron-" + id
	}
	return s
}

// cronPayload is used to build the JSON payload object incrementally.
type cronPayload struct {
	Message        string `json:"message,omitempty"`
	LightContext   bool   `json:"light_context,omitempty"`
	Deliver        bool   `json:"deliver,omitempty"`
	DeliverChannel string `json:"deliver_channel,omitempty"`
	DeliverTo      string `json:"deliver_to,omitempty"`
	WakeHeartbeat  bool   `json:"wake_heartbeat,omitempty"`
}

// ParseCronJobs parses OpenClaw's cron/jobs.json, filters to jobs whose
// agentId matches agentID, and converts them to GoClaw CronJobExport records.
// All imported jobs are created as disabled (safety requirement).
func ParseCronJobs(data []byte, agentID string) ([]pg.CronJobExport, error) {
	var file openclawCronFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("ParseCronJobs: unmarshal: %w", err)
	}

	var result []pg.CronJobExport

	for _, job := range file.Jobs {
		if job.AgentID != agentID {
			continue
		}

		export, err := convertCronJob(job)
		if err != nil {
			return nil, fmt.Errorf("ParseCronJobs: job %q: %w", job.ID, err)
		}
		result = append(result, export)
	}

	return result, nil
}

func convertCronJob(job openclawCronJob) (pg.CronJobExport, error) {
	export := pg.CronJobExport{
		Name:           slugifyWithFallback(job.Name, job.ID),
		DeleteAfterRun: false,
	}

	// Schedule kind mapping
	switch job.Schedule.Kind {
	case "cron":
		export.ScheduleKind = "cron"
		expr := job.Schedule.Expr
		export.CronExpression = &expr
	case "every":
		export.ScheduleKind = "interval"
		ms := job.Schedule.EveryMs
		export.IntervalMS = &ms
	case "at":
		export.ScheduleKind = "once"
		t := time.UnixMilli(job.Schedule.AtMs).UTC()
		runAt := t.Format(time.RFC3339)
		export.RunAt = &runAt
		export.DeleteAfterRun = true
	default:
		return pg.CronJobExport{}, fmt.Errorf("unknown schedule kind %q", job.Schedule.Kind)
	}

	// Timezone
	if job.Schedule.TZ != "" {
		tz := job.Schedule.TZ
		export.Timezone = &tz
	}

	// Build payload object
	p := cronPayload{}

	if job.Payload.Message != "" {
		p.Message = job.Payload.Message
	}
	if job.Payload.LightContext {
		p.LightContext = true
	}
	if job.Delivery.Mode == "announce" {
		p.Deliver = true
	}
	if job.Delivery.Channel != "" && job.Delivery.Channel != "last" {
		p.DeliverChannel = job.Delivery.Channel
	}
	if job.Delivery.To != "" {
		p.DeliverTo = job.Delivery.To
	}
	if job.WakeMode == "next-heartbeat" {
		p.WakeHeartbeat = true
	}

	payloadBytes, err := json.Marshal(p)
	if err != nil {
		return pg.CronJobExport{}, fmt.Errorf("marshal payload: %w", err)
	}
	export.Payload = json.RawMessage(payloadBytes)

	return export, nil
}
