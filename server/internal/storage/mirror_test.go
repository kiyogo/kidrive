package storage

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

func TestMirrorEngine_LifecycleAndOfflineRecovery(t *testing.T) {
	tempBase := t.TempDir()
	srcRoot := filepath.Join(tempBase, "source")
	dstRoot := filepath.Join(tempBase, "dest")

	if err := os.MkdirAll(srcRoot, 0o755); err != nil {
		t.Fatalf("failed to create srcRoot: %v", err)
	}
	if err := os.MkdirAll(dstRoot, 0o755); err != nil {
		t.Fatalf("failed to create dstRoot: %v", err)
	}

	engine, err := NewMirrorEngine(srcRoot, dstRoot, nil)
	if err != nil {
		t.Fatalf("NewMirrorEngine failed: %v", err)
	}

	// 1. Sync small file
	smallContent := []byte("hello LocalDrive private cloud")
	smallSum := sha256.Sum256(smallContent)
	smallSumHex := hex.EncodeToString(smallSum[:])
	smallRel := "docs/readme.txt"

	smallSrc := filepath.Join(srcRoot, smallRel)
	if err := os.MkdirAll(filepath.Dir(smallSrc), 0o755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	if err := os.WriteFile(smallSrc, smallContent, 0o644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	job1, err := engine.EnqueueSync(smallRel, smallSumHex, int64(len(smallContent)))
	if err != nil {
		t.Fatalf("EnqueueSync failed: %v", err)
	}
	if job1.State != JobPending {
		t.Fatalf("expected state PENDING, got %s", job1.State)
	}

	// Process queue
	if !engine.ProcessNext() {
		t.Fatalf("expected ProcessNext to succeed")
	}

	smallDst := filepath.Join(dstRoot, smallRel)
	gotSmall, err := os.ReadFile(smallDst)
	if err != nil {
		t.Fatalf("expected destination file to exist: %v", err)
	}
	if string(gotSmall) != string(smallContent) {
		t.Fatalf("content mismatch on destination: got %q, want %q", gotSmall, smallContent)
	}

	// 2. Unicode filename sync
	uniContent := []byte("Tệp tài liệu tiếng Việt có dấu và ký tự đặc biệt 🚀")
	uniSum := sha256.Sum256(uniContent)
	uniSumHex := hex.EncodeToString(uniSum[:])
	uniRel := "tài_liệu/bản_ghi_2026_tiếng_việt.md"

	uniSrc := filepath.Join(srcRoot, uniRel)
	if err := os.MkdirAll(filepath.Dir(uniSrc), 0o755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	if err := os.WriteFile(uniSrc, uniContent, 0o644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	_, err = engine.EnqueueSync(uniRel, uniSumHex, int64(len(uniContent)))
	if err != nil {
		t.Fatalf("EnqueueSync unicode failed: %v", err)
	}
	if !engine.ProcessNext() {
		t.Fatalf("expected ProcessNext to sync unicode file")
	}

	uniDst := filepath.Join(dstRoot, uniRel)
	gotUni, err := os.ReadFile(uniDst)
	if err != nil {
		t.Fatalf("expected unicode destination file to exist: %v", err)
	}
	if string(gotUni) != string(uniContent) {
		t.Fatalf("unicode content mismatch: got %q, want %q", gotUni, uniContent)
	}

	// 3. Checksum verification with mismatch detection
	badRel := "corrupt.bin"
	badSrc := filepath.Join(srcRoot, badRel)
	_ = os.WriteFile(badSrc, []byte("actual content"), 0o644)
	badJob, err := engine.EnqueueSync(badRel, "0000000000000000000000000000000000000000000000000000000000000000", 14)
	if err != nil {
		t.Fatalf("EnqueueSync failed: %v", err)
	}

	if !engine.ProcessNext() {
		t.Fatalf("expected ProcessNext to attempt corrupted file")
	}
	if badJob.State != JobRetrying {
		t.Fatalf("expected job with bad checksum to enter RETRYING, got %s", badJob.State)
	}
	if badJob.Attempts != 1 {
		t.Fatalf("expected attempts=1, got %d", badJob.Attempts)
	}

	// 4. Offline destination simulation and automatic recovery
	offlineDst := filepath.Join(tempBase, "offline_drive_not_mounted")
	engine.SetDestination(offlineDst)

	statsOffline := engine.Stats()
	if statsOffline.Status != StatusOffline {
		t.Fatalf("expected StatusOffline when destination does not exist, got %s", statsOffline.Status)
	}

	// Enqueue files while destination is offline
	offContent := []byte("queued while offline")
	offSum := sha256.Sum256(offContent)
	offRel := "offline_file.dat"
	offSrc := filepath.Join(srcRoot, offRel)
	_ = os.WriteFile(offSrc, offContent, 0o644)

	_, err = engine.EnqueueSync(offRel, hex.EncodeToString(offSum[:]), int64(len(offContent)))
	if err != nil {
		t.Fatalf("EnqueueSync during offline failed: %v", err)
	}

	// ProcessNext must refuse to run and stay safe while destination is offline
	if engine.ProcessNext() {
		t.Fatalf("ProcessNext should return false when destination is offline")
	}

	// Now destination reconnects!
	if err := os.MkdirAll(offlineDst, 0o755); err != nil {
		t.Fatalf("failed to mount destination: %v", err)
	}

	// Queue automatically detects destination online and processes
	if !engine.ProcessNext() {
		t.Fatalf("ProcessNext should succeed after destination reconnected")
	}

	offDst := filepath.Join(offlineDst, offRel)
	gotOff, err := os.ReadFile(offDst)
	if err != nil {
		t.Fatalf("expected file to be written upon reconnection: %v", err)
	}
	if string(gotOff) != string(offContent) {
		t.Fatalf("content mismatch after reconnection: got %q", gotOff)
	}

	// 5. Crash recovery simulation (persisted queue on disk)
	// Create a new engine instance pointing to the same sourceRoot
	engineRestarted, err := NewMirrorEngine(srcRoot, offlineDst, nil)
	if err != nil {
		t.Fatalf("NewMirrorEngine restart failed: %v", err)
	}

	statsRestart := engineRestarted.Stats()
	if statsRestart.CompletedTasks < 2 {
		t.Fatalf("expected completed tasks to be preserved across restart, got %d", statsRestart.CompletedTasks)
	}
}
