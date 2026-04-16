package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

type fakeConfigPermissionStore struct{}

func (f *fakeConfigPermissionStore) CheckPermission(context.Context, uuid.UUID, string, string, string) (bool, error) {
	return false, nil
}
func (f *fakeConfigPermissionStore) Grant(context.Context, *ConfigPermission) error { return nil }
func (f *fakeConfigPermissionStore) Revoke(context.Context, uuid.UUID, string, string, string) error {
	return nil
}
func (f *fakeConfigPermissionStore) List(context.Context, uuid.UUID, string, string) ([]ConfigPermission, error) {
	return nil, nil
}
func (f *fakeConfigPermissionStore) ListFileWriters(context.Context, uuid.UUID, string) ([]ConfigPermission, error) {
	return nil, nil
}

func TestCheckFileWriterPermission_AllowsSuperUser(t *testing.T) {
	ctx := WithRunContext(context.Background(), &RunContext{
		AgentID:   uuid.New(),
		UserID:    "group:slack-bbojjak:C123",
		SenderID:  "U123",
		SuperUser: true,
	})

	if err := CheckFileWriterPermission(ctx, &fakeConfigPermissionStore{}); err != nil {
		t.Fatalf("CheckFileWriterPermission() error = %v, want nil", err)
	}
}

func TestCheckCronPermission_AllowsSuperUser(t *testing.T) {
	ctx := WithRunContext(context.Background(), &RunContext{
		AgentID:   uuid.New(),
		UserID:    "group:slack-bbojjak:C123",
		SenderID:  "U123",
		SuperUser: true,
	})

	if err := CheckCronPermission(ctx, &fakeConfigPermissionStore{}); err != nil {
		t.Fatalf("CheckCronPermission() error = %v, want nil", err)
	}
}
