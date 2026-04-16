//go:build embedpixeloffice

package ui

import (
	"embed"
	"io/fs"
)

//go:embed dist/*
var assets embed.FS

func Assets() fs.FS {
	sub, err := fs.Sub(assets, "dist")
	if err != nil {
		panic("pixeloffice: embedded assets missing dist/ subdirectory")
	}
	return sub
}
