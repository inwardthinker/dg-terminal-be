# Frontend WebSocket Integration (Positions Prices)

This backend exposes a Socket.IO gateway for live position pricing updates.

## Endpoint

- Base backend URL: `http://localhost:3000` (or your deployed API URL)
- Socket namespace: `/positions-prices`
- Full Socket.IO URL example: `http://localhost:3000/positions-prices`

## Transport/Protocol

- The server uses **Socket.IO**, not raw WebSocket frames.
- Frontend should use `socket.io-client` (v4+ recommended).

## Authentication Contract

Connection is accepted only if `handshake.auth.userAddress` is present and valid.

- Required key: `auth.userAddress`
- Format: EVM address (`0x` + 40 hex chars)
- Address is normalized to lowercase on backend

If missing/invalid:

- Server emits `error` with `{ message: "Authentication required" }`
- Server disconnects the client

## Server Events

### `subscribed`

Emitted once after successful connection:

```json
{
  "user": "0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72"
}
```

### `position_price`

Emitted for initial snapshots and live updates.

Payload shape:

```ts
type PositionPriceEvent = {
  position_id: string;
  outcome: string | null;
  title: string | null;
  avg_price: number | null;
  current_price: number | null;
  position_value: number | null;
  pnl_amount: number | null;
  pnl_percent: number | null;
  stale: boolean;
};
```

Notes:

- `stale: true` means market price is unavailable/stale at that moment.
- When `stale: true`, price/pnl fields may be `null`.
- Initial events can arrive immediately after connect.
- Backend now emits periodic snapshots at a fixed cadence even when upstream has no new ticks.

## Frontend Example (TypeScript/React)

Install client:

```bash
npm i socket.io-client
```

Minimal integration:

```ts
import { io, Socket } from 'socket.io-client';

type PositionPriceEvent = {
  position_id: string;
  outcome: string | null;
  title: string | null;
  avg_price: number | null;
  current_price: number | null;
  position_value: number | null;
  pnl_amount: number | null;
  pnl_percent: number | null;
  stale: boolean;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export function connectPositionsPriceSocket(userAddress: string): Socket {
  const socket = io(`${API_BASE_URL}/positions-prices`, {
    transports: ['websocket'],
    auth: {
      userAddress, // must be valid 0x... address
    },
  });

  socket.on('connect', () => {
    console.log('positions socket connected', socket.id);
  });

  socket.on('subscribed', (payload: { user: string }) => {
    console.log('subscribed', payload);
  });

  socket.on('position_price', (event: PositionPriceEvent) => {
    // Update UI state/store here
    console.log('position_price', event);
  });

  socket.on('error', (err: { message?: string }) => {
    console.error('socket error event', err);
  });

  socket.on('disconnect', (reason) => {
    console.log('positions socket disconnected', reason);
  });

  return socket;
}
```

React usage pattern:

```ts
import { useEffect } from 'react';

useEffect(() => {
  if (!userAddress) return;

  const socket = connectPositionsPriceSocket(userAddress.toLowerCase());
  return () => socket.disconnect();
}, [userAddress]);
```

## Quick Troubleshooting

- Not connecting: confirm frontend uses `socket.io-client`, not native `WebSocket`.
- Immediate disconnect: verify `auth.userAddress` exists and matches EVM format.
- CORS issues: gateway currently allows `origin: "*"`, but check any proxy/load-balancer config.
- No `position_price` events: user may have no open positions, or upstream market data may be stale.
- Cadence too slow: set `POSITIONS_EMIT_INTERVAL_MS` on backend (default `5000`) and restart service.
