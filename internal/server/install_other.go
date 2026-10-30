//go:build !windows

package server

import "errors"

func launchWSLInstall() error { return errors.New("此功能仅在 Windows 上可用") }
