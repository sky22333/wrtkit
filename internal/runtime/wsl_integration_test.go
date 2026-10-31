package runtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"testing"
	"time"
)

// Optional real-host test: reuses the ImageBuilder image and removes only its own container.
func TestWSLCFileTransferAndCleanup(t *testing.T) {
	if goruntime.GOOS != "windows" || os.Getenv("WRTKIT_TEST_WSLC") != "1" {
		t.Skip("requires opt-in Windows WSL Containers")
	}
	root := t.TempDir()
	logPath := filepath.Join(root, "build.log")
	f, err := os.Create(logPath)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	spec := Spec{Image: "immortalwrt/imagebuilder@sha256:7ea93e502bfe8b09f3a0d8f8b7d3d244ecc0fbcd5207cf264abf79f5ef9b925e", Files: map[string][]byte{"wrtkit/run.sh": []byte("#!/bin/sh\nset -eu\nmkdir -p /tmp/wrtkit-work/output\nprintf sample >/tmp/wrtkit-work/output/test.bin\nprintf 'stdout marker\\n'\nprintf 'stderr marker\\n' >&2\n")}}
	err = (&WSL{}).Run(ctx, spec, f, filepath.Join(root, "output"))
	closeErr := f.Close()
	if err != nil {
		t.Fatal(err)
	}
	if closeErr != nil {
		t.Fatal(closeErr)
	}
	data, err := os.ReadFile(filepath.Join(root, "output", "test.bin"))
	if err != nil || string(data) != "sample" {
		t.Fatalf("artifact %q: %v", data, err)
	}
	contents, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	log := string(contents)
	if !strings.Contains(log, "stdout marker") || !strings.Contains(log, "stderr marker") || !strings.HasSuffix(strings.TrimSpace(log), "构建容器已清理") {
		t.Fatalf("incorrect log ordering: %q", log)
	}
}

func TestWSLCManagedContainerCleanup(t *testing.T) {
	if goruntime.GOOS != "windows" || os.Getenv("WRTKIT_TEST_WSLC") != "1" {
		t.Skip("requires opt-in Windows WSL Containers")
	}
	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		t.Fatal(err)
	}
	id := hex.EncodeToString(random)
	name := jobContainerName(id)
	binary := wslcPath()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	defer exec.Command(binary, "container", "rm", "-f", name).Run()
	img := "immortalwrt/imagebuilder@sha256:7ea93e502bfe8b09f3a0d8f8b7d3d244ecc0fbcd5207cf264abf79f5ef9b925e"
	if out, err := exec.CommandContext(ctx, binary, "create", "--name", name, "--label", "io.wrtkit.job="+id, img, "true").CombinedOutput(); err != nil {
		t.Fatalf("create: %v %s", err, out)
	}
	e := &WSL{}
	if err := e.RemoveJobContainer(ctx, id); err != nil {
		t.Fatal(err)
	}
	out, err := exec.CommandContext(ctx, binary, "container", "list", "--all", "--format", "json").Output()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(out), name) {
		t.Fatalf("container not removed: %s", out)
	}
}
