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

  const runSafe = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[${name}] failed`, error);
    }
  };

  const loopTimers = new Set<NodeJS.Timeout>();

  const startRecurringLoop = (
    name: string,
    intervalMs: number,
    fn: () => Promise<void>,
  ): void => {
    let stopped = false;

    const runOnce = async () => {
      if (stopped) return;
      const startedAt = Date.now();
      await runSafe(name, fn);
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs > intervalMs) {
        // eslint-disable-next-line no-console
        console.warn(
          `[${name}] cycle took ${elapsedMs}ms (>${intervalMs}ms interval); running again immediately`,
        );
      }
      const delay = Math.max(0, intervalMs - elapsedMs);
      const timer = setTimeout(() => {
        loopTimers.delete(timer);
        void runOnce();
      }, delay);
      loopTimers.add(timer);
    };

    void runOnce();

    process.on('SIGTERM', () => {
      stopped = true;
    });
    process.on('SIGINT', () => {
      stopped = true;
    });
  };

  await runSafe('loop-a-initial', () => runLoopA(db, api));
  await runSafe('loop-b-initial', () => runLoopB(db, api));
  await runSafe('loop-c-initial', () => runLoopC(db, api));
  await runSafe('loop-d-initial', () => runLoopD(db, api));

  startRecurringLoop('loop-a', config.intervalsMs.loopA, () =>
    runLoopA(db, api),
  );
  startRecurringLoop('loop-b', config.intervalsMs.loopB, () =>
    runLoopB(db, api),
  );
  startRecurringLoop('loop-c', config.intervalsMs.loopC, () =>
    runLoopC(db, api),
  );
  startRecurringLoop('loop-d', config.intervalsMs.loopD, () =>
    runLoopD(db, api),
  );

  const ws = startWsLoop(config, db);

  const shutdown = async () => {
    loopTimers.forEach((timer) => clearTimeout(timer));
    loopTimers.clear();
    ws.close();
    await db.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void bootstrap();
