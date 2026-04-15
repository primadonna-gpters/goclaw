package openclaw_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/nextlevelbuilder/goclaw/internal/openclaw"
)

// makeFile creates a file with given content inside a temp dir.
func makeFile(t *testing.T, dir, rel, content string) {
	t.Helper()
	full := filepath.Join(dir, rel)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatalf("mkdirAll %s: %v", filepath.Dir(full), err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatalf("writeFile %s: %v", full, err)
	}
}

func TestScanWorkspace(t *testing.T) {
	dir := t.TempDir()

	// Bootstrap files
	makeFile(t, dir, "CLAUDE.md", "# Claude\nThis is the claude bootstrap.")
	makeFile(t, dir, "SOUL.md", "# Soul\nIdentity soul content.")
	makeFile(t, dir, "EMPTY.md", "") // not a bootstrap file name, ignored anyway
	// Empty bootstrap — should be skipped
	makeFile(t, dir, "MEMORY.md", "")

	// Memory docs
	makeFile(t, dir, "memory/session.md", "Session memory content.")
	makeFile(t, dir, "memory/nested/deep.md", "Deep nested memory.")
	makeFile(t, dir, "context/project.md", "Project context.")
	makeFile(t, dir, "devlogs/2024-01.md", "Devlog January.")
	makeFile(t, dir, "learnings/go-patterns.md", "Go patterns learned.")
	makeFile(t, dir, ".learnings/private.md", "Private learning.")

	// Skills
	makeFile(t, dir, "skills/my-skill/SKILL.md", "---\nname: My Skill\ndescription: Does something useful\n---\n# My Skill\nContent here.")
	makeFile(t, dir, "skills/no-skill-md/README.md", "Not a skill.")
	makeFile(t, dir, "skills/another/SKILL.md", "---\nname: Another\ndescription: Another skill\n---\nBody.")

	// Env vars
	makeFile(t, dir, ".env", "API_KEY=secret123\nDB_HOST=localhost\n# comment\n\nEMPTY_VAR=\n")

	// Scripts (workspace files)
	makeFile(t, dir, "scripts/deploy.sh", "#!/bin/bash\necho deploy")
	makeFile(t, dir, "scripts/build.sh", "#!/bin/bash\necho build")

	result, err := openclaw.ScanWorkspace(dir)
	if err != nil {
		t.Fatalf("ScanWorkspace: %v", err)
	}

	// Bootstrap files: CLAUDE.md and SOUL.md (MEMORY.md is empty → skipped)
	if got := len(result.BootstrapFiles); got != 2 {
		t.Errorf("BootstrapFiles: want 2, got %d", got)
	}
	foundClaude := false
	for _, bf := range result.BootstrapFiles {
		if bf.Name == "CLAUDE.md" {
			foundClaude = true
			if bf.Content == "" {
				t.Error("CLAUDE.md content should not be empty")
			}
		}
	}
	if !foundClaude {
		t.Error("expected CLAUDE.md in BootstrapFiles")
	}

	// Memory docs: memory/session.md, memory/nested/deep.md, memory/context/project.md,
	// memory/devlogs/2024-01.md, memory/learnings/go-patterns.md, memory/.learnings/private.md
	if got := len(result.MemoryDocs); got != 6 {
		t.Errorf("MemoryDocs: want 6, got %d", got)
	}
	for _, doc := range result.MemoryDocs {
		if len(doc.Path) < 7 || doc.Path[:7] != "memory/" {
			t.Errorf("MemoryDoc path must start with memory/, got %q", doc.Path)
		}
		if doc.Hash == "" {
			t.Errorf("MemoryDoc %q has empty hash", doc.Path)
		}
		if doc.Content == "" {
			t.Errorf("MemoryDoc %q has empty content", doc.Path)
		}
	}

	// Skills: my-skill and another (no-skill-md has no SKILL.md)
	if got := len(result.Skills); got != 2 {
		t.Errorf("Skills: want 2, got %d", got)
	}
	for _, sk := range result.Skills {
		if sk.Name == "" {
			t.Errorf("skill %q has empty Name", sk.Slug)
		}
		if sk.Content == "" {
			t.Errorf("skill %q has empty Content", sk.Slug)
		}
	}

	// Env vars
	if got := result.EnvVars["API_KEY"]; got != "secret123" {
		t.Errorf("EnvVars[API_KEY]: want secret123, got %q", got)
	}
	if got := result.EnvVars["DB_HOST"]; got != "localhost" {
		t.Errorf("EnvVars[DB_HOST]: want localhost, got %q", got)
	}
	// EMPTY_VAR should be present but empty
	if _, ok := result.EnvVars["EMPTY_VAR"]; !ok {
		t.Error("EnvVars[EMPTY_VAR] should exist")
	}

	// Workspace files from scripts/
	if got := len(result.WorkspaceFiles); got != 2 {
		t.Errorf("WorkspaceFiles: want 2, got %d", got)
	}
}

func TestScanWorkspace_EmptyDir(t *testing.T) {
	dir := t.TempDir()

	result, err := openclaw.ScanWorkspace(dir)
	if err != nil {
		t.Fatalf("ScanWorkspace empty: %v", err)
	}
	if result == nil {
		t.Fatal("result should not be nil")
	}
	if len(result.BootstrapFiles) != 0 {
		t.Errorf("BootstrapFiles: want 0, got %d", len(result.BootstrapFiles))
	}
	if len(result.MemoryDocs) != 0 {
		t.Errorf("MemoryDocs: want 0, got %d", len(result.MemoryDocs))
	}
	if len(result.Skills) != 0 {
		t.Errorf("Skills: want 0, got %d", len(result.Skills))
	}
	if len(result.EnvVars) != 0 {
		t.Errorf("EnvVars: want 0, got %d", len(result.EnvVars))
	}
	if len(result.WorkspaceFiles) != 0 {
		t.Errorf("WorkspaceFiles: want 0, got %d", len(result.WorkspaceFiles))
	}
}

func TestScanWorkspace_SymlinkWarning(t *testing.T) {
	dir := t.TempDir()

	// Create real file and a symlink in memory/
	makeFile(t, dir, "memory/real.md", "Real content.")

	linkTarget := filepath.Join(dir, "memory", "real.md")
	linkPath := filepath.Join(dir, "memory", "linked.md")
	if err := os.Symlink(linkTarget, linkPath); err != nil {
		t.Skipf("symlink not supported: %v", err)
	}

	result, err := openclaw.ScanWorkspace(dir)
	if err != nil {
		t.Fatalf("ScanWorkspace: %v", err)
	}

	hasSymlinkWarning := false
	for _, w := range result.Warnings {
		if len(w) > 0 {
			// Check for symlink-related warning
			for _, kw := range []string{"symlink", "link", "copied", "linked"} {
				if containsStr(w, kw) {
					hasSymlinkWarning = true
					break
				}
			}
		}
	}
	if !hasSymlinkWarning {
		t.Errorf("expected symlink warning, got warnings: %v", result.Warnings)
	}
}

// containsStr checks if s contains substr (case-insensitive simple check).
func containsStr(s, substr string) bool {
	if len(substr) > len(s) {
		return false
	}
	for i := 0; i <= len(s)-len(substr); i++ {
		match := true
		for j := 0; j < len(substr); j++ {
			c1, c2 := s[i+j], substr[j]
			if c1 >= 'A' && c1 <= 'Z' {
				c1 += 32
			}
			if c2 >= 'A' && c2 <= 'Z' {
				c2 += 32
			}
			if c1 != c2 {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
