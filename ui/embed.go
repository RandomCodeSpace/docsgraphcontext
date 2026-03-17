package ui

import "embed"

//go:embed index.html app.js graph.js style.css
var Assets embed.FS
