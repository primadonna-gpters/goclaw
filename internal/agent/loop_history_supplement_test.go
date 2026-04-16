package agent

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/nextlevelbuilder/goclaw/internal/bootstrap"
	"github.com/nextlevelbuilder/goclaw/internal/store"
)

type fakeLoopConfigPermStore struct{}

func (f *fakeLoopConfigPermStore) CheckPermission(context.Context, uuid.UUID, string, string, string) (bool, error) {
	return false, nil
}
func (f *fakeLoopConfigPermStore) Grant(context.Context, *store.ConfigPermission) error { return nil }
func (f *fakeLoopConfigPermStore) Revoke(context.Context, uuid.UUID, string, string, string) error {
	return nil
}
func (f *fakeLoopConfigPermStore) List(context.Context, uuid.UUID, string, string) ([]store.ConfigPermission, error) {
	return nil, nil
}
func (f *fakeLoopConfigPermStore) ListFileWriters(context.Context, uuid.UUID, string) ([]store.ConfigPermission, error) {
	return nil, nil
}

func TestBuildGroupWriterPrompt_AllowsSuperUser(t *testing.T) {
	l := &Loop{
		agentUUID:       uuid.New(),
		configPermStore: &fakeLoopConfigPermStore{},
	}
	ctx := store.WithRunContext(context.Background(), &store.RunContext{SuperUser: true})
	files := []bootstrap.ContextFile{{Path: bootstrap.SoulFile, Content: "soul"}}

	prompt, filtered := l.buildGroupWriterPrompt(ctx, "group:slack:chan", "U123", files)

	if !strings.Contains(prompt, "owner-approved superuser access") {
		t.Fatalf("prompt = %q, want superuser notice", prompt)
	}
	if len(filtered) != 1 || filtered[0].Path != bootstrap.SoulFile {
		t.Fatalf("filtered files = %#v, want unchanged files", filtered)
	}
}
