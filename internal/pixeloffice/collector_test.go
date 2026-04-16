package pixeloffice

import (
	"sync"
	"testing"
	"time"

	"github.com/nextlevelbuilder/goclaw/internal/agent"
	"github.com/nextlevelbuilder/goclaw/pkg/protocol"
)

func newTestCollector() *Collector {
	return NewCollector()
}

func TestCollector_HandleEvent_RunStarted(t *testing.T) {
	c := newTestCollector()

	ev := agent.AgentEvent{
		Type:    protocol.AgentEventRunStarted,
		AgentID: "agent-1",
		RunID:   "run-1",
	}
	c.HandleEvent(ev)

	st, ok := c.AgentState("agent-1")
	if !ok {
		t.Fatal("expected agent state to exist after run.started")
	}
	if st.Status != StatusTyping {
		t.Errorf("expected status %q, got %q", StatusTyping, st.Status)
	}
	if st.SessionCount != 1 {
		t.Errorf("expected session count 1, got %d", st.SessionCount)
	}
	if st.LastActivity.IsZero() {
		t.Error("expected LastActivity to be set")
	}

	// Second concurrent run should increment session count.
	ev2 := agent.AgentEvent{
		Type:    protocol.AgentEventRunStarted,
		AgentID: "agent-1",
		RunID:   "run-2",
	}
	c.HandleEvent(ev2)

	st, _ = c.AgentState("agent-1")
	if st.SessionCount != 2 {
		t.Errorf("expected session count 2 after second run.started, got %d", st.SessionCount)
	}
}

func TestCollector_HandleEvent_RunCompleted(t *testing.T) {
	c := newTestCollector()

	// Start two runs.
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunStarted,
		AgentID: "agent-1",
		RunID:   "run-1",
	})
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunStarted,
		AgentID: "agent-1",
		RunID:   "run-2",
	})

	// Complete one — should still be typing (one run left).
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunCompleted,
		AgentID: "agent-1",
		RunID:   "run-1",
	})

	st, _ := c.AgentState("agent-1")
	if st.Status != StatusTyping {
		t.Errorf("expected status %q with one run remaining, got %q", StatusTyping, st.Status)
	}
	if st.SessionCount != 1 {
		t.Errorf("expected session count 1, got %d", st.SessionCount)
	}

	// Complete the last run — should go idle.
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunCompleted,
		AgentID: "agent-1",
		RunID:   "run-2",
	})

	st, _ = c.AgentState("agent-1")
	if st.Status != StatusIdle {
		t.Errorf("expected status %q when all runs done, got %q", StatusIdle, st.Status)
	}
	if st.SessionCount != 0 {
		t.Errorf("expected session count 0, got %d", st.SessionCount)
	}

	// Test run.failed also decrements.
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunStarted,
		AgentID: "agent-2",
		RunID:   "run-3",
	})
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunFailed,
		AgentID: "agent-2",
		RunID:   "run-3",
	})
	st, _ = c.AgentState("agent-2")
	if st.Status != StatusError {
		t.Errorf("expected status %q after run.failed, got %q", StatusError, st.Status)
	}
	if st.SessionCount != 0 {
		t.Errorf("expected session count 0, got %d", st.SessionCount)
	}

	// Test run.cancelled also decrements.
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunStarted,
		AgentID: "agent-3",
		RunID:   "run-4",
	})
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunCancelled,
		AgentID: "agent-3",
		RunID:   "run-4",
	})
	st, _ = c.AgentState("agent-3")
	if st.Status != StatusIdle {
		t.Errorf("expected status %q after run.cancelled, got %q", StatusIdle, st.Status)
	}
}

func TestCollector_HandleEvent_ToolCall(t *testing.T) {
	c := newTestCollector()

	// Start a run first.
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunStarted,
		AgentID: "agent-1",
		RunID:   "run-1",
	})

	// Tool call with name in payload.
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventToolCall,
		AgentID: "agent-1",
		RunID:   "run-1",
		Payload: map[string]any{"name": "bash"},
	})

	st, _ := c.AgentState("agent-1")
	if st.Status != StatusTool {
		t.Errorf("expected status %q, got %q", StatusTool, st.Status)
	}
	if st.Detail != "bash" {
		t.Errorf("expected detail %q, got %q", "bash", st.Detail)
	}

	// Tool result should go back to typing.
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventToolResult,
		AgentID: "agent-1",
		RunID:   "run-1",
	})

	st, _ = c.AgentState("agent-1")
	if st.Status != StatusTyping {
		t.Errorf("expected status %q after tool.result, got %q", StatusTyping, st.Status)
	}
	if st.Detail != "" {
		t.Errorf("expected empty detail after tool.result, got %q", st.Detail)
	}

	// Tool call with no name in payload.
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventToolCall,
		AgentID: "agent-1",
		RunID:   "run-1",
		Payload: map[string]any{},
	})
	st, _ = c.AgentState("agent-1")
	if st.Status != StatusTool {
		t.Errorf("expected status %q, got %q", StatusTool, st.Status)
	}
	if st.Detail != "" {
		t.Errorf("expected empty detail when no tool name, got %q", st.Detail)
	}
}

func TestCollector_Snapshot(t *testing.T) {
	c := newTestCollector()

	// Empty snapshot.
	snap := c.Snapshot()
	if len(snap) != 0 {
		t.Errorf("expected empty snapshot, got %d entries", len(snap))
	}

	// Add some agents.
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunStarted,
		AgentID: "agent-1",
		RunID:   "run-1",
	})
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunStarted,
		AgentID: "agent-2",
		RunID:   "run-2",
	})

	snap = c.Snapshot()
	if len(snap) != 2 {
		t.Errorf("expected 2 agents in snapshot, got %d", len(snap))
	}

	// Verify snapshot is a copy (mutating it doesn't affect collector).
	snap["agent-1"] = AgentState{Status: "mutated"}
	st, _ := c.AgentState("agent-1")
	if st.Status == "mutated" {
		t.Error("snapshot mutation should not affect collector state")
	}
}

func TestCollector_Broadcast(t *testing.T) {
	c := newTestCollector()

	var mu sync.Mutex
	var received []PixelEvent

	id := c.Subscribe(func(ev PixelEvent) {
		mu.Lock()
		defer mu.Unlock()
		received = append(received, ev)
	})

	// Trigger an event.
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunStarted,
		AgentID: "agent-1",
		RunID:   "run-1",
	})

	// Give broadcast a moment (it's synchronous in our impl, but be safe).
	time.Sleep(10 * time.Millisecond)

	mu.Lock()
	if len(received) == 0 {
		t.Fatal("expected at least one broadcast event")
	}
	ev := received[0]
	mu.Unlock()

	if ev.AgentID != "agent-1" {
		t.Errorf("expected AgentID %q, got %q", "agent-1", ev.AgentID)
	}
	if ev.Status != StatusTyping {
		t.Errorf("expected status %q, got %q", StatusTyping, ev.Status)
	}
	if ev.Type != protocol.AgentEventRunStarted {
		t.Errorf("expected type %q, got %q", protocol.AgentEventRunStarted, ev.Type)
	}

	// Unsubscribe and verify no more events.
	c.Unsubscribe(id)

	mu.Lock()
	countBefore := len(received)
	mu.Unlock()

	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunCompleted,
		AgentID: "agent-1",
		RunID:   "run-1",
	})

	time.Sleep(10 * time.Millisecond)

	mu.Lock()
	countAfter := len(received)
	mu.Unlock()

	if countAfter != countBefore {
		t.Errorf("expected no events after unsubscribe, got %d more", countAfter-countBefore)
	}
}

func TestCollector_HandleCronEvent(t *testing.T) {
	c := newTestCollector()

	c.HandleCronEvent("agent-1", "daily-backup")

	st, ok := c.AgentState("agent-1")
	if !ok {
		t.Fatal("expected agent state to exist after cron event")
	}
	if st.Status != StatusCron {
		t.Errorf("expected status %q, got %q", StatusCron, st.Status)
	}
	if st.Detail != "daily-backup" {
		t.Errorf("expected detail %q, got %q", "daily-backup", st.Detail)
	}
}

func TestCollector_ConcurrentAccess(t *testing.T) {
	c := newTestCollector()

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			c.HandleEvent(agent.AgentEvent{
				Type:    protocol.AgentEventRunStarted,
				AgentID: "agent-1",
				RunID:   "run-" + string(rune('a'+n%26)),
			})
			c.Snapshot()
			c.AgentState("agent-1")
		}(i)
	}
	wg.Wait()

	// Should not panic or race — just verify state exists.
	st, ok := c.AgentState("agent-1")
	if !ok {
		t.Fatal("expected agent state to exist after concurrent access")
	}
	if st.SessionCount == 0 {
		t.Error("expected non-zero session count after concurrent starts")
	}
}

func TestCollector_SessionCountNeverNegative(t *testing.T) {
	c := newTestCollector()

	// Complete without start — should not go negative.
	c.HandleEvent(agent.AgentEvent{
		Type:    protocol.AgentEventRunCompleted,
		AgentID: "agent-1",
		RunID:   "run-1",
	})

	st, ok := c.AgentState("agent-1")
	if !ok {
		t.Fatal("expected agent state to exist")
	}
	if st.SessionCount < 0 {
		t.Errorf("session count should never be negative, got %d", st.SessionCount)
	}
}
