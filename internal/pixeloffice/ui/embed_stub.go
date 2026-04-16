//go:build !embedpixeloffice

package ui

import "io/fs"

func Assets() fs.FS { return nil }
