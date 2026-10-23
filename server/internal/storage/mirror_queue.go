package storage

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// MirrorStatus represents the overall operational state of mirroring.
type MirrorStatus string

const (
	StatusHealthy  MirrorStatus = "Healthy"
	StatusSyncing  MirrorStatus = "Syncing"
	StatusPending  MirrorStatus = "Pending"
	StatusDegraded MirrorStatus = "Degraded"
	StatusOffline  MirrorStatus = "Offline"
	StatusFailed   MirrorStatus = "Failed"
)

// JobState represents the state of a single mirror synchronization job.
type JobState string

const (
	JobPending   JobState = "PENDING"
	JobRunning   JobState = "RUNNING"
	JobRetrying  JobState = "RETRYING"
	JobCompleted JobState = "COMPLETED"
	JobFailed    JobState = "FAILED"
	JobCancelled JobState = "CANCELLED"
)

// SyncOp is the type of file operation to mirror.
type SyncOp string

const (
	OpSync   SyncOp = "SYNC"
	OpDelete SyncOp = "DELETE"
)

// MirrorJob represents one unit of mirroring work.
type MirrorJob struct {
	ID          string    `json:"id"`
	SourcePath  string    `json:"source_path"`
	DestPath    string    `json:"dest_path"`
	Checksum    string    `json:"checksum"`
	SizeBytes   int64     `json:"size_bytes"`
	Op          SyncOp    `json:"op"`
	State       JobState  `json:"state"`
	Attempts    int       `json:"attempts"`
	MaxAttempts int       `json:"max_attempts"`
	LastError   string    `json:"last_error,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	NextRetryAt time.Time `json:"next_retry_at,omitempty"`
}

// MirrorStats captures real-time telemetry for the mirror engine.
type MirrorStats struct {
	Status             MirrorStatus `json:"status"`
	Enabled            bool         `json:"enabled"`
	SourceRoot         string       `json:"source_root"`
	DestinationRoot    string       `json:"destination_root"`
	PendingTasks       int          `json:"pending_tasks"`
	RunningTasks       int          `json:"running_tasks"`
	CompletedTasks     int          `json:"completed_tasks"`
	FailedTasks        int          `json:"failed_tasks"`
	BytesPending       int64        `json:"bytes_pending"`
	LastSuccessfulSync time.Time    `json:"last_successful_sync"`
	LastError          string       `json:"last_error,omitempty"`
}

// MirrorEngine manages durable background sync between source and destination roots.
type MirrorEngine struct {
	mu           sync.RWMutex
	sourceRoot   string
	destRoot     string
	queueFile    string
	enabled      bool
	syncDelete   bool
	jobs         []*MirrorJob
	log          *slog.Logger
	stopCh       chan struct{}
	wakeCh       chan struct{}
	lastSync     time.Time
	lastError    string
	workerActive bool
}

// NewMirrorEngine creates a new durable mirror engine for sourceRoot and destRoot.
func NewMirrorEngine(sourceRoot, destRoot string, log *slog.Logger) (*MirrorEngine, error) {
	if log == nil {
		log = slog.Default()
	}
	queueDir := filepath.Join(sourceRoot, InternalDir)
	if err := os.MkdirAll(queueDir, 0o750); err != nil {
		return nil, fmt.Errorf("mirror: failed to create queue directory: %w", err)
	}
	queueFile := filepath.Join(queueDir, "mirror_queue.json")

	engine := &MirrorEngine{
		sourceRoot: sourceRoot,
		destRoot:   destRoot,
		queueFile:  queueFile,
		enabled:    true,
		syncDelete: true,
		jobs:       make([]*MirrorJob, 0),
		log:        log,
		stopCh:     make(chan struct{}),
		wakeCh:     make(chan struct{}, 1),
	}

	if err := engine.loadQueue(); err != nil {
		log.Warn("mirror: could not load existing queue, starting fresh", "error", err)
	}

	// Recover any jobs that were RUNNING during a crash/restart back to PENDING
	engine.recoverInterruptedJobs()

	return engine, nil
}

// SetEnabled enables or disables the mirror engine.
func (e *MirrorEngine) SetEnabled(enabled bool) {
	e.mu.Lock()
	e.enabled = enabled
	e.mu.Unlock()
	e.triggerWake()
}

// SetDestination changes or updates the destination root.
func (e *MirrorEngine) SetDestination(destRoot string) {
	e.mu.Lock()
	e.destRoot = destRoot
	e.mu.Unlock()
	e.triggerWake()
}

// EnqueueSync adds a file copy/sync job to the durable queue.
func (e *MirrorEngine) EnqueueSync(relPath, checksum string, sizeBytes int64) (*MirrorJob, error) {
	return e.enqueue(relPath, checksum, sizeBytes, OpSync)
}

// EnqueueDelete adds a file deletion job to the durable queue.
func (e *MirrorEngine) EnqueueDelete(relPath string) (*MirrorJob, error) {
	return e.enqueue(relPath, "", 0, OpDelete)
}

func (e *MirrorEngine) enqueue(relPath, checksum string, sizeBytes int64, op SyncOp) (*MirrorJob, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	srcPath := filepath.Join(e.sourceRoot, relPath)
	dstPath := filepath.Join(e.destRoot, relPath)

	// Idempotency: if an uncompleted job exists for the exact same destination and op, update it
	for _, j := range e.jobs {
		if j.DestPath == dstPath && j.Op == op && (j.State == JobPending || j.State == JobRetrying || j.State == JobRunning) {
			j.Checksum = checksum
			j.SizeBytes = sizeBytes
			j.UpdatedAt = time.Now()
			_ = e.saveQueueLocked()
			e.triggerWake()
			return j, nil
		}
	}

	idBuf := make([]byte, 8)
	_, _ = rand.Read(idBuf)
	job := &MirrorJob{
		ID:          hex.EncodeToString(idBuf),
		SourcePath:  srcPath,
		DestPath:    dstPath,
		Checksum:    checksum,
		SizeBytes:   sizeBytes,
		Op:          op,
		State:       JobPending,
		Attempts:    0,
		MaxAttempts: 10,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	e.jobs = append(e.jobs, job)
	if err := e.saveQueueLocked(); err != nil {
		e.log.Error("mirror: failed to persist queue", "error", err)
	}

	e.triggerWake()
	return job, nil
}

// Start launches the background worker loop.
func (e *MirrorEngine) Start() {
	e.mu.Lock()
	if e.workerActive {
		e.mu.Unlock()
		return
	}
	e.workerActive = true
	e.mu.Unlock()

	go e.workerLoop()
}

// Stop safely stops the background worker.
func (e *MirrorEngine) Stop() {
	e.mu.Lock()
	if !e.workerActive {
		e.mu.Unlock()
		return
	}
	close(e.stopCh)
	e.workerActive = false
	e.mu.Unlock()
}

func (e *MirrorEngine) triggerWake() {
	select {
	case e.wakeCh <- struct{}{}:
	default:
	}
}

func (e *MirrorEngine) workerLoop() {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-e.stopCh:
			return
		case <-ticker.C:
			e.processQueue()
		case <-e.wakeCh:
			e.processQueue()
		}
	}
}

// CheckDestination returns true if destination root is mounted and writable.
func (e *MirrorEngine) CheckDestination() bool {
	e.mu.RLock()
	dest := e.destRoot
	e.mu.RUnlock()

	if dest == "" {
		return false
	}
	info, err := os.Stat(dest)
	if err != nil || !info.IsDir() {
		return false
	}

	// Probe write permission with a temp check
	probe := filepath.Join(dest, ".localdrive_probe_"+hex.EncodeToString(randBytes(4)))
	if err := os.WriteFile(probe, []byte("ok"), 0o600); err != nil {
		return false
	}
	_ = os.Remove(probe)
	return true
}

func randBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}

// ProcessNext processes one eligible job in the queue (exported for synchronous test verification).
func (e *MirrorEngine) ProcessNext() bool {
	e.mu.Lock()
	if !e.enabled {
		e.mu.Unlock()
		return false
	}
	destAvailable := e.isDestinationOnlineLocked()
	if !destAvailable {
		e.lastError = "destination root is offline or unreachable"
		e.mu.Unlock()
		return false
	}

	now := time.Now()
	var targetJob *MirrorJob
	for _, j := range e.jobs {
		if j.State == JobPending || (j.State == JobRetrying && now.After(j.NextRetryAt)) {
			targetJob = j
			break
		}
	}

	if targetJob == nil {
		e.mu.Unlock()
		return false
	}

	targetJob.State = JobRunning
	targetJob.Attempts++
	targetJob.UpdatedAt = now
	_ = e.saveQueueLocked()
	e.mu.Unlock()

	// Execute operation
	err := e.executeJob(targetJob)

	e.mu.Lock()
	defer e.mu.Unlock()
	targetJob.UpdatedAt = time.Now()
	if err == nil {
		targetJob.State = JobCompleted
		targetJob.LastError = ""
		e.lastSync = time.Now()
		e.lastError = ""
	} else {
		targetJob.LastError = err.Error()
		e.lastError = err.Error()
		if targetJob.Attempts >= targetJob.MaxAttempts {
			targetJob.State = JobFailed
			e.log.Warn("mirror: job permanently failed after max attempts", "id", targetJob.ID, "dest", targetJob.DestPath, "error", err)
		} else {
			targetJob.State = JobRetrying
			// Exponential backoff: 2^(attempts-1) seconds, capped at 5 minutes
			backoffSec := math.Min(300, math.Pow(2, float64(targetJob.Attempts-1)))
			targetJob.NextRetryAt = time.Now().Add(time.Duration(backoffSec) * time.Second)
		}
	}

	_ = e.saveQueueLocked()
	return true
}

func (e *MirrorEngine) processQueue() {
	for {
		select {
		case <-e.stopCh:
			return
		default:
		}
		if !e.ProcessNext() {
			break
		}
	}
}

func (e *MirrorEngine) isDestinationOnlineLocked() bool {
	if e.destRoot == "" {
		return false
	}
	info, err := os.Stat(e.destRoot)
	return err == nil && info.IsDir()
}

func (e *MirrorEngine) executeJob(job *MirrorJob) error {
	switch job.Op {
	case OpDelete:
		if err := os.Remove(job.DestPath); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("delete failed: %w", err)
		}
		return nil

	case OpSync:
		// 1. Source verification
		srcFile, err := os.Open(job.SourcePath)
		if err != nil {
			return fmt.Errorf("cannot read source file %q: %w", job.SourcePath, err)
		}
		defer srcFile.Close()

		// 2. Prepare destination folder
		destDir := filepath.Dir(job.DestPath)
		if err := os.MkdirAll(destDir, 0o755); err != nil {
			return fmt.Errorf("cannot create destination dir %q: %w", destDir, err)
		}

		// 3. Write to temporary staging file in the same directory for atomic rename
		tmpFile := job.DestPath + ".tmp." + hex.EncodeToString(randBytes(4))
		dstWriter, err := os.OpenFile(tmpFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			return fmt.Errorf("cannot create temp file %q: %w", tmpFile, err)
		}

		hasher := sha256.New()
		multi := io.MultiWriter(dstWriter, hasher)
		copied, copyErr := io.Copy(multi, srcFile)
		_ = dstWriter.Sync()
		dstCloseErr := dstWriter.Close()

		if copyErr != nil {
			_ = os.Remove(tmpFile)
			return fmt.Errorf("copy failed: %w", copyErr)
		}
		if dstCloseErr != nil {
			_ = os.Remove(tmpFile)
			return fmt.Errorf("temp file close failed: %w", dstCloseErr)
		}

		// 4. SHA-256 Checksum verification
		computedSum := hex.EncodeToString(hasher.Sum(nil))
		if job.Checksum != "" && computedSum != job.Checksum {
			_ = os.Remove(tmpFile)
			return fmt.Errorf("%w: expected %s, got %s", ErrChecksumMismatch, job.Checksum, computedSum)
		}

		// 5. Atomic commit: rename temp file to target destination
		_ = os.Remove(job.DestPath) // Replace existing if present
		if err := os.Rename(tmpFile, job.DestPath); err != nil {
			_ = os.Remove(tmpFile)
			return fmt.Errorf("atomic rename failed: %w", err)
		}

		// Preserve modification time if available
		if srcStat, err := os.Stat(job.SourcePath); err == nil {
			_ = os.Chtimes(job.DestPath, srcStat.ModTime(), srcStat.ModTime())
		}

		e.log.Debug("mirror: synchronized file atomically", "dest", job.DestPath, "bytes", copied, "sha256", computedSum)
		return nil

	default:
		return fmt.Errorf("unsupported mirror op: %s", job.Op)
	}
}

// Stats returns the real-time status and health metrics.
func (e *MirrorEngine) Stats() MirrorStats {
	e.mu.RLock()
	defer e.mu.RUnlock()

	stats := MirrorStats{
		Enabled:            e.enabled,
		SourceRoot:         e.sourceRoot,
		DestinationRoot:    e.destRoot,
		LastSuccessfulSync: e.lastSync,
		LastError:          e.lastError,
	}

	for _, j := range e.jobs {
		switch j.State {
		case JobPending, JobRetrying:
			stats.PendingTasks++
			stats.BytesPending += j.SizeBytes
		case JobRunning:
			stats.RunningTasks++
			stats.BytesPending += j.SizeBytes
		case JobCompleted:
			stats.CompletedTasks++
		case JobFailed:
			stats.FailedTasks++
		}
	}

	online := e.isDestinationOnlineLocked()
	switch {
	case !e.enabled:
		stats.Status = StatusPending
	case !online:
		stats.Status = StatusOffline
	case stats.FailedTasks > 0:
		stats.Status = StatusDegraded
	case stats.RunningTasks > 0:
		stats.Status = StatusSyncing
	case stats.PendingTasks > 0:
		stats.Status = StatusPending
	default:
		stats.Status = StatusHealthy
	}

	return stats
}

func (e *MirrorEngine) recoverInterruptedJobs() {
	e.mu.Lock()
	defer e.mu.Unlock()

	changed := false
	for _, j := range e.jobs {
		if j.State == JobRunning {
			j.State = JobPending
			j.UpdatedAt = time.Now()
			changed = true
		}
	}
	if changed {
		_ = e.saveQueueLocked()
	}
}

func (e *MirrorEngine) loadQueue() error {
	data, err := os.ReadFile(e.queueFile)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}

	var loaded []*MirrorJob
	if err := json.Unmarshal(data, &loaded); err != nil {
		return err
	}

	e.jobs = loaded
	return nil
}

func (e *MirrorEngine) saveQueueLocked() error {
	data, err := json.MarshalIndent(e.jobs, "", "  ")
	if err != nil {
		return err
	}

	tmpFile := e.queueFile + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmpFile, e.queueFile)
}
