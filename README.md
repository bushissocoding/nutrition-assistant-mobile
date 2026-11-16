# Nutrition Assistant

Expo mobile app + initial Node.js/Express nutrition API MVP.

## Repository layout

- `app/App.js` — Expo entry point.
- `app/src/` — feature-first mobile app: app shell, navigation, shared UI, theme, API client, and home/planning/grocery/diary/dashboard/profile features.
- `server/server.js` — Express API entry point.
- `server/src/` — API routes, catalog/demo repositories, request middleware, nutrition and meal-planning services.
- `server/data/` — explicitly attributed demonstration food and meal catalogs.
- `server/tests/` — deterministic unit tests for nutrition and meal-planning logic; `server/server.test.js` contains API smoke tests.
- `assets/design/ui-reference/` — supplied UI PNG references; implemented meal and dashboard screens use their visual direction.
- `docs/` — project presentation/requirements material.

## Run locally

Terminal 1 (API):

```sh
npm install
npm run api
```

Terminal 2 (Expo):

```sh
npm start
```

For a physical phone, set `EXPO_PUBLIC_API_URL` to your computer's LAN address before starting Expo, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000` (PowerShell: `$env:EXPO_PUBLIC_API_URL='http://192.168.1.20:4000'`). `localhost` on a phone refers to the phone, not the computer.

Run deterministic business-logic tests with `npm run test:unit` and backend API smoke tests with `npm run test:api`. Detailed routes, provenance and limitations are in [`server/README.md`](server/README.md). Consent and the minimal profile are stored locally with SecureStore; generated plans, diary entries and grocery lists remain in memory. The API has a development-only JSON storage foundation for future data routes, but there is no authentication, account ownership security, or production persistence.

### Development-only demo storage

The local JSON store is at `server/.local-data/demo-store.json` by default and is ignored by Git. Set `DEMO_DATA_ENABLED=true` to enable routes that use the demo data context. Optionally set `DEMO_DATA_FILE` to choose another path. In PowerShell:

```powershell
$env:DEMO_DATA_ENABLED = 'true'
$env:DEMO_DATA_FILE = '.\server\.local-data\demo-store.json' # optional
npm run api
```

Remove the environment variable or set it to `false` to turn demo data off. `NODE_ENV=production` always disables demo data routes, even when the flag is true. The `X-Demo-Namespace` request header only partitions local demo data; it is supplied by the caller and is not authentication or account security. Do not store real health information in this prototype. Diary and grocery CRUD routes are not part of the API foundation yet.

## Important data and medical boundary

This is a software prototype. The backend uses a small demonstration set with comparator values attributed record-by-record to USDA FoodData Central; it does not claim to use or represent data from Vietnam's National Institute of Nutrition. The official dataset and redistribution license were not verified. Meal templates, prices, and nutrition estimates are not validated clinical advice. The app is not suitable for treatment planning until its food data, recipes and clinical constraints have been sourced and reviewed by qualified professionals.
