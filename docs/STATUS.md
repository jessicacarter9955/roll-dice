# Delivery status

Working code and verified provider integrations are different. This first browser delivery is not a production certification.

## Code changes · 2026-11-04

- Crew lifecycle (join/leave, transfer ownership, remove members, rotate invite and delete) and moderator account suspension/restoration with audit were merged into `main`. Suspensions revoke live sessions, socket tickets and room participation.
- Self-service personal data export and account deletion/anonymization have automated server tests. Historical snapshots/backups and real-life privacy/legal acceptance are still separate tasks; this does **not** certify end-to-end GDPR compliance.
- API suite expanded to 15 tests, including irreversible deletion while a room is active, coin settlement, retained-game pseudonymization and post-restart verification. Live media and real provider SMS deliveries are not exercised by these offline tests.
- A separate development-only, local SMS provider stub exercises Twilio-compatible request/verify, incorrect and accepted codes, phone account recovery, per-phone request throttling that survives a restart, and the daily limit. It sends no SMS and does not certify real delivery.
- The earlier crew/moderation PR passed Web/Flutter, Android debug, iOS unsigned and Playwright software-WebGL CI. New account-deletion UI must pass its own CI before merge.

## Autonomous verification update · 2026-11-03

| Area | Web | Android / iOS | Still missing |
|---|---|---|---|
| Rendering | Cloud browser could load Flutter and navigate to practice, but its GPU has **WebGL disabled**. Explicit original-artwork error screen now replaces infinite spinner. Optional software-WebGL Playwright CI checks 320/393/430px after push. | Native app builds via GitHub Actions; no physical device available | Actual GPU screenshot and touch acceptance against reference |
| Gameplay | Node engine simulates 100 full matches; Flutter practice 30 full eight-player matches; API integration tests 8 actual HTTP users, two WebSocket clients, turn race/409, player privacy, catch, payout-once and reconnect | Logic shared with web; real OS input not verified | Real-device touch test and server soak test |
| Accounts | Guest review sessions persist through real server stop/restart in integration test, SMS stays unconfigured | Secure native session storage compiled in CI | Real phone SMS delivery and security review |
| Video | Token verifier tests watcher vs player media grants, stranger denied | LiveKit client compiles | Live media server and multi-camera test with physical clients |
| Clips | Playwright captures a ~10-second canvas recording; H.264 MP4 is selected only when explicitly supported, otherwise downloads a correctly labelled WebM | WebView recording/sharing not validated | Real Instagram/TikTok app handoff, MP4 compatibility/transcoding on unsupported devices |
| Moderation | `/admin/` portal can review reports and suspend/restore accounts with audit trail; tests cover unauthorized access, session revocation and in-progress game forfeiture | Available via hosted API in browser | Production moderator operation, appeals procedures and abuse-case acceptance |
| Persistence | Online WAL snapshot with `VACUUM INTO`, integrity verification and backup/restore-copy drill passed in temporary CI data | Same backend | Paid durable deployment, off-site backups, disaster restore drill |
| Infrastructure | GitHub Pages already live. `render.yaml` ready for approval; no Render resources purchased. | Debug APK and unsigned iOS build available | Explicit paid-plan authorization, SMS/video keys, store accounts/signing |

This distinction matters: automatic token generation and browser recordings are **not** proof of a functioning real-world LiveKit call or native social-app sharing.

| Area | Implemented | Still required |
|---|---|---|
| Flutter web | Portrait phone preview; 3D table fills the available game viewport; room/players/chat/video are floating controls or sheets, without permanent header or player strip | Real-phone browser/device matrix and visual acceptance against the supplied screenshot |
| ZIP rendering | Actual Three.js/Cannon board, wood, pirate artwork, dice, sound, original settings/dock/result presentation; portrait camera; byte hashes guarded for all artwork and sound | Re-open the original ZIP on the Windows workstation for independent byte comparison, low-end GPU/performance tests, commercial asset rights |
| Game | Liar’s Dice v1; 2–8 seats; bid/catch/reveal/elimination; offline bots | Acceptance of selected house rules |
| Online authority | Authenticated REST, WebSocket snapshots, hidden dice, turn validation, deadlines/grace period, SQLite room persistence | Hosted deployment, load/soak/restart testing |
| Coins | 1,000 starting free coins; fixed entry; transactional deduction and one-time payout | Account farming prevention, support/abuse tooling |
| SMS | Twilio Verify adapter, consent/verification UI, durable HMAC phone throttling and local provider-stub tests; no production bypass or default OTP | Company credentials and real delivery/failure tests; other SMS providers not yet integrated |
| Video/watchers | LiveKit Flutter adapter; player publishing/watcher subscription tokens; cameras/mics off by default; video removal and old token revocation on leave/block | Credentials; 8-person real video/network tests; provider revocation tests |
| Profiles/search/privacy | Unique username, bio, search, private profiles, symmetric room-entry blocks | Rename propagation in existing tables; complete existing-call block behavior |
| Chat/reactions/history | Durable bounded messages, spam limits, reactions, catch history and dice reveals; abuse reports with rate limits; `/admin/` account suspension/restoration | Appeals procedures, production retention policy and moderator operation |
| Crews/invites/rematches | Create/join/list/leave/delete crew, transfer owner, remove members, rotate codes, invite-only tables, rematch consent | Further host departure UX and real multi-device acceptance |
| Clips | Browser records/downloads 10 seconds of the table canvas and presents the OS Web Share chooser for the file where supported | Not a rolling replay buffer; social targets/MP4 support vary; native WebView capture and TikTok/Instagram acceptance require device tests |
| Limits | Persisted UTC server usage/caps; configurable settings; practice session timer | Visible connected reminders and cross-device practice accounting |
| GoDice | Experimental community-MIT BLE scanner, five D6 connections, stable rolls/battery and optionally a complete unopened offline-practice hand | Hardware verification, server-trusted roll protocol, manufacturer commercial authorization |
| Native | Android/iOS shells, camera/mic/BLE permissions, hosted ZIP WebView with correctly sourced JavaScript events, secure session storage | Real-device visual/gameplay/capture verification, signing, store publishing |
| API hosting | Render Blueprint for one authoritative Node instance with persistent SQLite disk; WAL-safe snapshot/verification utility and tested restart/reconnect | Approval of paid compute/disk, credentials, deployed/restart/restore tests and independent off-site copies |
| Media hosting | Local LiveKit dev Compose and production VM guidance | Public UDP/TURN/TLS media node or LiveKit Cloud |
| CI | Pinned SDK and committed dependency lock, Flutter/Node tests, web artifact/Pages; new Android and unsigned iOS compile jobs | Verify current Actions outcomes |

The detailed prototype and 3-phase spec were not supplied. No claim is made that selected rules match that unseen material. Later-phase leaderboards, events, geofencing, sweepstakes and money modes are not implemented or enabled.

Production blockers also include backup retention and handling of deletion requests for suspended accounts, moderator support operations, security review, observability, fraud controls, off-site backup retention and restore drills. The SQLite implementation supports one authoritative server instance. Horizontal scaling needs shared storage/room ownership, not independent replicas.

Review accounts and bots are disabled by `NODE_ENV=production`. Do not expose a review server as a production service.

## Portrait table acceptance

- While playing, the `GameTable` iframe is the full game viewport, behind only the small back/seat/menu controls. Do not bring back a permanent Flutter player rail, chat toolbar or duplicate table artwork.
- The original archive's image selector, sound toggle, shake setting, dice meshes, wood/marble/gold table and game dock are all in `web/table/`; they must remain the visible game. All existing room/video/chat functions are reached from the floating controls.
- The archive files in `web/table/src/images/` and `web/table/src/sfx/` are **not** to be resized, recompressed or replaced. `server/test/assets.test.mjs` guards their current checksums.
- A real WebGL-enabled mobile browser is still required for visual sign-off. A browser without WebGL can show the loader, but cannot validate the Three.js view.
