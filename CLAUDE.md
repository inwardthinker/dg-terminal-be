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
# API (NestJS) — run from repo root
npm run start:dev        # watch mode
npm run start:prod       # run compiled output (node dist/main)
npm run build            # compile to dist/
npm test                 # jest unit tests (rootDir: src/, *.spec.ts)
npm run test:watch
npm run test:cov
npm run test:e2e         # jest --config ./test/jest-e2e.json
npx jest src/portfolio/portfolio.service.spec.ts   # single file
npm run lint             # eslint --fix
npm run format           # prettier --write
npm run git:sanitize     # scripts/git-sanitize-check.sh

# Worker (standalone package) — run from ./worker
cd worker
npm run start:dev        # tsx src/dgterminal_worker/main.ts
npm run build            # tsc -> dist/
npm run start            # node dist/dgterminal_worker/main.js
npm test                 # tsx --test src/**/*.test.ts (node:test runner)
```

## Architecture

**dg-terminal-be** has two runtime processes sharing one Postgres database:

1. **API** (`src/`) — a NestJS HTTP + Socket.IO server that serves `/api/portfolio/*` endpoints and a `/positions-prices` WebSocket namespace. Portfolio positions, closed positions, and summary are read from Postgres. Trades are a thin passthrough to the Polymarket Data API.
2. **Worker** (`worker/`) — an independent Node process (own `package.json`, `tsconfig.json`, `node_modules`) that polls the Polymarket Data API on recurring intervals and writes normalized rows into shared tables. Not a Nest app — plain `tsx`/`ts` entry at `worker/src/dgterminal_worker/main.ts`.

The API never calls Polymarket for positions/closed-positions/summary data — those endpoints query Postgres tables the worker populates. The trades endpoint is the only portfolio path that still proxies live to Polymarket.

### API module layout

```
AppModule
├── ConfigModule (global)        # @nestjs/config
├── DatabaseModule (global)      # provides PG_POOL (pg.Pool)
├── PortfolioModule              # HTTP endpoints (DB-backed + trades passthrough)
└── PositionsModule              # Socket.IO gateway streaming live prices
```

- `DatabaseModule` (`src/database/`) is `@Global()`. It exposes the `PG_POOL` symbol — an already-initialized `pg.Pool` configured from `db_hostname` / `db_port` / `db_name` / `db_username` / `db_password`. `ssl.rejectUnauthorized` is `false`; pool size 10.
- No ORM. Repositories take `Pool` via `@Inject(PG_POOL)` and write raw SQL.

### Portfolio endpoints

All under `/api/portfolio`, all guarded by `PortfolioAuthHeaderGuard` (see Auth).

| Route                   | Source                    | Query params                                                                                                               | Returns                     |
| ----------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `GET /positions`        | `positions` table         | `wallet` (required EVM), `sort_by?`, `sort_dir?`                                                                           | `{ positions: […] }`        |
| `GET /closed-positions` | `trade_history` table     | `wallet`, `sort_by?`, `sort_dir?`, `limit?` (1–500, default 30), `offset?`                                                 | `{ closed_positions: […] }` |
| `GET /summary`          | `portfolio_summary` table | `safe_wallet_address` (required EVM)                                                                                       | `{ summary: {…} }`          |
| `GET /trades`           | Polymarket `/trades`      | `wallet`, `period?` ∈ `1d`/`7d`/`30d`/`all`, `page?`, `per_page?` (1–500, default 25), `sort_by?`, `sort_dir?`, `outcome?` | `{ trades: <passthrough> }` |

Wallet is a required `0x` + 40 hex regex. Invalid/missing wallet → `400` via `ValidationPipe`. Missing/empty `Authorization` header → `401` via guard.

All four service methods wrap the repository call in try/catch and return an empty/zeroed fallback shape on error (see `src/portfolio/portfolio.service.ts`). Errors are swallowed — they do not surface as 5xx.

#### Read paths into Postgres

- **`PortfolioPositionsRepository`** reads `positions`. Default ordering groups by category (summed `cost_basis` desc) then by row `cost_basis` desc. Explicit `sort_by` maps DTO field → DB column via `POSITION_SORT_COLUMN_MAP` (e.g. `outcome_token_id` → `asset`, `exposure` → `current_value`). Unknown `sort_by` returns `[]`.
- **`PortfolioClosedPositionsRepository`** reads `trade_history`. Default orders by category (summed `realized_pnl` desc) then `realized_pnl` desc. `sort_by`=`end_date` and `closed_at` both map to `trade_time`. `realized_pnl_pct` is sorted via a CASE expression. `limit`/`offset` default to 30/0.
- **`PortfolioSummaryRepository`** aggregates `portfolio_summary` rows for a wallet with `COALESCE(SUM(...), 0)` over five numeric fields; derives `rewards_pct_of_pnl` and `deployment_rate_pct`; returns `null` when no rows (service converts to zeroed DTO).
- **`PortfolioTradesRepository`** is the only repo that is NOT DB-backed — it `fetch`es `GET {POLYMARKET_DATA_API_URL}/trades?...`, forwards `user`, `per_page` (default `25`), and any of `page`/`period`/`sort_by`/`sort_dir`/`outcome` when set. Throws on non-2xx; service catches and returns `{ trades: [] }`.

### Positions WebSocket (live price stream)

- Namespace: `/positions-prices` (Socket.IO, `@WebSocketGateway` in `src/positions/positions.gateway.ts`).
- Auth: client must supply `userAddress` (or `walletAddress`) either in Socket.IO `auth` payload or query — must match `/^0x[a-fA-F0-9]{40}$/`. Invalid → server emits `error` then disconnects.
- On connect, `PositionsPriceService.subscribeUser`:
  1. Fetches open positions from Polymarket Data API (`GET /positions?user=…&sizeThreshold=0&limit=500`) via `PolymarketDataService`.
  2. Emits an initial snapshot per position (using cached venue price or Polymarket `curPrice` fallback, `stale: true` if unknown).
  3. Starts a `setInterval` snapshot emitter every `POSITIONS_EMIT_INTERVAL_MS` (default 5000 ms).
  4. Subscribes to `PolymarketMarketStreamService` — a singleton WebSocket client to `POLYMARKET_MARKET_WS_URL` — which pushes `{ assetId, currentPrice, stale }` updates as Polymarket publishes them. Reconnect uses exponential backoff capped at 16 s.
- Emitted event name: `position_price`, shape `PositionPriceEvent` (`src/positions/positions.types.ts`). Frontend consumer docs: `WEBSOCKET_FRONTEND_INTEGRATION.md`.

### Worker package (`worker/`)

Standalone process that writes into the same Postgres. Entry: `worker/src/dgterminal_worker/main.ts`. Own `pg.Pool` (not the Nest `PG_POOL`).

Four scheduled loops plus a persistent market WebSocket:

| Loop | Default interval (env override) | Responsibility                                                | Writes                                                                            |
| ---- | ------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| A    | `WORKER_LOOP_A_MS` = 10 000 ms  | Per-wallet balance snapshot from Polymarket                   | `portfolio_summary.balance` (+ `balance_last_updated`)                            |
| B    | `WORKER_LOOP_B_MS` = 30 000 ms  | Full-replace open positions; recompute open exposure          | `positions` (upsert + prune), `portfolio_summary.open_exposure`, `unrealized_pnl` |
| C    | `WORKER_LOOP_C_MS` = 60 000 ms  | Rewards earned per wallet (via `rewards.ts`)                  | `portfolio_summary.rewards_earned`                                                |
| D    | `WORKER_LOOP_D_MS` = 300 000 ms | Closed trades (`trade_history`) + rolling 30-day realized PnL | `trade_history` (upsert), `portfolio_summary.realized_30d`                        |
| WS   | persistent                      | Polymarket market WebSocket fan-in                            | (in-memory price cache consumed by other loops)                                   |

- Loop scheduler uses `setTimeout` chained on completion — NOT `setInterval` — so a slow cycle does not overlap itself. Main logs a warning if a cycle exceeds its target interval.
- `WorkerDb.upsertPositions` / `upsertTradeHistory` use deadlock-safe retries and sort rows by `(wallet, asset)` before transactional inserts to keep lock ordering stable.
- The worker discovers wallets from the `users` table (`id`, `safe_wallet_address`) — wallets are registered upstream; the worker does not create them.
- `polymarket.ts` wraps Data API HTTP access; `mappers.ts` normalizes camelCase payloads into the snake_case column set.
- Worker has its own test runner: `npm test` in `worker/` uses `tsx --test` (node:test), not Jest. Tests live alongside source as `*.test.ts`.

### Database schema (tables in use)

Not managed by an ORM. The app treats these tables as given; the worker writes them.

| Table               | Key columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Used by                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `users`             | `id`, `safe_wallet_address`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Worker (wallet discovery)                                          |
| `positions`         | PK `(safe_wallet_address, asset)`; plus `condition_id`, `market_name`, `category`, `shares`, `avg_entry_price`, `cost_basis`, `current_price`, `unrealized_pnl`, `unrealized_pnl_pct`, `current_value`, `initial_value`, `end_date`, `redeemable`, `mergeable`, `negative_risk`, `percent_pnl`, `event_id`, `event_slug`, `outcome_index`, `opposite_outcome`, `opposite_asset`, `total_bought`, `realized_pnl`, `percent_realized_pnl`, `fair_value`, `fair_value_updated_at`, `last_rest_sync`, `last_updated`, `updated_at`, `slug`, `icon`, `user_id`, `venue`, `side` | Worker loop B (write); `PortfolioPositionsRepository` (read)       |
| `trade_history`     | `safe_wallet_address`, `asset`, `condition_id`, `market_name`, `category`, `venue`, `side`, `shares`, `entry_price`, `exit_price`, `cost_basis`, `realized_pnl`, `trade_time`, `event_id`, `event_slug`, `outcome_index`, `opposite_outcome`, `opposite_asset`, `slug`, `icon`                                                                                                                                                                                                                                                                                             | Worker loop D (write); `PortfolioClosedPositionsRepository` (read) |
| `portfolio_summary` | `safe_wallet_address`, `balance`, `open_exposure`, `unrealized_pnl`, `realized_30d`, `rewards_earned`, plus `*_last_updated` timestamps                                                                                                                                                                                                                                                                                                                                                                                                                                    | Worker loops A/B/C/D (write); `PortfolioSummaryRepository` (read)  |

There is no in-repo migrations directory. `package.json` declares `db:migrate` → `node scripts/run-sql-migration.js migrations`, but that script is not currently tracked; schema provisioning is handled outside the repo.

### Auth

`PortfolioAuthHeaderGuard` (`src/portfolio/guards/`) only checks that `Authorization` is a non-empty string. It does **not** validate the token value — authentication is expected to be enforced upstream (e.g. API gateway). WebSocket auth is handled separately by `PositionsGateway.extractUserAddress` (EVM-address check on `auth`/`query` handshake payload).

### Express 5 / `express-mongo-sanitize` compatibility

Default `mongoSanitize()` assigns `req.query`, which throws on Express 5 (`req.query` is read-only). `main.ts` uses a `mongoSanitizeCompatibleWithExpress5()` wrapper that sanitizes `body`, `params`, and `headers` only — query strings are validated by `ValidationPipe` on DTOs.

## Environment Variables

Copy `.env.example` to `.env`. The API, worker, and Socket.IO gateway share the same `.env` file.

### Shared — Postgres (lowercase keys)

| Variable      | Notes          |
| ------------- | -------------- |
| `db_hostname` | Postgres host  |
| `db_port`     | default `5432` |
| `db_name`     |                |
| `db_username` |                |
| `db_password` |                |

### API

| Variable                                         | Default                                                | Notes                                                       |
| ------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------- |
| `PORT`                                           | `3000`                                                 |                                                             |
| `POLYMARKET_DATA_API_URL`                        | `https://data-api.polymarket.com`                      | Used by positions WS fetch and portfolio trades passthrough |
| `POLYMARKET_DATA_API_AUTH_HEADER_NAME`           | (unset)                                                | Optional outbound auth header name                          |
| `POLYMARKET_DATA_API_AUTH_HEADER_VALUE`          | (unset)                                                | Optional outbound auth header value                         |
| `POLYMARKET_MARKET_WS_URL`                       | `wss://ws-subscriptions-clob.polymarket.com/ws/market` | Live price stream                                           |
| `POLYMARKET_MARKET_WS_AUTH_HEADER_NAME`/`_VALUE` | (unset)                                                | Optional WS auth headers                                    |
| `POSITIONS_EMIT_INTERVAL_MS`                     | `5000`                                                 | Periodic snapshot cadence for `position_price`              |

### Worker

| Variable                       | Default                                                | Notes                                                                            |
| ------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `POLYMARKET_DATA_API_BASE_URL` | `https://data-api.polymarket.com`                      | Worker uses the `_BASE_URL` name (distinct from API's `POLYMARKET_DATA_API_URL`) |
| `POLYMARKET_GAMMA_BASE_URL`    | `https://gamma-api.polymarket.com`                     | Market metadata                                                                  |
| `POLYMARKET_CLOB_WS_URL`       | `wss://ws-subscriptions-clob.polymarket.com/ws/market` | Persistent WS loop                                                               |
| `WORKER_LOOP_A_MS`             | `10000`                                                | Balance snapshot                                                                 |
| `WORKER_LOOP_B_MS`             | `30000`                                                | Open positions                                                                   |
| `WORKER_LOOP_C_MS`             | `60000`                                                | Rewards                                                                          |
| `WORKER_LOOP_D_MS`             | `300000`                                               | Closed trades + realized 30d                                                     |

Note the inconsistency: API reads `POLYMARKET_DATA_API_URL`; worker reads `POLYMARKET_DATA_API_BASE_URL`. If consolidating, update both `src/portfolio/repositories/portfolio-trades.repository.ts` and `src/positions/polymarket-data.service.ts` alongside `worker/src/dgterminal_worker/config.ts`.

## Testing Conventions

- **API unit tests** live alongside source as `*.spec.ts` under `src/` (Jest, `rootDir: src/`).
- **API e2e tests** live in `test/` with subdirs per module (`test/portfolio/`, `test/positions/`). Config: `test/jest-e2e.json`.
- **E2E must manually install the same `ValidationPipe` config** as `main.ts` — Nest does not apply global pipes automatically in test modules. See `test/portfolio/portfolio-positions.e2e-spec.ts` for the canonical setup.
- **Mocking repositories**: instantiate `PortfolioService` with `Pick<…, 'findByWallet'>`-typed mocks rather than full class instances. See existing tests in `src/portfolio/portfolio.service.spec.ts`.
- **Mocking the DB pool**: pass a `{ query: jest.fn() }` object cast as `never` into `new PortfolioPositionsRepository(pool as never)`. See `src/portfolio/repositories/portfolio-repositories.spec.ts`.
- **Mocking outbound HTTP (trades)**: `jest.spyOn(global, 'fetch').mockResolvedValue(...)`. Remember to `mockRestore()` when done.
- **Worker tests** use `node:test` via `tsx --test`, not Jest. Do not mix Jest matchers/mocks into `worker/**/*.test.ts`.
