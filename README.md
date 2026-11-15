# Nutrition Assistant

Expo mobile app + initial Node.js/Express nutrition API MVP.

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

Run backend smoke tests with `npm run test:api`. Detailed routes, provenance and limitations are in [`backend/README.md`](backend/README.md).

## Important data and medical boundary

This is a software prototype. The backend uses a small demonstration set with comparator values attributed record-by-record to USDA FoodData Central; it does not claim to use or represent data from Vietnam's National Institute of Nutrition. The official dataset and redistribution license were not verified. Meal templates, prices, and nutrition estimates are not validated clinical advice. The app is not suitable for treatment planning until its food data, recipes and clinical constraints have been sourced and reviewed by qualified professionals.
