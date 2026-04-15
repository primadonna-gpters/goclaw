package openclaw_test

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/nextlevelbuilder/goclaw/internal/openclaw"
)

func TestParseCronJobs_FilterByAgentID(t *testing.T) {
	data, err := os.ReadFile("testdata/minimal-cron-jobs.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	// bbojjak has 2 jobs (job-001 cron/announce, job-002 interval/heartbeat)
	jobs, err := openclaw.ParseCronJobs(data, "bbojjak")
	if err != nil {
		t.Fatalf("ParseCronJobs bbojjak: %v", err)
	}
	if got := len(jobs); got != 2 {
		t.Fatalf("bbojjak: want 2 jobs, got %d", got)
	}

	// friday has 1 job (job-003 at/once)
	fridayJobs, err := openclaw.ParseCronJobs(data, "friday")
	if err != nil {
		t.Fatalf("ParseCronJobs friday: %v", err)
	}
	if got := len(fridayJobs); got != 1 {
		t.Fatalf("friday: want 1 job, got %d", got)
	}

	// nonexistent agent gets 0
	noneJobs, err := openclaw.ParseCronJobs(data, "nobody")
	if err != nil {
		t.Fatalf("ParseCronJobs nobody: %v", err)
	}
	if got := len(noneJobs); got != 0 {
		t.Fatalf("nobody: want 0 jobs, got %d", got)
	}
}

func TestParseCronJobs_CronJob(t *testing.T) {
	data, err := os.ReadFile("testdata/minimal-cron-jobs.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	jobs, err := openclaw.ParseCronJobs(data, "bbojjak")
	if err != nil {
		t.Fatalf("ParseCronJobs: %v", err)
	}

	// job-001: cron with delivery/announce
	job := jobs[0]

	if job.ScheduleKind != "cron" {
		t.Errorf("ScheduleKind: want cron, got %q", job.ScheduleKind)
	}
	if job.CronExpression == nil || *job.CronExpression != "0 9 * * *" {
		t.Errorf("CronExpression: want '0 9 * * *', got %v", job.CronExpression)
	}
	if job.IntervalMS != nil {
		t.Errorf("IntervalMS: want nil, got %v", job.IntervalMS)
	}
	if job.RunAt != nil {
		t.Errorf("RunAt: want nil, got %v", job.RunAt)
	}
	if job.Timezone == nil || *job.Timezone != "Asia/Seoul" {
		t.Errorf("Timezone: want Asia/Seoul, got %v", job.Timezone)
	}

	// slug: "📅 Daily Briefing" → emoji stripped, lowercase → "daily-briefing"
	if job.Name != "daily-briefing" {
		t.Errorf("Name: want daily-briefing, got %q", job.Name)
	}

	// payload should have message + deliver=true + deliver_channel + deliver_to
	var p map[string]interface{}
	if err := json.Unmarshal(job.Payload, &p); err != nil {
		t.Fatalf("payload unmarshal: %v", err)
	}
	if msg, _ := p["message"].(string); msg != "Good morning! Please provide a daily briefing." {
		t.Errorf("payload.message: got %q", msg)
	}
	if deliver, _ := p["deliver"].(bool); !deliver {
		t.Error("payload.deliver: want true")
	}
	if ch, _ := p["deliver_channel"].(string); ch != "slack" {
		t.Errorf("payload.deliver_channel: want slack, got %q", ch)
	}
	if to, _ := p["deliver_to"].(string); to != "C01234ABCDE" {
		t.Errorf("payload.deliver_to: want C01234ABCDE, got %q", to)
	}
	// light_context should be absent (false)
	if _, ok := p["light_context"]; ok {
		t.Error("payload.light_context: should be absent when false")
	}
}

func TestParseCronJobs_IntervalJob(t *testing.T) {
	data, err := os.ReadFile("testdata/minimal-cron-jobs.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	jobs, err := openclaw.ParseCronJobs(data, "bbojjak")
	if err != nil {
		t.Fatalf("ParseCronJobs: %v", err)
	}

	// job-002: interval with heartbeat, Korean in name
	job := jobs[1]

	if job.ScheduleKind != "interval" {
		t.Errorf("ScheduleKind: want interval, got %q", job.ScheduleKind)
	}
	if job.IntervalMS == nil || *job.IntervalMS != 300000 {
		t.Errorf("IntervalMS: want 300000, got %v", job.IntervalMS)
	}
	if job.CronExpression != nil {
		t.Errorf("CronExpression: want nil for interval job, got %v", job.CronExpression)
	}
	// No timezone set
	if job.Timezone != nil {
		t.Errorf("Timezone: want nil for empty tz, got %v", job.Timezone)
	}

	// slug: "🔄 Health Check 상태확인" → emoji stripped, Korean stripped → "health-check"
	if job.Name != "health-check" {
		t.Errorf("Name: want health-check, got %q", job.Name)
	}

	var p map[string]interface{}
	if err := json.Unmarshal(job.Payload, &p); err != nil {
		t.Fatalf("payload unmarshal: %v", err)
	}
	if lc, _ := p["light_context"].(bool); !lc {
		t.Error("payload.light_context: want true")
	}
	if wh, _ := p["wake_heartbeat"].(bool); !wh {
		t.Error("payload.wake_heartbeat: want true")
	}
	// deliver_channel "last" → should be omitted
	if _, ok := p["deliver_channel"]; ok {
		t.Error("payload.deliver_channel: should be absent for 'last' channel")
	}
}

func TestParseCronJobs_AtJob(t *testing.T) {
	data, err := os.ReadFile("testdata/minimal-cron-jobs.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	jobs, err := openclaw.ParseCronJobs(data, "friday")
	if err != nil {
		t.Fatalf("ParseCronJobs: %v", err)
	}

	// job-003: one-time at job
	job := jobs[0]

	if job.ScheduleKind != "once" {
		t.Errorf("ScheduleKind: want once, got %q", job.ScheduleKind)
	}
	if job.RunAt == nil {
		t.Fatal("RunAt: want non-nil for 'at' job")
	}
	// atMs=1755000000000 → 2025-08-12T08:00:00Z (UTC)
	if !strings.Contains(*job.RunAt, "2025-08") {
		t.Errorf("RunAt: expected 2025-08 date, got %q", *job.RunAt)
	}
	if !job.DeleteAfterRun {
		t.Error("DeleteAfterRun: want true for once job")
	}

	// Name: "One Time Reminder" → "one-time-reminder"
	if job.Name != "one-time-reminder" {
		t.Errorf("Name: want one-time-reminder, got %q", job.Name)
	}
}

func TestParseCronJobs_InvalidJSON(t *testing.T) {
	_, err := openclaw.ParseCronJobs([]byte(`{not valid`), "bbojjak")
	if err == nil {
		t.Error("want error for invalid JSON, got nil")
	}
}

func TestSlugify(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"Daily Briefing", "daily-briefing"},
		{"📅 Daily Briefing", "daily-briefing"},
		{"🔄 Health Check 상태확인", "health-check"},
		{"Hello World!", "hello-world"},
		{"  spaces  ", "spaces"},
		{"UPPERCASE", "uppercase"},
		{"multiple---dashes", "multiple-dashes"},
		{"123 numeric 456", "123-numeric-456"},
		// emoji only → empty → caller should use fallback
		{"🎉🎊🎈", ""},
		// Korean only → empty → caller should use fallback
		{"안녕하세요", ""},
		// long name → truncated to 60
		{strings.Repeat("a", 70), strings.Repeat("a", 60)},
	}

	for _, tc := range cases {
		got := openclaw.Slugify(tc.input)
		if got != tc.want {
			t.Errorf("Slugify(%q): want %q, got %q", tc.input, tc.want, got)
		}
	}
}

func TestSlugify_ValidFormat(t *testing.T) {
	inputs := []string{
		"📅 Daily Briefing",
		"🔄 Health Check 상태확인",
		"One Time Reminder",
		"a!@#$%^&*()b",
	}

	validSlug := func(s string) bool {
		if s == "" {
			return true // empty is valid (caller adds fallback)
		}
		for _, r := range s {
			if !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-') {
				return false
			}
		}
		if strings.HasPrefix(s, "-") || strings.HasSuffix(s, "-") {
			return false
		}
		return true
	}

	for _, input := range inputs {
		got := openclaw.Slugify(input)
		if !validSlug(got) {
			t.Errorf("Slugify(%q) = %q: not a valid slug", input, got)
		}
		if len(got) > 60 {
			t.Errorf("Slugify(%q) = %q: exceeds 60 chars (%d)", input, got, len(got))
		}
	}
}
