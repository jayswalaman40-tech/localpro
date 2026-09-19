# Helpzo — Customer App

Real customer app (find nearby help). Reuses the polished prototype UI, but now
wired to **Supabase** for real data + phone-OTP login, and packaged with
**Capacitor** so it ships as a native **Android (Play Store)** app.

## What's inside
```
index.html          UI markup + CSS (from the prototype)
src/main.js          app logic, wired to Supabase
src/api.js           data + auth layer (all DB calls live here)
src/supabase.js      Supabase client
src/i18n.js          5-language strings (en/hi/gu/mr/te)
capacitor.config.json
```

## 1) Setup
```bash
cp .env.example .env      # then fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
```
Get the keys from Supabase Dashboard → Project Settings → API.
Enable **Authentication → Phone** (with MSG91/Twilio) for real OTP.

> Make sure the backend migrations in `../backend` are applied first.

## 2) Run in browser (dev)
```bash
npm run dev           # http://localhost:5173
```

## 3) Build native Android app (Play Store)
```bash
npm run build         # builds web -> dist/
npx cap add android   # first time only (needs Android Studio + JDK)
npm run cap:sync      # copy web build into the Android project
npm run cap:open      # opens Android Studio -> Run / build signed APK/AAB
```
In Android Studio: **Build → Generate Signed Bundle/AAB** → upload the `.aab`
to Google Play Console.

## Notes
- Without `.env` keys the UI loads but login/data calls are disabled (a toast tells you).
- "Call" a provider = creates a **lead** that shows up in the provider app instantly.
- Location "near you" uses the device GPS via the `nearby_providers` RPC.
