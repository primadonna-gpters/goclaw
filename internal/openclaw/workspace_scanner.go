package openclaw

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// WorkspaceScanResult holds all data extracted from an OpenClaw workspace.
type WorkspaceScanResult struct {
	BootstrapFiles []BootstrapFile
	MemoryDocs     []MemoryDoc
	Skills         []SkillEntry
	EnvVars        map[string]string
	WorkspaceFiles map[string][]byte
	Warnings       []string
}

// BootstrapFile is a top-level markdown file that seeds an agent's context.
type BootstrapFile struct {
	Name    string
	Content string
}

// MemoryDoc is a document stored in the GoClaw memory system.
type MemoryDoc struct {
	// Path is the GoClaw-relative path, always prefixed with "memory/".
	Path    string
	Content string
	Hash    string
}

// SkillEntry describes a skill discovered in the workspace skills/ directory.
type SkillEntry struct {
	Slug        string
	Name        string
	Description string
	Content     string
	FilePath    string
}

// bootstrapNames is the canonical set of bootstrap file names to look for.
var bootstrapNames = []string{
	"SOUL.md",
	"AGENTS.md",
	"IDENTITY.md",
	"USER.md",
	"HEARTBEAT.md",
	"MEMORY.md",
	"TOOLS.md",
	"CAPABILITIES.md",
	"VOICE.md",
	"CLAUDE.md",
	"WORKFLOW_AUTO.md",
	"BOOTSTRAP.md",
}

// memoryDirMap maps OpenClaw directory names to their GoClaw path prefixes.
// All GoClaw paths must start with "memory/" so that isMemoryPath() matches.
var memoryDirMap = []struct {
	dir    string // directory name inside workspace root
	prefix string // GoClaw path prefix (must start with "memory/")
}{
	{"memory", "memory/"},
	{"context", "memory/context/"},
	{"devlogs", "memory/devlogs/"},
	{"learnings", "memory/learnings/"},
	{".learnings", "memory/.learnings/"},
}

// largeDirWarnings lists directories that are too large to auto-migrate.
var largeDirWarnings = []string{"operations", "archives", "assets"}

// ScanWorkspace reads wsPath and extracts all migrable data into a WorkspaceScanResult.
// It never returns nil on success; missing optional directories are silently skipped.
func ScanWorkspace(wsPath string) (*WorkspaceScanResult, error) {
	result := &WorkspaceScanResult{
		EnvVars:        make(map[string]string),
		WorkspaceFiles: make(map[string][]byte),
	}

	if err := scanBootstrapFiles(wsPath, result); err != nil {
		return nil, err
	}
	if err := scanMemoryDocs(wsPath, result); err != nil {
		return nil, err
	}
	if err := scanSkills(wsPath, result); err != nil {
		return nil, err
	}
	if err := scanEnvFile(wsPath, result); err != nil {
		return nil, err
	}
	if err := scanScripts(wsPath, result); err != nil {
		return nil, err
	}
	scanLargeDirWarnings(wsPath, result)

	return result, nil
}

// scanBootstrapFiles looks for known bootstrap file names in the workspace root.
func scanBootstrapFiles(wsPath string, result *WorkspaceScanResult) error {
	for _, name := range bootstrapNames {
		fullPath := filepath.Join(wsPath, name)
		content, err := os.ReadFile(fullPath)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		if len(strings.TrimSpace(string(content))) == 0 {
			continue // skip empty files
		}
		result.BootstrapFiles = append(result.BootstrapFiles, BootstrapFile{
			Name:    name,
			Content: string(content),
		})
	}
	return nil
}

// scanMemoryDocs recursively scans memory-related directories and maps them to GoClaw paths.
func scanMemoryDocs(wsPath string, result *WorkspaceScanResult) error {
	for _, mapping := range memoryDirMap {
		dir := filepath.Join(wsPath, mapping.dir)
		if _, err := os.Lstat(dir); os.IsNotExist(err) {
			continue
		}

		err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}

			content, readErr := os.ReadFile(path)
			if readErr != nil {
				return readErr
			}
			if len(strings.TrimSpace(string(content))) == 0 {
				return nil // skip empty
			}

			// Build GoClaw-relative path: prefix + relative path from the dir.
			rel, relErr := filepath.Rel(dir, path)
			if relErr != nil {
				return relErr
			}
			goclawPath := mapping.prefix + filepath.ToSlash(rel)

			hash := sha256sum(content)
			result.MemoryDocs = append(result.MemoryDocs, MemoryDoc{
				Path:    goclawPath,
				Content: string(content),
				Hash:    hash,
			})
			return nil
		})
		if err != nil {
			return err
		}
	}

	// Detect symlinks that WalkDir follows transparently (symlink-to-file).
	// WalkDir on Go follows symlinks' targets but reports them as regular files.
	// We do a second pass with Lstat to catch those.
	if err := detectSymlinksInMemoryDirs(wsPath, result); err != nil {
		return err
	}

	return nil
}

// detectSymlinksInMemoryDirs adds warnings for symlinks WalkDir may have resolved silently.
func detectSymlinksInMemoryDirs(wsPath string, result *WorkspaceScanResult) error {
	warned := make(map[string]bool)
	for _, w := range result.Warnings {
		warned[w] = true
	}

	for _, mapping := range memoryDirMap {
		dir := filepath.Join(wsPath, mapping.dir)
		if _, err := os.Lstat(dir); os.IsNotExist(err) {
			continue
		}

		// Use os.ReadDir recursively via a manual walk to catch symlinks.
		if err := lstatWalk(dir, func(path string, isSymlink bool) {
			if isSymlink {
				msg := "symlink detected at " + path + ": content will be copied, not linked"
				if !warned[msg] {
					warned[msg] = true
					result.Warnings = append(result.Warnings, msg)
				}
			}
		}); err != nil {
			return err
		}
	}
	return nil
}

// lstatWalk walks a directory using Lstat to detect symlinks.
func lstatWalk(dir string, fn func(path string, isSymlink bool)) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		fullPath := filepath.Join(dir, e.Name())
		info, err := os.Lstat(fullPath)
		if err != nil {
			continue
		}
		if info.Mode()&os.ModeSymlink != 0 {
			fn(fullPath, true)
			continue
		}
		if e.IsDir() {
			if err := lstatWalk(fullPath, fn); err != nil {
				return err
			}
		}
	}
	return nil
}

// scanSkills looks for subdirectories inside skills/ that contain a SKILL.md.
func scanSkills(wsPath string, result *WorkspaceScanResult) error {
	skillsDir := filepath.Join(wsPath, "skills")
	entries, err := os.ReadDir(skillsDir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		skillFile := filepath.Join(skillsDir, e.Name(), "SKILL.md")
		content, err := os.ReadFile(skillFile)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return err
		}

		name, description := parseFrontmatter(string(content))
		result.Skills = append(result.Skills, SkillEntry{
			Slug:        e.Name(),
			Name:        name,
			Description: description,
			Content:     string(content),
			FilePath:    skillFile,
		})
	}
	return nil
}

// parseFrontmatter extracts name and description from YAML frontmatter delimited by ---.
func parseFrontmatter(content string) (name, description string) {
	lines := strings.Split(content, "\n")
	inFrontmatter := false
	count := 0

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "---" {
			count++
			if count == 1 {
				inFrontmatter = true
				continue
			}
			if count == 2 {
				break // end of frontmatter
			}
		}
		if !inFrontmatter {
			continue
		}
		if k, v, ok := parseKV(trimmed); ok {
			switch strings.ToLower(k) {
			case "name":
				name = v
			case "description":
				description = v
			}
		}
	}
	return name, description
}

// parseKV parses a "key: value" line.
func parseKV(line string) (key, value string, ok bool) {
	idx := strings.Index(line, ":")
	if idx < 0 {
		return "", "", false
	}
	key = strings.TrimSpace(line[:idx])
	value = strings.TrimSpace(line[idx+1:])
	return key, value, true
}

// scanEnvFile parses a .env file (KEY=VALUE format).
func scanEnvFile(wsPath string, result *WorkspaceScanResult) error {
	envPath := filepath.Join(wsPath, ".env")
	f, err := os.Open(envPath)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.Index(line, "=")
		if idx < 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		value := strings.TrimSpace(line[idx+1:])
		if key != "" {
			result.EnvVars[key] = value
		}
	}
	return scanner.Err()
}

// scanScripts reads all files in the scripts/ directory as workspace files.
// Files larger than 1MB are skipped.
const maxWorkspaceFileSize = 1 << 20 // 1MB

func scanScripts(wsPath string, result *WorkspaceScanResult) error {
	scriptsDir := filepath.Join(wsPath, "scripts")
	if _, err := os.Lstat(scriptsDir); os.IsNotExist(err) {
		return nil
	}

	return filepath.WalkDir(scriptsDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return err
		}
		if info.Size() > maxWorkspaceFileSize {
			return nil // skip large files
		}

		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}

		rel, err := filepath.Rel(wsPath, path)
		if err != nil {
			return err
		}
		result.WorkspaceFiles[filepath.ToSlash(rel)] = content
		return nil
	})
}

// scanLargeDirWarnings warns about directories that won't be auto-migrated.
func scanLargeDirWarnings(wsPath string, result *WorkspaceScanResult) {
	for _, dir := range largeDirWarnings {
		fullPath := filepath.Join(wsPath, dir)
		if info, err := os.Lstat(fullPath); err == nil && info.IsDir() {
			result.Warnings = append(result.Warnings,
				"large directory '"+dir+"/' detected: will not be auto-migrated")
		}
	}
}

// sha256sum returns the hex-encoded SHA-256 hash of data.
func sha256sum(data []byte) string {
	h := sha256.New()
	_, _ = io.Writer(h).Write(data)
	return hex.EncodeToString(h.Sum(nil))
}
