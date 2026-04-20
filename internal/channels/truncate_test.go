package channels

import (
	"testing"
	"unicode/utf8"
)

func TestTruncate_ASCII(t *testing.T) {
	got := Truncate("hello world", 5)
	if got != "hello..." {
		t.Fatalf("ascii truncate: got %q", got)
	}
	if Truncate("hi", 5) != "hi" {
		t.Fatal("short ascii should pass through")
	}
}

func TestTruncate_KoreanStaysValidUTF8(t *testing.T) {
	// Each Korean syllable is 3 bytes in UTF-8. At maxLen=5 we land mid-codepoint.
	// Old byte-slicing would have produced `안\xec...` (invalid UTF-8).
	in := "안녕하세요 반갑습니다" // 11 Korean chars × 3 bytes + spaces
	for n := 1; n <= len(in); n++ {
		got := Truncate(in, n)
		if !utf8.ValidString(got) {
			t.Fatalf("truncate at %d produced invalid UTF-8: %q (bytes=%x)", n, got, []byte(got))
		}
	}
}
