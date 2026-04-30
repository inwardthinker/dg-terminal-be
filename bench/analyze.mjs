import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resultsDir = path.join(__dirname, "results");

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function round2(n) {
  return Number(n.toFixed(2));
}

function summarizeLanguage(records) {
  const allLatencies = records.flatMap((r) => r.latenciesMs || []).sort((a, b) => a - b);
  const totalRequests = records.reduce((sum, r) => sum + (r.totalRequests || 0), 0);
  const totalErrors = records.reduce((sum, r) => sum + (r.errorCount || 0), 0);
  const totalDurationMs = records.reduce((sum, r) => sum + (r.durationMs || 0), 0);
  const avg =
    allLatencies.length > 0
      ? allLatencies.reduce((sum, value) => sum + value, 0) / allLatencies.length
      : 0;

  return {
    rounds: records.length,
    totalRequests,
    errorRatePct: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
    throughputRps: totalDurationMs > 0 ? totalRequests / (totalDurationMs / 1000) : 0,
    metricsMs: {
      min: allLatencies[0] ?? 0,
      p50: percentile(allLatencies, 50),
      p90: percentile(allLatencies, 90),
      p95: percentile(allLatencies, 95),
      p99: percentile(allLatencies, 99),
      max: allLatencies[allLatencies.length - 1] ?? 0,
      avg,
    },
  };
}

async function main() {
  await mkdir(resultsDir, { recursive: true });
  const files = await readdir(resultsDir);
  const jsonFiles = files.filter(
    (file) => file.endsWith(".json") && /^(node|go|rust)-round-\d+\.json$/.test(file),
  );

  const grouped = { node: [], go: [], rust: [] };
  for (const file of jsonFiles) {
    const raw = await readFile(path.join(resultsDir, file), "utf8");
    const parsed = JSON.parse(raw);
    if (grouped[parsed.language]) grouped[parsed.language].push(parsed);
  }

  const summary = {};
  for (const language of ["node", "go", "rust"]) {
    summary[language] = summarizeLanguage(grouped[language]);
  }

  const sortedByP95 = Object.entries(summary)
    .filter(([, data]) => data.rounds > 0)
    .sort((a, b) => a[1].metricsMs.p95 - b[1].metricsMs.p95);

  const fastest = sortedByP95[0]?.[0] || "n/a";
  const markdown = [
    "# Trades Endpoint Benchmark Report",
    "",
    `Fastest by p95 latency: **${fastest}**`,
    "",
    "| Language | Rounds | Requests | Error % | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | RPS |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...["node", "go", "rust"].map((language) => {
      const row = summary[language];
      return `| ${language} | ${row.rounds} | ${row.totalRequests} | ${round2(row.errorRatePct)} | ${round2(
        row.metricsMs.avg,
      )} | ${round2(row.metricsMs.p50)} | ${round2(row.metricsMs.p95)} | ${round2(
        row.metricsMs.p99,
      )} | ${round2(row.throughputRps)} |`;
    }),
    "",
  ].join("\n");

  await writeFile(
    path.join(resultsDir, "summary.json"),
    `${JSON.stringify({ summary, fastestByP95: fastest }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(path.join(resultsDir, "report.md"), markdown, "utf8");
  console.log(markdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
