# Nutrition Assistant

Expo mobile app + Node.js/Express API. The `codex/app-100-percent` branch is completing authenticated end-to-end product workflows; release use with real health data remains gated on named privacy, security, clinical and operations reviews.

## Repository layout

- `app/App.js` — Expo entry point.
- `app/src/` — feature-first mobile app: app shell, navigation, shared UI, theme, API client, and home/planning/grocery/diary/dashboard/profile features.
- `server/server.js` — Express API entry point.
- `server/src/` — API routes, catalog/demo repositories, request middleware, catalog validation, nutrition and meal-planning services.
- `server/data/` — versioned demonstration catalog, source/license registry, meal templates and a synthetic import-only fixture.
- `server/scripts/import-food-catalog.js` — deterministic catalog validation/import and change-report CLI; it does not fetch or scrape sources.
- `server/tests/` — deterministic unit tests for nutrition and meal-planning logic; `server/server.test.js` contains API smoke tests.
- [`CAPABILITY-MAP.md`](CAPABILITY-MAP.md) — cross-issue module boundaries and implementation dependencies for GitHub issues #1–#5.
- [`spec/SPEC-app-completion-v2.md`](spec/SPEC-app-completion-v2.md) — completed demo history/read-state behavior and production integration prerequisites.
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

Verify the backend from the same device/emulator that runs the app by opening `http://<the-same-host>:4000/health` in its browser. The response should include `{"status":"ok"}`. You can also check locally on the computer with `http://localhost:4000/health`.

### Troubleshooting startup and connectivity

| Symptom | What it points to | Check |
|---|---|---|
| `npm start` fails before showing the Expo QR code | Metro startup or local Node/dependency setup | Confirm the supported Node version above, run `npm ci`, and read the Metro terminal error. |
| Expo Go opens the project but the JavaScript bundle does not load | The phone cannot reach Metro | Check the Expo terminal and network mode. `npx expo start --tunnel` can diagnose Metro reachability; it does not tunnel the API. `npx expo start --clear` retries with a cleared Metro cache. |
| App loads, but API requests fail | API process, API URL, LAN, or firewall | Check the API terminal for startup/config errors. Call `http://localhost:4000/health` on the development computer, then open the same target-specific API host plus `/health` on the device. If the computer succeeds but the device fails, check `EXPO_PUBLIC_API_URL`, same-network access, and the firewall rule for TCP 4000. |
| `/health` works from the device, but a feature still fails | Route, request validation, response handling, or app logic | Check the API status/error code and the feature's expected `/api/v1` contract; run `npm run test:api`, `npm run test:unit`, or `npm run test:ui` for the relevant layer. Do not copy health data, headers, or credentials into logs or public issues. |

The API's startup validation prints the setting and requirement for invalid `PORT` or `DEMO_DATA_ENABLED` values without echoing the supplied value. A successful `/health` response confirms only that the API process responds; it does not prove authentication, persistence durability, or production readiness.

Run deterministic business-logic tests with `npm run test:unit`, UI component tests with `npm run test:ui`, and backend API smoke tests with `npm run test:api`. CI also exports the Android JavaScript bundle and runs `npm audit --audit-level=high`; the export is not a physical-device test. Detailed routes, provenance and limitations are in [`server/README.md`](server/README.md) and the [security and operations baseline](docs/security-and-operations.md). Supabase account identity, consent/profile, saved USDA-attributed nutrition, diary/report, groceries and care bookings use private APIs. PayOS hosted checkout and signed webhooks are implemented but need merchant credentials and a live sandbox check. Account export and Auth deletion include owned records. Legacy namespaced diary and grocery routes remain for backward compatibility and are not called by signed-in screens. Live FDC search requires server-only `FDC_API_KEY`. Local database/RLS integration has not been run in this environment. Clinician and AI chat, medical document storage/OCR, and server notifications remain on the full-app roadmap. The release is not approved for real health information or clinical/production use until the external gates are complete.

### Development-only demo storage

The local JSON store is at `server/.local-data/demo-store.json` by default and is ignored by Git. Demo routes stay disabled until you explicitly set `DEMO_DATA_ENABLED=true` in `server/.env` or in the shell. Optionally set `DEMO_DATA_FILE` to choose another path. In PowerShell:

```powershell
$env:DEMO_DATA_ENABLED = 'true'
$env:DEMO_DATA_FILE = '.\server\.local-data\demo-store.json' # optional
npm run api
```

Remove the environment variable or set it to `false` to turn demo data off. `NODE_ENV=production` always disables demo data routes, even when the flag is true. The app keeps a demo namespace in SecureStore so it can reuse the same local demo partition after restarting. The `X-Demo-Namespace` request header is caller-controlled and is not authentication or account security. Demo persistence is not safe for real health information. Signed-in diary, nutrition report, pantry and grocery screens use authenticated account APIs; these older namespaced routes remain for contract compatibility and are not called by signed-in screens.

## Important data and medical boundary

This is a software prototype. The legacy catalog remains `prototype-2026-11-17.1`; it does not claim to use or represent a dataset from Vietnam's National Institute of Nutrition because redistribution rights for those tables have not been verified. A separate live USDA FoodData Central adapter returns exact source IDs, record editions, supported nutrients and missingness when a server key is configured; it never silently substitutes legacy catalog values. The meal templates and cooking steps are project-authored samples, not a clinically reviewed diet. The app does not evaluate food prices because no sourced price dataset is available. Recipes, household portions and clinical constraints still need qualified review.

The Home week selector reads the chosen local date from the diary API, and the nutrition report plots the latest seven local dates using API-returned totals. Historical days use the device's IANA timezone; failed days remain unavailable instead of appearing as zero intake. Synthetic notification sample read flags persist locally in SecureStore, while no push service or delivery history is connected.

The medical-record screen can create a PDF from the account profile in the device cache and open the native share sheet; it does not upload the file or verify a medical record. The optional lab sample is synthetic, editable only in the current screen session, and is not produced by a camera or OCR. Do not enter real health information until privacy, security and qualified review gates are complete. Login/profile/export, nutrition diary/grocery, provider directory/booking and the PayOS hosted checkout state machine use account APIs when services are configured. PayOS merchant activation, provider chat, document storage/OCR and push delivery still need external setup or implementation. The full-app spec lists provider choices, credentials, data rights, and qualified reviews required before production.
