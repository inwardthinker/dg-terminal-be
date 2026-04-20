import { loadConfig } from './config';
import { WorkerDb } from './db';
import { runLoopA } from './loops/loop-a';
import { runLoopB } from './loops/loop-b';
import { runLoopC } from './loops/loop-c';
import { runLoopD } from './loops/loop-d';
import { startWsLoop } from './loops/loop-ws';
import { PolymarketDataApi } from './polymarket';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const db = new WorkerDb(config);
  const api = new PolymarketDataApi(config);

  const runningLoops = new Set<string>();

  const runSafe = async (name: string, fn: () => Promise<void>) => {
    if (runningLoops.has(name)) {
      // eslint-disable-next-line no-console
      console.warn(`[${name}] skipped: previous execution still running`);
      return;
    }

    runningLoops.add(name);
    try {
      await fn();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[${name}] failed`, error);
    } finally {
      runningLoops.delete(name);
    }
  };

  await runSafe('loop-a-initial', () => runLoopA(db, api));
  await runSafe('loop-b-initial', () => runLoopB(db, api));
  await runSafe('loop-c-initial', () => runLoopC(db, api));
  await runSafe('loop-d-initial', () => runLoopD(db, api));

  setInterval(() => {
    void runSafe('loop-a', () => runLoopA(db, api));
  }, config.intervalsMs.loopA);

  setInterval(() => {
    void runSafe('loop-b', () => runLoopB(db, api));
  }, config.intervalsMs.loopB);

  setInterval(() => {
    void runSafe('loop-c', () => runLoopC(db, api));
  }, config.intervalsMs.loopC);

  setInterval(() => {
    void runSafe('loop-d', () => runLoopD(db, api));
  }, config.intervalsMs.loopD);

  const ws = startWsLoop(config, db);

  const shutdown = async () => {
    ws.close();
    await db.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void bootstrap();
