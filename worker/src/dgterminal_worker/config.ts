import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotEnv } from 'dotenv';

export type WorkerConfig = {
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  polymarket: {
    dataApiBaseUrl: string;
    gammaBaseUrl: string;
    clobWsUrl: string;
  };
  intervalsMs: {
    loopA: number;
    loopB: number;
    loopC: number;
    loopD: number;
  };
};

const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '.env'),
  resolve(__dirname, '..', '..', '..', '..', '.env'),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    loadDotEnv({ path: envPath, override: false });
    break;
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function loadConfig(): WorkerConfig {
  return {
    db: {
      host: required('db_hostname'),
      port: Number.parseInt(process.env.db_port ?? '5432', 10),
      database: required('db_name'),
      user: required('db_username'),
      password: required('db_password'),
    },
    polymarket: {
      dataApiBaseUrl:
        process.env.POLYMARKET_DATA_API_BASE_URL ??
        'https://data-api.polymarket.com',
      gammaBaseUrl:
        process.env.POLYMARKET_GAMMA_BASE_URL ??
        'https://gamma-api.polymarket.com',
      clobWsUrl:
        process.env.POLYMARKET_CLOB_WS_URL ??
        'wss://ws-subscriptions-clob.polymarket.com/ws/market',
    },
    intervalsMs: {
      loopA: Number.parseInt(process.env.WORKER_LOOP_A_MS ?? '10000', 10),
      loopB: Number.parseInt(process.env.WORKER_LOOP_B_MS ?? '30000', 10),
      loopC: Number.parseInt(process.env.WORKER_LOOP_C_MS ?? '60000', 10),
      loopD: Number.parseInt(process.env.WORKER_LOOP_D_MS ?? '300000', 10),
    },
  };
}
