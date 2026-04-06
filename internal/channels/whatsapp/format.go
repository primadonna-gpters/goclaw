package whatsapp

import (
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

// Pre-compiled regex patterns for markdownToWhatsApp — avoids re-compilation per call.
var (
	reHeader        = regexp.MustCompile(`(?m)^#{1,6}\s+(.+)$`)
	reBlockquote    = regexp.MustCompile(`(?m)^>\s*(.*)$`)
	reLink          = regexp.MustCompile(`\[([^\]]+)\]\(([^)]+)\)`)
	reBoldStars     = regexp.MustCompile(`\*\*(.+?)\*\*`)
	reBoldUnder     = regexp.MustCompile(`__(.+?)__`)
	reStrikethrough = regexp.MustCompile(`~~(.+?)~~`)
	reListItem      = regexp.MustCompile(`(?m)^[-*]\s+`)
	reBlankLines    = regexp.MustCompile(`\n{3,}`)
	reCodeBlock     = regexp.MustCompile("```[\\w]*\\n?([\\s\\S]*?)```")
	reTableLine     = regexp.MustCompile(`^\|.*\|$`)
	reTableSep      = regexp.MustCompile(`^\|[\s:|-]+\|$`)
)

// markdownToWhatsApp converts Markdown-formatted LLM output to WhatsApp's native
// formatting syntax. WhatsApp supports: *bold*, _italic_, ~strikethrough~, ```code```.
// Unsupported features are simplified: headers → bold, links → "text url", tables → plain.
func markdownToWhatsApp(text string) string {
	if text == "" {
		return ""
	}

	// Pre-process: convert HTML tags from LLM output to Markdown equivalents.
	text = htmlTagToWaMd(text)

	// Extract and render markdown tables as ASCII-aligned text in ``` blocks.
	text = waRenderTables(text)

	// Extract and protect fenced code blocks — WhatsApp renders ``` the same way.
	codeBlocks := waExtractCodeBlocks(text)
	text = codeBlocks.text

	// Headers (##, ###, etc.) → *bold text* (WhatsApp has no header concept).
	text = reHeader.ReplaceAllString(text, "*$1*")

	// Blockquotes → plain text.
	text = reBlockquote.ReplaceAllString(text, "$1")

	// Links [text](url) → "text url" (WhatsApp doesn't support markdown links).
	text = reLink.ReplaceAllString(text, "$1 $2")

	// Bold: **text** or __text__ → *text*
	text = reBoldStars.ReplaceAllString(text, "*$1*")
	text = reBoldUnder.ReplaceAllString(text, "*$1*")

	// Strikethrough: ~~text~~ → ~text~
	text = reStrikethrough.ReplaceAllString(text, "~$1~")

	// List items: leading - or * → bullet •
	text = reListItem.ReplaceAllString(text, "• ")

	// Restore code blocks as ``` … ``` preserving original content.
	for i, code := range codeBlocks.codes {
		// Trim trailing newline from extracted content — we add our own.
		code = strings.TrimRight(code, "\n")
		text = strings.ReplaceAll(text, fmt.Sprintf("\x00CB%d\x00", i), "```\n"+code+"\n```")
	}

	// Collapse 3+ blank lines to 2.
	text = reBlankLines.ReplaceAllString(text, "\n\n")

	return strings.TrimSpace(text)
}

// htmlTagToWaMd converts common HTML tags in LLM output to Markdown equivalents
// so they are then processed by the markdown → WhatsApp pipeline above.
var htmlToWaMdReplacers = []struct {
	re   *regexp.Regexp
	repl string
}{
	{regexp.MustCompile(`(?i)<br\s*/?>`), "\n"},
	{regexp.MustCompile(`(?i)</?p\s*>`), "\n"},
	{regexp.MustCompile(`(?i)<b>([\s\S]*?)</b>`), "**${1}**"},
	{regexp.MustCompile(`(?i)<strong>([\s\S]*?)</strong>`), "**${1}**"},
	{regexp.MustCompile(`(?i)<i>([\s\S]*?)</i>`), "_${1}_"},
	{regexp.MustCompile(`(?i)<em>([\s\S]*?)</em>`), "_${1}_"},
	{regexp.MustCompile(`(?i)<s>([\s\S]*?)</s>`), "~~${1}~~"},
	{regexp.MustCompile(`(?i)<strike>([\s\S]*?)</strike>`), "~~${1}~~"},
	{regexp.MustCompile(`(?i)<del>([\s\S]*?)</del>`), "~~${1}~~"},
	{regexp.MustCompile(`(?i)<code>([\s\S]*?)</code>`), "`${1}`"},
	{regexp.MustCompile(`(?i)<a\s+href="([^"]+)"[^>]*>([\s\S]*?)</a>`), "[${2}](${1})"},
}

func htmlTagToWaMd(text string) string {
	for _, r := range htmlToWaMdReplacers {
		text = r.re.ReplaceAllString(text, r.repl)
	}
	return text
}

type waCodeBlockMatch struct {
	text  string
	codes []string
}

// waExtractCodeBlocks pulls fenced code blocks out of text and replaces them with
// \x00CB{n}\x00 placeholders so other regex passes don't mangle their contents.
func waExtractCodeBlocks(text string) waCodeBlockMatch {
	matches := reCodeBlock.FindAllStringSubmatch(text, -1)

	codes := make([]string, 0, len(matches))
	for _, m := range matches {
		codes = append(codes, m[1])
	}

	i := 0
	text = reCodeBlock.ReplaceAllStringFunc(text, func(_ string) string {
		placeholder := fmt.Sprintf("\x00CB%d\x00", i)
		i++
		return placeholder
	})

	return waCodeBlockMatch{text: text, codes: codes}
}

// waRenderTables finds markdown tables and renders them as ASCII-aligned
// text inside ``` blocks (monospace) for WhatsApp readability.
func waRenderTables(text string) string {
	lines := strings.Split(text, "\n")
	var result []string
	i := 0
	for i < len(lines) {
		// Detect table: header line followed by separator line.
		if i+1 < len(lines) && reTableLine.MatchString(lines[i]) && reTableSep.MatchString(lines[i+1]) {
			tableStart := i
			i += 2 // skip header + separator
			for i < len(lines) && reTableLine.MatchString(lines[i]) {
				i++
			}
			rendered := renderTable(lines[tableStart:i])
			result = append(result, "```\n"+rendered+"\n```")
		} else {
			result = append(result, lines[i])
			i++
		}
	}
	return strings.Join(result, "\n")
}

// renderTable converts markdown table lines into ASCII-aligned text.
func renderTable(lines []string) string {
	if len(lines) < 2 {
		return strings.Join(lines, "\n")
	}

	var rows [][]string
	for i, line := range lines {
		if i == 1 {
			continue // skip separator
		}
		rows = append(rows, parseTableCells(line))
	}
	if len(rows) == 0 {
		return ""
	}

	// Determine column widths.
	numCols := 0
	for _, row := range rows {
		if len(row) > numCols {
			numCols = len(row)
		}
	}
	widths := make([]int, numCols)
	for _, row := range rows {
		for j, cell := range row {
			if utf8.RuneCountInString(cell) > widths[j] {
				widths[j] = utf8.RuneCountInString(cell)
			}
		}
	}

	// Render aligned rows.
	var out []string
	for ri, row := range rows {
		var cells []string
		for j := 0; j < numCols; j++ {
			cell := ""
			if j < len(row) {
				cell = row[j]
			}
			pad := widths[j] - utf8.RuneCountInString(cell)
			cells = append(cells, cell+strings.Repeat(" ", pad))
		}
		out = append(out, strings.Join(cells, "  "))
		// Add separator after header.
		if ri == 0 {
			var sep []string
			for _, w := range widths {
				sep = append(sep, strings.Repeat("─", w))
			}
			out = append(out, strings.Join(sep, "──"))
		}
	}
	return strings.Join(out, "\n")
}

// parseTableCells splits a markdown table row into trimmed cells.
func parseTableCells(line string) []string {
	line = strings.Trim(line, "|")
	parts := strings.Split(line, "|")
	cells := make([]string, len(parts))
	for i, p := range parts {
		cells[i] = strings.TrimSpace(p)
	}
	return cells
}

// chunkText splits text into pieces that fit within maxLen runes,
// preferring to split at paragraph (\n\n) or line (\n) boundaries.
// Uses rune count (not byte count) so multi-byte characters are handled correctly.
func chunkText(text string, maxLen int) []string {
	if utf8.RuneCountInString(text) <= maxLen {
		return []string{text}
	}

	var chunks []string
	for len(text) > 0 {
		if utf8.RuneCountInString(text) <= maxLen {
			chunks = append(chunks, text)
			break
		}
		// Convert rune limit to byte offset for slicing.
		byteLimit := runeOffset(text, maxLen)
		// Find the best split point: paragraph > line > space > hard cut.
		cutAt := byteLimit
		if idx := strings.LastIndex(text[:byteLimit], "\n\n"); idx > 0 {
			cutAt = idx
		} else if idx := strings.LastIndex(text[:byteLimit], "\n"); idx > 0 {
			cutAt = idx
		} else if idx := strings.LastIndex(text[:byteLimit], " "); idx > 0 {
			cutAt = idx
		}
		chunks = append(chunks, strings.TrimRight(text[:cutAt], " \n"))
		text = strings.TrimLeft(text[cutAt:], " \n")
	}
	return chunks
}

// runeOffset returns the byte offset of the n-th rune in s.
// If n exceeds the rune count, returns len(s).
func runeOffset(s string, n int) int {
	offset := 0
	for i := 0; i < n && offset < len(s); i++ {
		_, size := utf8.DecodeRuneInString(s[offset:])
		offset += size
	}
	return offset
}
