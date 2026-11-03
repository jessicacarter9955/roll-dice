# LiveKit media deployment

The app already uses LiveKit for real-time voice/video and spectators. The
server generates short-lived per-table access tokens; seated users publish,
watchers subscribe only. The provider can be LiveKit Cloud **or a self-hosted
LiveKit server** without changing the Flutter client.

## Local media verification (no external account)

Run from the repository root on a workstation with Docker:

```sh
docker compose -f infra/livekit/compose.dev.yaml up -d
```

The local-only media server listens on `ws://localhost:7880`, with the LiveKit
development credentials `devkey` / `secret`. These credentials are **not** for
public environments. In a local `.env` (never commit it), set:

```dotenv
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

The phone must be able to reach the media server over the LAN. An emulator's
`localhost` and a physical phone's `localhost` are not the host computer.

## Production

Follow the [official LiveKit VM deployment guide](https://docs.livekit.io/transport/self-hosting/vm/)
and [connectivity requirements](https://docs.livekit.io/transport/self-hosting/deployment/).
An internet-facing media node needs a real domain, trusted TLS, reachable
WebRTC UDP/TCP ports and TURN/TLS; production Redis is recommended. A standard
Render web service is **not a substitute** for this media path. Use a dedicated
VM/network setup or LiveKit Cloud, then set `LIVEKIT_URL` (wss), `LIVEKIT_API_KEY`
and `LIVEKIT_API_SECRET` in the API service's secret settings. Confirm at least
eight real streams plus watcher subscriptions from separate devices/networks.

No LiveKit cloud account or billable media VM was created by this repository.
