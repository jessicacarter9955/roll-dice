# Delivery status

Working code and verified provider integrations are different. This first browser delivery is not a production certification.

| Area | Implemented | Still required |
|---|---|---|
| Flutter web | Portrait phone preview; 3D table fills the available game viewport; room/players/chat/video are floating controls or sheets, without permanent header or player strip | Real-phone browser/device matrix and visual acceptance against the supplied screenshot |
| ZIP rendering | Actual Three.js/Cannon board, wood, pirate artwork, dice, sound, original settings/dock/result presentation; portrait camera; byte hashes guarded for all artwork and sound | Re-open the original ZIP on the Windows workstation for independent byte comparison, low-end GPU/performance tests, commercial asset rights |
| Game | Liar’s Dice v1; 2–8 seats; bid/catch/reveal/elimination; offline bots | Acceptance of selected house rules |
| Online authority | Authenticated REST, WebSocket snapshots, hidden dice, turn validation, deadlines/grace period, SQLite room persistence | Hosted deployment, load/soak/restart testing |
| Coins | 1,000 starting free coins; fixed entry; transactional deduction and one-time payout | Account farming prevention, support/abuse tooling |
| SMS | Twilio Verify adapter, consent/verification UI; no fake OTP | Company credentials and real delivery/failure tests; other SMS providers not yet integrated |
| Video/watchers | LiveKit Flutter adapter; player publishing/watcher subscription tokens; cameras/mics off by default; video removal and old token revocation on leave/block | Credentials; 8-person real video/network tests; provider revocation tests |
| Profiles/search/privacy | Unique username, bio, search, private profiles, symmetric room-entry blocks | Rename propagation in existing tables; complete existing-call block behavior |
| Chat/reactions/history | Durable bounded messages, spam limits, reactions, catch history and dice reveals; abuse reports with rate limits | Moderator review/enforcement tooling, production retention policy |
| Crews/invites/rematches | Create/join/list crew, invite-only tables, shared codes, rematch consent | Crew leave/delete/ownership/moderation; further host departure UX |
| Clips | Browser records/exports 10 seconds of table canvas | Not a rolling replay buffer; no direct TikTok/Instagram publishing; native capture/share and consent policies |
| Limits | Persisted UTC server usage/caps; configurable settings; practice session timer | Visible connected reminders and cross-device practice accounting |
| GoDice | Experimental community-MIT BLE scanner, up to five D6 connections, stable roll values, battery and platform permissions | Hardware verification, server-trusted roll protocol, manufacturer commercial authorization |
| Native | Android/iOS shells, camera/mic/BLE permissions, hosted table WebView, secure session storage | Native CI/device verification, signing, sharing and stores |
| API hosting | Render Blueprint for one authoritative Node instance with persistent SQLite disk | Approval of paid compute/disk, credentials, deployment/restart/restore tests |
| Media hosting | Local LiveKit dev Compose and production VM guidance | Public UDP/TURN/TLS media node or LiveKit Cloud |
| CI | Pinned SDK, Flutter/Node tests, web artifact/Pages; new Android and unsigned iOS compile jobs | Verify current Actions outcomes and commit new resolved lockfile |

The detailed prototype and 3-phase spec were not supplied. No claim is made that selected rules match that unseen material. Later-phase leaderboards, events, geofencing, sweepstakes and money modes are not implemented or enabled.

Production blockers also include account deletion/export, moderator tooling/support, security review, full session/token revocation, observability, fraud controls, backed-up persistent storage and restore drills. The SQLite implementation supports one authoritative server instance. Horizontal scaling needs shared storage/room ownership, not independent replicas.

Review accounts and bots are disabled by `NODE_ENV=production`. Do not expose a review server as a production service.

## Portrait table acceptance

- While playing, the `GameTable` iframe is the full game viewport, behind only the small back/seat/menu controls. Do not bring back a permanent Flutter player rail, chat toolbar or duplicate table artwork.
- The original archive's image selector, sound toggle, shake setting, dice meshes, wood/marble/gold table and game dock are all in `web/table/`; they must remain the visible game. All existing room/video/chat functions are reached from the floating controls.
- The archive files in `web/table/src/images/` and `web/table/src/sfx/` are **not** to be resized, recompressed or replaced. `server/test/assets.test.mjs` guards their current checksums.
- A real WebGL-enabled mobile browser is still required for visual sign-off. A browser without WebGL can show the loader, but cannot validate the Three.js view.
