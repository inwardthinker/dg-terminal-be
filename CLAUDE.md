# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `list_communities` (detail_level="minimal") + `list_graph_stats` — **NEVER use `get_architecture_overview` (exceeds token limit on large repos)**

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool                                        | Use when                                                |
| ------------------------------------------- | ------------------------------------------------------- |
| `detect_changes`                            | Reviewing code changes — gives risk-scored analysis     |
| `get_review_context`                        | Need source snippets for review — token-efficient       |
| `get_impact_radius`                         | Understanding blast radius of a change                  |
| `get_affected_flows`                        | Finding which execution paths are impacted              |
| `query_graph`                               | Tracing callers, callees, imports, tests, dependencies  |
| `semantic_search_nodes`                     | Finding functions/classes by name or keyword            |
| `list_communities` (detail_level="minimal") | High-level codebase structure — safe token size         |
| `get_community`                             | Drill into a specific community's members               |
| ~~`get_architecture_overview`~~             | **BANNED** — output exceeds token limits on large repos |
| `refactor_tool`                             | Planning renames, finding dead code                     |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

---

## Commands

```bash
# Development
npm run start:dev        # watch mode (recommended)
npm run start:prod       # run compiled output

# Build
npm run build            # compile to dist/

# Test
npm test                 # unit tests (rootDir: src/, *.spec.ts)
npm run test:watch       # watch mode
npm run test:cov         # with coverage
npm run test:e2e         # e2e tests (test/jest-e2e.json)

# Run a single test file
npx jest src/portfolio/portfolio.service.spec.ts

# Lint / Format
npm run lint             # eslint --fix
npm run format           # prettier --write

# Git safety check
npm run git:sanitize
```

## Architecture

**dg-terminal-be** is a NestJS backend that proxies Polymarket prediction market data into a normalized portfolio positions API. It has no database — all data is fetched live from the Polymarket CLOB REST API and Gamma API on each request.

### Module layout

```
AppModule
├── ConfigModule (global)           # @nestjs/config, reads .env
├── PolymarketClientModule (global) # Polymarket SDK + HTTP client
└── PortfolioModule                 # Portfolio positions endpoint
```

**PolymarketClientModule** (`src/polymarket/`) is `@Global()`. It registers `ClobClient` (from `@polymarket/clob-client`) as an injection token `CLOB_CLIENT` via a factory provider. During Jest runs (`JEST_WORKER_ID` is set), the factory returns a plain stub `{ host }` instead of instantiating the real SDK — this avoids ESM import issues with the Polymarket package.

**PortfolioModule** (`src/portfolio/`) exposes two REST endpoints:

```
GET /api/portfolio/positions
  Headers: Authorization: <any non-empty string>
  Query:   wallet    — required EVM address (0x + 40 hex chars); missing/invalid → 400
           sort_by?  — any key of PortfolioPositionResponseDto
           sort_dir? — 'asc' | 'desc'

GET /api/portfolio/closed-positions
  Headers: Authorization: <any non-empty string>
  Query:   wallet    — required EVM address; missing/invalid → 400
           sort_by?  — any key of PortfolioClosedPositionResponseDto
           sort_dir? — 'asc' | 'desc'
           limit?    — integer 1–500, default 30
           offset?   — integer ≥ 0, default 0
```

### Data sources

| Surface                 | Env var                        | Default                            | Notes                                                                                     |
| ----------------------- | ------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| Open + closed positions | `POLYMARKET_DATA_API_BASE_URL` | `https://data-api.polymarket.com`  | Primary source; matches web app behavior                                                  |
| Category enrichment     | `POLYMARKET_GAMMA_BASE_URL`    | `https://gamma-api.polymarket.com` | Market metadata fallback                                                                  |
| CLOB SDK                | `POLYMARKET_BASE_URL`          | `https://clob.polymarket.com`      | `ClobClient` registered for **future** trading flows; not used for portfolio list queries |

### Open positions pipeline

Raw Polymarket Data API response → `PolymarketClientService.getOpenPositions()`:

1. **Fetch** `GET /positions?user=<wallet>&sortBy=CURRENT&sortDirection=DESC&sizeThreshold=0.1&limit=100&offset=0` from `POLYMARKET_DATA_API_BASE_URL`
2. **Normalize** via `toRawPosition()` — aliases many Data API camelCase fields (`title`/`market`, `conditionId`, `curPrice`, `initialValue`, `currentValue`, `cashPnl`, etc.) into `PolymarketRawPosition`
3. **Enrich categories** via `enrichCategoriesForAssets()` — single batch `GET /markets?condition_ids=id1,id2,...` (up to 25 per chunk, 8s timeout); falls back to slug/event_slug Gamma lookup (5s timeout) for anything unresolved after batch; in-memory cache per condition id across all requests
4. **Filter** — drops rows with `size <= 0` or `cur_price <= 0`
5. **Map** via `mapPolymarketPosition()` — when `initial_value` + `current_value` present, uses Data API metrics directly for `cost_basis`/`exposure`/`unrealized_pnl`; else derives from `shares × prices`; guards division by zero
6. **Filter again** — drops positions where `shares <= 0`
7. **Sort** via `sortPortfolioPositions()`:
   - `sort_by` set: sort by that field; `sort_dir` defaults to `desc`
   - Default: group by category (total exposure desc), then by row `exposure` desc within category

### Closed positions pipeline

`PolymarketClientService.getClosedPositions()`:

1. **Fetch** `GET /closed-positions?user=<wallet>&sortBy=realizedpnl&sortDirection=DESC&limit=<n>&offset=<n>` from `POLYMARKET_DATA_API_BASE_URL`
2. **Normalize** via `toRawClosedPosition()` — maps `totalBought` → `size`, `realizedPnl`, `timestamp` (unix seconds), `endDate`, etc.
3. **Enrich categories** — same `enrichCategoriesForAssets()` as open positions
4. **Filter** — drops rows with `size <= 0`
5. **Map** via `mapPolymarketClosedPosition()` — `cost_basis = totalBought × avgPrice`; `realized_pnl_pct = realized_pnl / cost_basis`; `closed_at` = unix timestamp → ISO 8601
6. **Filter** — drops positions where `shares <= 0`
7. **Sort** via `sortClosedPortfolioPositions()`:
   - `sort_by` set: sort by field; `sort_dir` defaults to `desc`
   - Default: group by category (total realized PnL desc), then by row `realized_pnl` desc within category

### Response DTO shapes

**`PortfolioPositionResponseDto`** (open positions):

- Core: `market_name`, `category`, `venue`, `side`, `avg_entry_price`, `current_price`, `shares`, `cost_basis`, `unrealized_pnl`, `unrealized_pnl_pct` (ratio, e.g. `1.56` = +156%), `exposure`
- Passthroughs: `condition_id`, `outcome_token_id`, `proxy_wallet`, `slug`, `icon`, `event_id`, `event_slug`, `outcome_index`, `opposite_outcome`, `opposite_asset`, `end_date`, `redeemable`, `mergeable`, `negative_risk`, `total_bought`, `realized_pnl`, `percent_realized_pnl`, `initial_value`, `current_value`, `percent_pnl`
- Note: `percent_pnl` is display-oriented (e.g. `156.41`) from the Data API — **not** the same scale as `unrealized_pnl_pct`

**`PortfolioClosedPositionResponseDto`** (closed positions):

- Core: `market_name`, `category`, `venue`, `side`, `avg_entry_price`, `current_price`, `shares`, `cost_basis`, `realized_pnl`, `realized_pnl_pct`, `end_date`, `closed_at`
- Passthroughs: `condition_id`, `outcome_token_id`, `proxy_wallet`, `slug`, `icon`, `event_id`, `event_slug`, `outcome_index`, `opposite_outcome`, `opposite_asset`

`PortfolioPosition` and `PortfolioClosedPosition` are aliases for their respective response DTOs.

### Auth

`PortfolioAuthHeaderGuard` only checks that the `Authorization` header is a non-empty string. It does **not** validate the token value — authentication is expected to be enforced upstream (e.g. API gateway).

### Express 5 / `express-mongo-sanitize` compatibility

Default `mongoSanitize()` assigns `req.query`, which throws on Express 5 (`req.query` is read-only). `main.ts` uses a `mongoSanitizeCompatibleWithExpress5()` wrapper that sanitizes `body`, `params`, and `headers` only — query validation is handled by `ValidationPipe` on DTOs.

## Environment Variables

Copy `.env.example` to `.env`:

| Variable                       | Default                            | Notes                                            |
| ------------------------------ | ---------------------------------- | ------------------------------------------------ |
| `PORT`                         | `3000`                             |                                                  |
| `POLYMARKET_DATA_API_BASE_URL` | `https://data-api.polymarket.com`  | Primary source for portfolio list queries        |
| `POLYMARKET_BASE_URL`          | `https://clob.polymarket.com`      | CLOB SDK host; reserved for future trading flows |
| `POLYMARKET_GAMMA_BASE_URL`    | `https://gamma-api.polymarket.com` | Category enrichment                              |
| `POLYMARKET_API_KEY`           | —                                  | Optional; for authenticated CLOB SDK calls       |
| `POLYMARKET_SECRET`            | —                                  | Optional                                         |
| `POLYMARKET_PASSPHRASE`        | —                                  | Optional                                         |

`ClobClient` is instantiated without credentials if any of the three auth vars are missing. There is no `POLYMARKET_MAKER_ADDRESS` — wallet is always a required query param.

## Testing Conventions

- **Unit tests** live alongside source files as `*.spec.ts` in `src/`
- **E2E tests** live in `test/` and use `supertest` against a full `AppModule`
- E2E tests must manually apply the same `ValidationPipe` config used in `main.ts` (NestJS does not apply global pipes automatically in test modules)
- To mock `PolymarketClientService` in unit tests, instantiate it with a partial mock object typed as `Pick<PolymarketClientService, 'getOpenPositions'>` — do not mock `ClobClient` directly
- The `JEST_WORKER_ID` guard in `PolymarketClientModule` means E2E tests get a stub client; both `getOpenPositions` and `getClosedPositions` return `[]` unless `PolymarketClientService` is mocked at the service layer
