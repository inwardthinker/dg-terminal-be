#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const MODE = process.argv[2] ?? 'history';
const USER_ID = process.env.USER_ID ?? '1';
const WALLET =
  process.env.WALLET ?? '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72';
const PERIOD = process.env.PERIOD ?? '30d';
const POSITION_ID = process.env.POSITION_ID ?? 'asset-id';
const CLOSE_TYPE = process.env.CLOSE_TYPE ?? 'full';
const PERCENTAGE = Number(process.env.PERCENTAGE ?? '50');

function printUsage() {
  console.log('Usage:');
  console.log('  node scripts/invoke-portfolio-endpoint.js history');
  console.log('  node scripts/invoke-portfolio-endpoint.js close');
  console.log('  node scripts/invoke-portfolio-endpoint.js kpis');
}

async function main() {
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Mode: ${MODE}`);

  if (MODE === 'history') {
    const url = `${BASE_URL}/api/portfolio/history?userId=${encodeURIComponent(USER_ID)}&period=${encodeURIComponent(PERIOD)}`;
    const res = await fetch(url);
    const body = await res.text();
    console.log(body);
    return;
  }

  if (MODE === 'close') {
    const payload =
      CLOSE_TYPE === 'partial'
        ? { type: 'partial', percentage: PERCENTAGE }
        : { type: 'full' };
    const url = `${BASE_URL}/api/portfolio/positions/${encodeURIComponent(POSITION_ID)}/close?userId=${encodeURIComponent(USER_ID)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    console.log(body);
    return;
  }

  if (MODE === 'kpis') {
    const url = `${BASE_URL}/api/portfolio/kpis?wallet=${encodeURIComponent(WALLET)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: process.env.AUTHORIZATION ?? 'local-dev-token',
      },
    });
    const body = await res.text();
    console.log(body);
    return;
  }

  console.error(`Unknown mode: ${MODE}`);
  printUsage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    `Failed to invoke endpoint: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
