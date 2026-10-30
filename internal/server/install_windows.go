//go:build windows

package server

import (
	"fmt"
	"golang.org/x/sys/windows"
	"unsafe"
)

func launchWSLInstall() error {
	shell := windows.NewLazySystemDLL("shell32.dll").NewProc("ShellExecuteW")
	op, _ := windows.UTF16PtrFromString("runas")
	file, _ := windows.UTF16PtrFromString("wsl.exe")
	args, _ := windows.UTF16PtrFromString("--install --no-distribution")
	v, _, err := shell.Call(0, uintptr(unsafe.Pointer(op)), uintptr(unsafe.Pointer(file)), uintptr(unsafe.Pointer(args)), 0, 1)
	if v <= 32 {
		return fmt.Errorf("无法启动安装（%d）：%v", v, err)
	}
	return nil
}
