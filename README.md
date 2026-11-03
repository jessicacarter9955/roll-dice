# Street Circle · Roll Dice

Flutter web first, with a portrait phone preview and a Node.js authoritative Liar’s Dice server. The original 3D table, dice, textures, sounds and translucent controls from the supplied `rolldice.zip` are reused. Gameplay controls are adapted for Liar’s Dice. Physics is visual; it never decides an online hand or wallet settlement.

**This is the first working web implementation, not production-complete Phase 1.** [Delivery status](docs/STATUS.md) records the remaining provider and physical-device work.

## Play

Open the [web preview](https://jessicacarter9955.github.io/roll-dice/) and choose **Play a practice round**. Bots are labelled. Practice does not change the wallet and works without an API server. The table retains the ZIP’s wood, artwork, gold frame, dice racks, volume/art/shake buttons, control dock and result window, with its camera turned into portrait.

GitHub Actions installs pinned Flutter automatically, runs checks/tests and builds the client. No local Flutter installation is needed to build through GitHub. The `street-circle-web` artifact is downloadable from each successful build. GitHub Pages serves the client and practice; **it does not run the Node game service, SMS or video**.

## Run a connected review locally

```sh
flutter pub get
flutter build web --release --no-web-resources-cdn
cd server
npm ci
npm start
```

Open http://localhost:8787. Create a review account, create a table and share its invite code. Use another browser profile for a second user, or add practice bots on the local review server. Development review accounts are distinct from verified SMS accounts and are disabled by `NODE_ENV=production`.

For hot reload use `flutter run -d chrome --dart-define=API_URL=http://localhost:8787` with the API in a second terminal. On a phone, localhost means that phone; use a reachable HTTPS service instead.

## Services

Copy `.env.example` to `.env` at repository root. Never commit credentials.

- Twilio Verify: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`. The adapter verifies real provider codes; no default/fake OTP exists.
- LiveKit: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Seated users receive publishing grants, watchers subscription-only grants. Camera/mic start off.
- Runtime: Node 22.13+ (CI pins 22.23.1), one server instance, durable SQLite in `DATA_DIR`. Multiple independent replicas are not supported.
- Hosted API: set HTTPS `PUBLIC_ORIGIN` to the client’s origin (e.g. `https://jessicacarter9955.github.io`, without a path), set `NODE_ENV=production` and `ALLOW_GUESTS=false`, use TLS and persistent storage. Remaining production blockers still apply.

To connect the Pages client, set repository Actions variable `API_URL` before building, or use **You → Game service connection**. That service needs its own deployment; it is not supplied by Pages.

## Check

```sh
flutter analyze
flutter test
cd server
npm ci
npm run check
npm test
```

Tests cover turn/bid validation, dice privacy, catches, elimination, forfeiture, atomic settlement and duplicate requests. The Node engine simulates 100 complete matches; Flutter practice simulates 30 eight-player matches. The API test uses a temporary database and never sends SMS or contacts LiveKit.

## Mobile and ownership

The repository includes Android/iOS Flutter project shells and video permission descriptions. Native builds and physical-device verification remain open. The native table WebView accepts `--dart-define=TABLE_URL=https://your-client/table/index.html`. GoDice BLE, secure native session storage, signing and native social sharing are unfinished.

All source is in this user-controlled repository. No third-party project accounts were created. ZIP art/audio commercial rights need confirmation; see [asset provenance](docs/ASSETS.md).

Read the [selected game rules](docs/RULES.md), [manual test guide](docs/MANUAL_TEST.md) and [delivery status](docs/STATUS.md).
