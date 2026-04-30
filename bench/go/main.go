package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

type Config struct {
	BaseURL      string            `json:"baseUrl"`
	EndpointPath string            `json:"endpointPath"`
	WalletQuery  string            `json:"walletQueryParam"`
	Wallet       string            `json:"wallet"`
	Query        map[string]string `json:"query"`
	Headers      map[string]string `json:"headers"`
	Requests     int               `json:"requests"`
	Warmup       int               `json:"warmupRequests"`
	Concurrency  int               `json:"concurrency"`
	TimeoutMs    int               `json:"timeoutMs"`
}

type RequestResult struct {
	OK        bool
	StatusKey string
	LatencyMs float64
}

type Metrics struct {
	Min float64 `json:"min"`
	P50 float64 `json:"p50"`
	P90 float64 `json:"p90"`
	P95 float64 `json:"p95"`
	P99 float64 `json:"p99"`
	Max float64 `json:"max"`
	Avg float64 `json:"avg"`
}

type Output struct {
	Language      string         `json:"language"`
	Round         int            `json:"round"`
	StartedAt     string         `json:"startedAt"`
	FinishedAt    string         `json:"finishedAt"`
	Endpoint      string         `json:"endpoint"`
	TotalRequests int            `json:"totalRequests"`
	Warmup        int            `json:"warmupRequests"`
	Concurrency   int            `json:"concurrency"`
	DurationMs    float64        `json:"durationMs"`
	ThroughputRps float64        `json:"throughputRps"`
	SuccessCount  int            `json:"successCount"`
	ErrorCount    int            `json:"errorCount"`
	StatusCounts  map[string]int `json:"statusCounts"`
	MetricsMs     Metrics        `json:"metricsMs"`
	LatenciesMs   []float64      `json:"latenciesMs"`
}

func parseRoundArg() int {
	for i := 0; i < len(os.Args); i++ {
		if os.Args[i] == "--round" && i+1 < len(os.Args) {
			v, err := strconv.Atoi(os.Args[i+1])
			if err == nil && v > 0 {
				return v
			}
		}
	}
	return 1
}

func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(math.Ceil((p/100.0)*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}

func runBatch(totalRequests int, concurrency int, requestFn func() RequestResult, collectLatencies bool) (int, int, []float64, map[string]int) {
	var next int64
	var success int64
	var errors int64
	statusCounts := map[string]int{}
	latencies := make([]float64, 0, totalRequests)
	var statusMu sync.Mutex
	var latMu sync.Mutex
	var wg sync.WaitGroup

	worker := func() {
		defer wg.Done()
		for {
			index := int(atomic.AddInt64(&next, 1)) - 1
			if index >= totalRequests {
				return
			}
			res := requestFn()
			if res.OK {
				atomic.AddInt64(&success, 1)
			} else {
				atomic.AddInt64(&errors, 1)
			}
			statusMu.Lock()
			statusCounts[res.StatusKey] = statusCounts[res.StatusKey] + 1
			statusMu.Unlock()
			if collectLatencies {
				latMu.Lock()
				latencies = append(latencies, res.LatencyMs)
				latMu.Unlock()
			}
		}
	}

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go worker()
	}
	wg.Wait()

	return int(success), int(errors), latencies, statusCounts
}

func main() {
	round := parseRoundArg()
	benchRoot, _ := filepath.Abs(filepath.Join(".", ".."))
	configPath := filepath.Join(benchRoot, "config.json")
	configRaw, err := os.ReadFile(configPath)
	if err != nil {
		panic(err)
	}

	var cfg Config
	if err := json.Unmarshal(configRaw, &cfg); err != nil {
		panic(err)
	}

	values := url.Values{}
	walletParam := cfg.WalletQuery
	if walletParam == "" {
		walletParam = "wallet"
	}
	values.Set(walletParam, cfg.Wallet)
	values.Set("period", cfg.Query["period"])
	values.Set("per_page", cfg.Query["per_page"])
	targetURL := fmt.Sprintf("%s%s?%s", cfg.BaseURL, cfg.EndpointPath, values.Encode())

	client := &http.Client{
		Transport: &http.Transport{
			MaxIdleConns:        cfg.Concurrency * 4,
			MaxIdleConnsPerHost: cfg.Concurrency * 4,
			IdleConnTimeout:     90 * time.Second,
		},
	}

	requestFn := func() RequestResult {
		start := time.Now()
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(cfg.TimeoutMs)*time.Millisecond)
		defer cancel()

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
		if err != nil {
			return RequestResult{OK: false, StatusKey: "ERR", LatencyMs: float64(time.Since(start).Microseconds()) / 1000.0}
		}
		for key, value := range cfg.Headers {
			req.Header.Set(key, value)
		}
		resp, err := client.Do(req)
		if err != nil {
			return RequestResult{OK: false, StatusKey: "ERR", LatencyMs: float64(time.Since(start).Microseconds()) / 1000.0}
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
		return RequestResult{
			OK:        resp.StatusCode >= 200 && resp.StatusCode < 300,
			StatusKey: strconv.Itoa(resp.StatusCode),
			LatencyMs: float64(time.Since(start).Microseconds()) / 1000.0,
		}
	}

	_, _, _, _ = runBatch(cfg.Warmup, cfg.Concurrency, requestFn, false)

	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	batchStart := time.Now()
	success, errors, latencies, statusCounts := runBatch(cfg.Requests, cfg.Concurrency, requestFn, true)
	durationMs := float64(time.Since(batchStart).Microseconds()) / 1000.0
	finishedAt := time.Now().UTC().Format(time.RFC3339Nano)

	sort.Float64s(latencies)
	sum := 0.0
	for _, v := range latencies {
		sum += v
	}
	avg := 0.0
	if len(latencies) > 0 {
		avg = sum / float64(len(latencies))
	}

	out := Output{
		Language:      "go",
		Round:         round,
		StartedAt:     startedAt,
		FinishedAt:    finishedAt,
		Endpoint:      cfg.EndpointPath,
		TotalRequests: cfg.Requests,
		Warmup:        cfg.Warmup,
		Concurrency:   cfg.Concurrency,
		DurationMs:    durationMs,
		ThroughputRps: float64(cfg.Requests) / (durationMs / 1000.0),
		SuccessCount:  success,
		ErrorCount:    errors,
		StatusCounts:  statusCounts,
		MetricsMs: Metrics{
			Min: func() float64 {
				if len(latencies) == 0 {
					return 0
				}
				return latencies[0]
			}(),
			P50: percentile(latencies, 50),
			P90: percentile(latencies, 90),
			P95: percentile(latencies, 95),
			P99: percentile(latencies, 99),
			Max: func() float64 {
				if len(latencies) == 0 {
					return 0
				}
				return latencies[len(latencies)-1]
			}(),
			Avg: avg,
		},
		LatenciesMs: latencies,
	}

	resultsDir := filepath.Join(benchRoot, "results")
	if err := os.MkdirAll(resultsDir, 0o755); err != nil {
		panic(err)
	}
	outFile := filepath.Join(resultsDir, fmt.Sprintf("go-round-%d.json", round))

	encoded, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		panic(err)
	}
	if err := os.WriteFile(outFile, append(encoded, '\n'), 0o644); err != nil {
		panic(err)
	}

	short := map[string]any{
		"language":  out.Language,
		"round":     out.Round,
		"durationMs": math.Round(out.DurationMs*100) / 100,
		"p95Ms":      math.Round(out.MetricsMs.P95*100) / 100,
		"errorCount": out.ErrorCount,
	}
	shortBytes, _ := json.MarshalIndent(short, "", "  ")
	fmt.Println(string(shortBytes))
}
