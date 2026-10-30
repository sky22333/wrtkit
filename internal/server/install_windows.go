//go:build windows

package server

import (
	"fmt"
	"golang.org/x/sys/windows"
	"unsafe"
)

type shellExecuteInfo struct {
	size, mask                        uint32
	hwnd                              windows.Handle
	verb, file, parameters, directory *uint16
	show                              int32
	instance                          windows.Handle
	idList                            unsafe.Pointer
	class                             *uint16
	classKey                          windows.Handle
	hotKey                            uint32
	icon, process                     windows.Handle
}

func launchWSLInstall() error {
	shell := windows.NewLazySystemDLL("shell32.dll").NewProc("ShellExecuteExW")
	op, _ := windows.UTF16PtrFromString("runas")
	file, _ := windows.UTF16PtrFromString("wsl.exe")
	args, _ := windows.UTF16PtrFromString("--install --no-distribution")
	info := shellExecuteInfo{mask: 0x40, verb: op, file: file, parameters: args, show: 1}
	info.size = uint32(unsafe.Sizeof(info))
	v, _, err := shell.Call(uintptr(unsafe.Pointer(&info)))
	if v == 0 {
		return fmt.Errorf("无法启动安装: %w", err)
	}
	if info.process == 0 {
		return fmt.Errorf("无法跟踪安装进程")
	}
	defer windows.CloseHandle(info.process)
	if _, err := windows.WaitForSingleObject(info.process, windows.INFINITE); err != nil {
		return err
	}
	var code uint32
	if err := windows.GetExitCodeProcess(info.process, &code); err != nil {
		return err
	}
	if code != 0 && code != 3010 {
		return fmt.Errorf("安装程序退出，状态码 %d", code)
	}
	return nil
}
