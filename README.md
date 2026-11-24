# Nutrition Assistant

Expo mobile app + Node.js/Express API. The `codex/app-100-percent` branch contains authenticated end-to-end patient/provider workflows; production use and real health data remain gated on configured services, verified migrations, qualified reviews and named operations owners.

## Repository layout

- `app/App.js` — Expo entry point.
- `app/src/` — feature-first mobile app: app shell, Supabase identity, assessment/consent, nutrition, diary/grocery, care/payment, chat, notifications, settings, personalization and medical records.
- `server/server.js` — Express API entry point.
- `server/src/` — authenticated account APIs, repositories, request middleware, catalog validation, domain services and provider adapters.
- `server/data/` — versioned demonstration catalog, source/license registry, meal templates and a synthetic import-only fixture.
- `server/scripts/import-food-catalog.js` — deterministic catalog validation/import and change-report CLI; it does not fetch or scrape sources.
- `server/tests/` — deterministic unit tests for nutrition and meal-planning logic; `server/server.test.js` contains API smoke tests.
- [`CAPABILITY-MAP.md`](CAPABILITY-MAP.md) — cross-issue module boundaries and implementation dependencies for GitHub issues #1–#5.
- [`spec/SPEC-full-app-v1.md`](spec/SPEC-full-app-v1.md) and [`spec/capability-map-full-app.md`](spec/capability-map-full-app.md) — complete patient/provider feature contract and module map.
- [`spec/SPEC-release-operations-v1.md`](spec/SPEC-release-operations-v1.md) — release, rollback, backup, support and external gate requirements.
- [`docs/security-and-operations.md`](docs/security-and-operations.md) — implemented controls, current risk review and deployment blockers.
- [`docs/runbooks/release-operations.md`](docs/runbooks/release-operations.md) — staged deployment, rollback, restore drill and incident response steps.
- `assets/design/ui-reference/` — supplied UI PNG references; implemented meal and dashboard screens use their visual direction.
- `docs/` — project presentation/requirements material.

## Run locally

Install dependencies once:

```powershell
npm ci
```

Expo SDK 58 requires Node.js 22.13+ on the 22.x line, 24.3+ on the 24.x line, or 26+. The CI workflow uses Node.js 22.

Terminal 1 (API):

```powershell
if (-not (Test-Path -LiteralPath 'server/.env')) { Copy-Item 'server/.env.example' 'server/.env' }
# Optional: enable synthetic, local demo diary and grocery persistence.
# $env:DEMO_DATA_ENABLED = 'true'
npm run api
```

Terminal 2 (Expo):

```powershell
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item '.env.example' '.env' }
# Edit .env and set EXPO_PUBLIC_API_URL for the target below.
npm start
```

The API reads `server/.env` when it exists; shell environment variables override values from that file. Its example keeps demo persistence disabled. The Expo app has no implicit `localhost` fallback. If `EXPO_PUBLIC_API_URL` is missing or invalid, the API client reports a configuration error before sending a request. Expo reads the root `.env`; restart Expo after changing it. `EXPO_PUBLIC_*` values are embedded in the client bundle, so do not put passwords, tokens, or other secrets there. See [Expo environment variables](https://docs.expo.dev/guides/environment-variables/).

### Choose the API URL for the app target

| Target | `EXPO_PUBLIC_API_URL` | Requirements |
|---|---|---|
| Expo Go on a physical phone | `http://<computer-LAN-IPv4>:4000` (example: `http://192.168.1.20:4000`) | Phone and computer on the same reachable LAN; allow inbound TCP port 4000 through the computer firewall. `localhost` on the phone means the phone itself. |
| Android Studio Emulator | `http://10.0.2.2:4000` | Android Emulator maps `10.0.2.2` to the host computer's loopback. Do not use it on a physical phone. [Android Emulator networking](https://developer.android.com/studio/run/emulator-networking-address). |
| iOS Simulator on the Mac running the API | `http://localhost:4000` | iOS Simulator runs on macOS. For a different API host, use its reachable LAN/VPN address instead. [Expo iOS Simulator](https://docs.expo.dev/workflow/ios-simulator/). |

The API listens on `0.0.0.0:4000` for development. On Windows, use `ipconfig` to find the computer's active LAN IPv4 address; make sure the phone is not on an isolated guest Wi-Fi network and that the firewall permits TCP 4000 on the private network. Expo's tunnel option only connects the Metro development server; it does not provide a backend API address. See [Expo CLI networking](https://docs.expo.dev/more/expo-cli/).

Verify the backend from the same device/emulator that runs the app by opening `http://<the-same-host>:4000/health` in its browser. The response should include `{"status":"ok"}`. This is process liveness only; it does not verify Supabase, provider services, or persistence. You can also check locally on the computer with `http://localhost:4000/health`.

### Troubleshooting startup and connectivity

| Symptom | What it points to | Check |
|---|---|---|
| `npm start` fails before showing the Expo QR code | Metro startup or local Node/dependency setup | Confirm the supported Node version above, run `npm ci`, and read the Metro terminal error. |
| Expo Go opens the project but the JavaScript bundle does not load | The phone cannot reach Metro | Check the Expo terminal and network mode. `npx expo start --tunnel` can diagnose Metro reachability; it does not tunnel the API. `npx expo start --clear` retries with a cleared Metro cache. |
| App loads, but API requests fail | API process, API URL, LAN, or firewall | Check the API terminal for startup/config errors. Call `http://localhost:4000/health` on the development computer, then open the same target-specific API host plus `/health` on the device. If the computer succeeds but the device fails, check `EXPO_PUBLIC_API_URL`, same-network access, and the firewall rule for TCP 4000. |
| `/health` works from the device, but a feature still fails | Route, request validation, response handling, or app logic | Check the API status/error code and the feature's expected `/api/v1` contract; run `npm run test:api`, `npm run test:unit`, or `npm run test:ui` for the relevant layer. Do not copy health data, headers, or credentials into logs or public issues. |

The API's startup validation prints the setting and requirement for invalid configuration without echoing supplied values. A successful `/health` response confirms only that the API process responds; it does not prove authentication, persistence durability, or production readiness.

### Local authenticated backend

The full account flows require a Supabase project. For synthetic local development, install the Supabase CLI and Docker Desktop, then run `supabase start`, `supabase db reset`, and `supabase test db` from the repository root. The checked-in [`supabase/config.toml`](supabase/config.toml) configures a local-only project; the CLI prints the local API URL and current publishable/secret keys. Copy the API URL and publishable key to `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the ignored root `.env`; copy the same URL, publishable key, and secret key to `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` in ignored `server/.env`. Keep the secret key server-only. Local verification emails are captured by the local Supabase mail service; no real email/SMS is sent. Use a reachable LAN host for the mobile app when needed, not the phone's `localhost`.

The local stack and keys are for synthetic development only. Never point the demo app at production health data or copy a production secret into local files.

Run deterministic business-logic tests with `npm run test:unit`, UI component tests with `npm run test:ui`, and backend API smoke tests with `npm run test:api`. CI also exports the Android JavaScript bundle, runs `npm audit --audit-level=high`, and has a separate Supabase job that starts a synthetic local stack, resets the checked-in migrations, and runs pgTAP. This checkout cannot run that job locally because Docker and the Supabase CLI are unavailable; the first hosted CI result is still required to confirm runtime migration/RLS behavior. Bundle export is not a physical-device test. Detailed routes and limitations are in [`server/README.md`](server/README.md). Supabase account identity, consent/profile, plans, diary/report, groceries, care, chat, records, notification state and personalization use private account APIs. PayOS hosted checkout, OpenAI Responses, Supabase private Storage, FDC and Expo Push have real adapters but require operator credentials and live sandbox checks. Account export and Auth deletion include registered data modules. Legacy namespaced diary and grocery routes remain for compatibility and are not called by signed-in screens. The app is not approved for real health information, clinical use or production until the external gates in the [release checklist](spec/SPEC-release-operations-v1.md) are complete.

### Development-only demo storage

The local JSON store is at `server/.local-data/demo-store.json` by default and is ignored by Git. Demo routes stay disabled until you explicitly set `DEMO_DATA_ENABLED=true` in `server/.env` or in the shell. Optionally set `DEMO_DATA_FILE` to choose another path. In PowerShell:

```powershell
$env:DEMO_DATA_ENABLED = 'true'
$env:DEMO_DATA_FILE = '.\server\.local-data\demo-store.json' # optional
npm run api
```

Remove the environment variable or set it to `false` to turn demo data off. `NODE_ENV=production` always disables demo data routes, even when the flag is true. The app keeps a demo namespace in SecureStore only for legacy local routes. The `X-Demo-Namespace` request header is caller-controlled and is not authentication or account security. Demo persistence is not safe for real health information. Signed-in screens use authenticated account APIs; these older namespaced routes remain for contract compatibility and are not called by signed-in screens.

## Important data and medical boundary

The product workflows are implemented, but the app is not a clinical service and is not approved for real health data or production use until the listed release gates are complete. The legacy catalog remains `prototype-2026-11-17.1`; it does not claim to use or represent a dataset from Vietnam's National Institute of Nutrition because redistribution rights for those tables have not been verified. A separate live USDA FoodData Central adapter returns exact source IDs, record editions, supported nutrients and missingness when a server key is configured; it never silently substitutes legacy catalog values. The meal templates and cooking steps are project-authored samples, not a clinically reviewed diet. The app does not evaluate food prices because no sourced price dataset is available. Recipes, household portions and clinical constraints still need qualified review.

The Home week selector reads the chosen local date from the diary API, and the nutrition report plots the latest seven local dates using API-returned totals. Historical days use the device's IANA timezone; failed days remain unavailable instead of appearing as zero intake. The signed-in notification inbox stores event and read state on the account; Expo Push runs through a separate server worker and needs project/provider credentials.

Health-record images are captured/imported on device, OCR candidates are editable and must be confirmed before private account upload; results are not interpreted as medical advice. Local PDF export uses account data. Do not enter real health information until privacy, security and qualified review gates are complete. Chat, push delivery, storage, FDC and PayOS use real provider adapters when configured; they do not fabricate successful results when unavailable. The full-app and release specs list service credentials, data rights, provider verification, device checks and qualified reviews required before production.
