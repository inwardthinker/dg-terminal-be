import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const benchRoot = path.resolve(__dirname, "..");

function parseRoundArg() {
  const roundIndex = process.argv.indexOf("--round");
  if (roundIndex === -1 || !process.argv[roundIndex + 1]) return 1;
  const parsed = Number.parseInt(process.argv[roundIndex + 1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

async function runBatch({
  totalRequests,
  concurrency,
  requestFn,
  collectLatencies,
}) {
  let cursor = 0;
  let successCount = 0;
  let errorCount = 0;
  const latenciesMs = [];
  const statusCounts = {};

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= totalRequests) return;
      const res = await requestFn();
      if (collectLatencies) latenciesMs.push(res.latencyMs);
      if (res.ok) {
        successCount += 1;
      } else {
        errorCount += 1;
      }
      statusCounts[res.statusKey] = (statusCounts[res.statusKey] || 0) + 1;
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { successCount, errorCount, latenciesMs, statusCounts };
}

async function main() {
  const round = parseRoundArg();
  const configRaw = await readFile(path.join(benchRoot, "config.json"), "utf8");
  const config = JSON.parse(configRaw);

  const qs = new URLSearchParams({
    [config.walletQueryParam || "wallet"]: config.wallet,
    period: config.query.period,
    per_page: config.query.per_page,
  });
  const url = `${config.baseUrl}${config.endpointPath}?${qs.toString()}`;

  const timeoutMs = Number(config.timeoutMs);
  const doRequest = async () => {
    const start = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: config.headers ?? {},
        signal: controller.signal,
      });
      await response.arrayBuffer();
      const end = performance.now();
      return {
        ok: response.ok,
        statusKey: String(response.status),
        latencyMs: end - start,
      };
    } catch {
      const end = performance.now();
      return { ok: false, statusKey: "ERR", latencyMs: end - start };
    } finally {
      clearTimeout(timeout);
    }
  };

  await runBatch({
    totalRequests: Number(config.warmupRequests),
    concurrency: Number(config.concurrency),
    requestFn: doRequest,
    collectLatencies: false,
  });

  const startedAt = new Date().toISOString();
  const batchStart = performance.now();
  const measured = await runBatch({
    totalRequests: Number(config.requests),
    concurrency: Number(config.concurrency),
    requestFn: doRequest,
    collectLatencies: true,
  });
  const batchEnd = performance.now();
  const finishedAt = new Date().toISOString();

  const sorted = [...measured.latenciesMs].sort((a, b) => a - b);
  const durationMs = batchEnd - batchStart;
  const payload = {
    language: "node",
    round,
    startedAt,
    finishedAt,
    endpoint: config.endpointPath,
    totalRequests: Number(config.requests),
    warmupRequests: Number(config.warmupRequests),
    concurrency: Number(config.concurrency),
    durationMs,
    throughputRps: Number(config.requests) / (durationMs / 1000),
    successCount: measured.successCount,
    errorCount: measured.errorCount,
    statusCounts: measured.statusCounts,
    metricsMs: {
      min: sorted[0] ?? 0,
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted[sorted.length - 1] ?? 0,
      avg: sorted.length
        ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length
        : 0,
    },
    latenciesMs: sorted,
  };

  const resultsDir = path.join(benchRoot, "results");
  await mkdir(resultsDir, { recursive: true });
  const outFile = path.join(resultsDir, `node-round-${round}.json`);
  await writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        language: payload.language,
        round: payload.round,
        durationMs: Number(payload.durationMs.toFixed(2)),
        p95Ms: Number(payload.metricsMs.p95.toFixed(2)),
        errorCount: payload.errorCount,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
