use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

#[derive(Debug, Deserialize)]
struct Config {
    #[serde(rename = "baseUrl")]
    base_url: String,
    #[serde(rename = "endpointPath")]
    endpoint_path: String,
    #[serde(rename = "walletQueryParam")]
    wallet_query_param: Option<String>,
    wallet: String,
    query: HashMap<String, String>,
    headers: HashMap<String, String>,
    requests: usize,
    #[serde(rename = "warmupRequests")]
    warmup_requests: usize,
    concurrency: usize,
    #[serde(rename = "timeoutMs")]
    timeout_ms: u64,
}

#[derive(Clone)]
struct RequestResult {
    ok: bool,
    status_key: String,
    latency_ms: f64,
}

#[derive(Debug, Serialize)]
struct Metrics {
    min: f64,
    p50: f64,
    p90: f64,
    p95: f64,
    p99: f64,
    max: f64,
    avg: f64,
}

#[derive(Debug, Serialize)]
struct Output {
    language: String,
    round: usize,
    #[serde(rename = "startedAt")]
    started_at: String,
    #[serde(rename = "finishedAt")]
    finished_at: String,
    endpoint: String,
    #[serde(rename = "totalRequests")]
    total_requests: usize,
    #[serde(rename = "warmupRequests")]
    warmup_requests: usize,
    concurrency: usize,
    #[serde(rename = "durationMs")]
    duration_ms: f64,
    #[serde(rename = "throughputRps")]
    throughput_rps: f64,
    #[serde(rename = "successCount")]
    success_count: usize,
    #[serde(rename = "errorCount")]
    error_count: usize,
    #[serde(rename = "statusCounts")]
    status_counts: HashMap<String, usize>,
    #[serde(rename = "metricsMs")]
    metrics_ms: Metrics,
    #[serde(rename = "latenciesMs")]
    latencies_ms: Vec<f64>,
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((p / 100.0) * sorted.len() as f64).ceil() as isize - 1;
    let bounded = idx.max(0).min(sorted.len() as isize - 1) as usize;
    sorted[bounded]
}

fn parse_round() -> usize {
    let args: Vec<String> = std::env::args().collect();
    if let Some(idx) = args.iter().position(|arg| arg == "--round") {
        if let Some(value) = args.get(idx + 1) {
            if let Ok(parsed) = value.parse::<usize>() {
                if parsed > 0 {
                    return parsed;
                }
            }
        }
    }
    1
}

async fn run_batch(
    total_requests: usize,
    concurrency: usize,
    request_fn: Arc<dyn Fn() -> tokio::task::JoinHandle<RequestResult> + Send + Sync>,
    collect_latencies: bool,
) -> (usize, usize, Vec<f64>, HashMap<String, usize>) {
    let next = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let success = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let errors = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let status_counts = Arc::new(Mutex::new(HashMap::<String, usize>::new()));
    let latencies = Arc::new(Mutex::new(Vec::<f64>::with_capacity(total_requests)));

    let mut workers = Vec::with_capacity(concurrency);
    for _ in 0..concurrency {
        let next = Arc::clone(&next);
        let success = Arc::clone(&success);
        let errors = Arc::clone(&errors);
        let status_counts = Arc::clone(&status_counts);
        let latencies = Arc::clone(&latencies);
        let request_fn = Arc::clone(&request_fn);
        workers.push(tokio::spawn(async move {
            loop {
                let index = next.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                if index >= total_requests {
                    return;
                }
                let handle = request_fn();
                let result = match handle.await {
                    Ok(v) => v,
                    Err(_) => RequestResult {
                        ok: false,
                        status_key: "ERR".to_string(),
                        latency_ms: 0.0,
                    },
                };
                if result.ok {
                    success.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                } else {
                    errors.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                }
                {
                    let mut guard = status_counts.lock().await;
                    *guard.entry(result.status_key).or_insert(0) += 1;
                }
                if collect_latencies {
                    let mut guard = latencies.lock().await;
                    guard.push(result.latency_ms);
                }
            }
        }));
    }

    for worker in workers {
        let _ = worker.await;
    }

    let latencies_vec = latencies.lock().await.clone();
    let status_map = status_counts.lock().await.clone();
    (
        success.load(std::sync::atomic::Ordering::SeqCst),
        errors.load(std::sync::atomic::Ordering::SeqCst),
        latencies_vec,
        status_map,
    )
}

#[tokio::main]
async fn main() {
    let round = parse_round();
    let bench_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let config_path = bench_root.join("config.json");
    let raw = fs::read_to_string(config_path).expect("failed to read config");
    let cfg: Config = serde_json::from_str(&raw).expect("invalid config JSON");

    let period = cfg.query.get("period").cloned().unwrap_or_else(|| "1d".to_string());
    let per_page = cfg.query.get("per_page").cloned().unwrap_or_else(|| "25".to_string());
    let wallet_param = cfg
        .wallet_query_param
        .clone()
        .unwrap_or_else(|| "wallet".to_string());
    let url = format!(
        "{}{}?{}={}&period={}&per_page={}",
        cfg.base_url, cfg.endpoint_path, wallet_param, cfg.wallet, period, per_page
    );

    let client = Client::builder()
        .pool_max_idle_per_host(cfg.concurrency * 4)
        .timeout(Duration::from_millis(cfg.timeout_ms))
        .build()
        .expect("failed to build HTTP client");

    let shared_headers = Arc::new(cfg.headers.clone());
    let request_fn: Arc<dyn Fn() -> tokio::task::JoinHandle<RequestResult> + Send + Sync> = {
        let url = Arc::new(url);
        let client = Arc::new(client);
        let shared_headers = Arc::clone(&shared_headers);
        Arc::new(move || {
            let client = Arc::clone(&client);
            let url = Arc::clone(&url);
            let headers = Arc::clone(&shared_headers);
            tokio::spawn(async move {
                let start = Instant::now();
                let mut request = client.get(url.as_str());
                for (key, value) in headers.iter() {
                    request = request.header(key, value);
                }
                match request.send().await {
                    Ok(response) => {
                        let status = response.status();
                        let _ = response.bytes().await;
                        RequestResult {
                            ok: status.is_success(),
                            status_key: status.as_u16().to_string(),
                            latency_ms: start.elapsed().as_secs_f64() * 1000.0,
                        }
                    }
                    Err(_) => RequestResult {
                        ok: false,
                        status_key: "ERR".to_string(),
                        latency_ms: start.elapsed().as_secs_f64() * 1000.0,
                    },
                }
            })
        })
    };

    let _ = run_batch(
        cfg.warmup_requests,
        cfg.concurrency,
        Arc::clone(&request_fn),
        false,
    )
    .await;

    let started_at = chrono_like_timestamp();
    let run_start = Instant::now();
    let (success, errors, mut latencies, status_counts) = run_batch(
        cfg.requests,
        cfg.concurrency,
        Arc::clone(&request_fn),
        true,
    )
    .await;
    let duration_ms = run_start.elapsed().as_secs_f64() * 1000.0;
    let finished_at = chrono_like_timestamp();

    latencies.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let sum: f64 = latencies.iter().sum();
    let avg = if latencies.is_empty() {
        0.0
    } else {
        sum / latencies.len() as f64
    };

    let metrics = Metrics {
        min: *latencies.first().unwrap_or(&0.0),
        p50: percentile(&latencies, 50.0),
        p90: percentile(&latencies, 90.0),
        p95: percentile(&latencies, 95.0),
        p99: percentile(&latencies, 99.0),
        max: *latencies.last().unwrap_or(&0.0),
        avg,
    };

    let out = Output {
        language: "rust".to_string(),
        round,
        started_at,
        finished_at,
        endpoint: cfg.endpoint_path.clone(),
        total_requests: cfg.requests,
        warmup_requests: cfg.warmup_requests,
        concurrency: cfg.concurrency,
        duration_ms,
        throughput_rps: cfg.requests as f64 / (duration_ms / 1000.0),
        success_count: success,
        error_count: errors,
        status_counts,
        metrics_ms: metrics,
        latencies_ms: latencies,
    };

    let results_dir = bench_root.join("results");
    fs::create_dir_all(&results_dir).expect("failed to create results directory");
    let out_file = results_dir.join(format!("rust-round-{}.json", round));
    let out_text = serde_json::to_string_pretty(&out).expect("failed to encode output");
    fs::write(out_file, format!("{}\n", out_text)).expect("failed to write output file");

    let short = json!({
        "language": out.language,
        "round": out.round,
        "durationMs": (out.duration_ms * 100.0).round() / 100.0,
        "p95Ms": (out.metrics_ms.p95 * 100.0).round() / 100.0,
        "errorCount": out.error_count
    });
    println!("{}", serde_json::to_string_pretty(&short).unwrap_or_else(|_| "{}".to_string()));
}

fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format!("{}.{:09}Z", now.as_secs(), now.subsec_nanos())
}
