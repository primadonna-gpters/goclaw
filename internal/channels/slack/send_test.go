package slack

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	slackapi "github.com/slack-go/slack"

	"github.com/nextlevelbuilder/goclaw/internal/bus"
	"github.com/nextlevelbuilder/goclaw/internal/channels"
)

func TestSendLocalKeyRoutesToThread(t *testing.T) {
	var (
		gotChannel  string
		gotThreadTS string
		gotText     string
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat.postMessage" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read body: %v", err)
		}
		values, err := url.ParseQuery(string(body))
		if err != nil {
			t.Fatalf("parse form body: %v", err)
		}
		gotChannel = values.Get("channel")
		gotThreadTS = values.Get("thread_ts")
		gotText = values.Get("text")

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok": true,
			"ts": "1776309999.000100",
		})
	}))
	defer server.Close()

	ch := &Channel{
		BaseChannel: channels.NewBaseChannel(channels.TypeSlack, nil, nil),
		api:         slackapi.New("xoxb-test", slackapi.OptionAPIURL(server.URL+"/")),
	}
	ch.SetRunning(true)

	err := ch.Send(context.Background(), bus.OutboundMessage{
		ChatID:  "C123456:thread:1776307238.269409",
		Content: "thread reply",
	})
	if err != nil {
		t.Fatalf("Send returned error: %v", err)
	}

	if gotChannel != "C123456" {
		t.Fatalf("channel = %q, want %q", gotChannel, "C123456")
	}
	if gotThreadTS != "1776307238.269409" {
		t.Fatalf("thread_ts = %q, want %q", gotThreadTS, "1776307238.269409")
	}
	if gotText != "thread reply" {
		t.Fatalf("text = %q, want %q", gotText, "thread reply")
	}
}
