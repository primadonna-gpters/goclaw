// Package pixeloffice provides a pixel-art office visualization layer.
// It translates agent lifecycle events into visual states (idle, typing, tool, etc.)
// and broadcasts updates to connected WebSocket clients.
package pixeloffice

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/nextlevelbuilder/goclaw/internal/agent"
	"github.com/nextlevelbuilder/goclaw/pkg/protocol"
)

// Status constants for pixel office agent visualization.
const (
	StatusIdle   = "idle"
	StatusTyping = "typing"
	StatusTool   = "tool"
	StatusCron   = "cron"
	StatusError  = "error"
)

// AgentState represents the visual state of a single agent in the pixel office.
type AgentState struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Status       string    `json:"status"`
	Sprite       string    `json:"sprite,omitempty"`
	Detail       string    `json:"detail,omitempty"`
	SessionCount int       `json:"sessionCount"`
	LastActivity time.Time `json:"lastActivity"`
}

// PixelEvent is a broadcast event sent to subscribed WS clients when agent
// state changes in the pixel office.
type PixelEvent struct {
	Type    string    `json:"type"`
	AgentID string    `json:"agentId"`
	Status  string    `json:"status"`
	Detail  string    `json:"detail,omitempty"`
	Message string    `json:"message,omitempty"`
	TS      time.Time `json:"ts"`
}

// SubscriberFunc is a callback invoked on each pixel event broadcast.
type SubscriberFunc func(PixelEvent)

type subscriber struct {
	id uint64
	fn SubscriberFunc
}

// Collector receives AgentEvents and maintains per-agent visual state.
// It is safe for concurrent use.
type Collector struct {
	mu     sync.RWMutex
	agents map[string]*AgentState

	subMu   sync.RWMutex
	subs    []subscriber
	nextSub atomic.Uint64
}

// NewCollector creates a new event collector.
func NewCollector() *Collector {
	return &Collector{
		agents: make(map[string]*AgentState),
	}
}

// SeedAgent registers a known agent with idle status so it appears in the office
// even before any events arrive. Skips if the agent already exists.
func (c *Collector) SeedAgent(id, displayName string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, exists := c.agents[id]; exists {
		return
	}
	c.agents[id] = &AgentState{
		ID:     id,
		Name:   displayName,
		Status: StatusIdle,
		Sprite: id,
	}
}

// HandleEvent processes an agent lifecycle event and updates the pixel office state.
func (c *Collector) HandleEvent(ev agent.AgentEvent) {
	c.mu.Lock()

	st := c.getOrCreateLocked(ev.AgentID)
	now := time.Now()
	st.LastActivity = now

	var pixelStatus string
	var detail string

	switch ev.Type {
	case protocol.AgentEventRunStarted:
		st.SessionCount++
		st.Status = StatusTyping
		st.Detail = ""
		pixelStatus = StatusTyping

	case protocol.AgentEventRunCompleted:
		st.SessionCount--
		if st.SessionCount <= 0 {
			st.SessionCount = 0
			st.Status = StatusIdle
		} else {
			st.Status = StatusTyping
		}
		st.Detail = ""
		pixelStatus = st.Status

	case protocol.AgentEventRunFailed:
		st.SessionCount--
		if st.SessionCount <= 0 {
			st.SessionCount = 0
		}
		st.Status = StatusError
		st.Detail = ""
		pixelStatus = StatusError

	case protocol.AgentEventRunCancelled:
		st.SessionCount--
		if st.SessionCount <= 0 {
			st.SessionCount = 0
			st.Status = StatusIdle
		} else {
			st.Status = StatusTyping
		}
		st.Detail = ""
		pixelStatus = st.Status

	case protocol.AgentEventToolCall:
		st.Status = StatusTool
		detail = extractToolName(ev.Payload)
		st.Detail = detail
		pixelStatus = StatusTool

	case protocol.AgentEventToolResult:
		// Back to typing if still in a run.
		if st.SessionCount > 0 {
			st.Status = StatusTyping
		} else {
			st.Status = StatusIdle
		}
		st.Detail = ""
		pixelStatus = st.Status

	default:
		// Unknown event type — update timestamp only.
		c.mu.Unlock()
		return
	}

	pev := PixelEvent{
		Type:    ev.Type,
		AgentID: ev.AgentID,
		Status:  pixelStatus,
		Detail:  detail,
		TS:      now,
	}

	c.mu.Unlock()

	c.broadcast(pev)
}

// HandleCronEvent records a cron-triggered activity for the given agent.
func (c *Collector) HandleCronEvent(agentID, cronName string) {
	c.mu.Lock()

	st := c.getOrCreateLocked(agentID)
	now := time.Now()
	st.Status = StatusCron
	st.Detail = cronName
	st.LastActivity = now

	pev := PixelEvent{
		Type:    "cron",
		AgentID: agentID,
		Status:  StatusCron,
		Detail:  cronName,
		TS:      now,
	}

	c.mu.Unlock()

	c.broadcast(pev)
}

// AgentState returns a copy of the state for a single agent.
// The boolean indicates whether the agent was found.
func (c *Collector) AgentState(agentID string) (AgentState, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	st, ok := c.agents[agentID]
	if !ok {
		return AgentState{}, false
	}
	return *st, true
}

// Snapshot returns a copy of all agent states, keyed by agent ID.
func (c *Collector) Snapshot() map[string]AgentState {
	c.mu.RLock()
	defer c.mu.RUnlock()

	out := make(map[string]AgentState, len(c.agents))
	for id, st := range c.agents {
		out[id] = *st
	}
	return out
}

// Subscribe registers a callback that will be invoked on every pixel event.
// Returns a subscriber ID that can be used to unsubscribe.
func (c *Collector) Subscribe(fn SubscriberFunc) uint64 {
	id := c.nextSub.Add(1)
	c.subMu.Lock()
	c.subs = append(c.subs, subscriber{id: id, fn: fn})
	c.subMu.Unlock()
	return id
}

// Unsubscribe removes a subscriber by its ID.
func (c *Collector) Unsubscribe(id uint64) {
	c.subMu.Lock()
	defer c.subMu.Unlock()

	for i, s := range c.subs {
		if s.id == id {
			c.subs = append(c.subs[:i], c.subs[i+1:]...)
			return
		}
	}
}

// getOrCreateLocked returns the existing agent state or creates a new one.
// Caller must hold c.mu write lock.
func (c *Collector) getOrCreateLocked(agentID string) *AgentState {
	st, ok := c.agents[agentID]
	if !ok {
		st = &AgentState{
			ID:     agentID,
			Status: StatusIdle,
		}
		c.agents[agentID] = st
	}
	return st
}

// broadcast sends a PixelEvent to all registered subscribers.
func (c *Collector) broadcast(ev PixelEvent) {
	c.subMu.RLock()
	subs := make([]subscriber, len(c.subs))
	copy(subs, c.subs)
	c.subMu.RUnlock()

	for _, s := range subs {
		s.fn(ev)
	}
}

// extractToolName attempts to get the tool name from the event payload.
func extractToolName(payload any) string {
	m, ok := payload.(map[string]any)
	if !ok {
		return ""
	}
	name, _ := m["name"].(string)
	return name
}
