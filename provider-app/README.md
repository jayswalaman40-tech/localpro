# Helpzo — Provider App ("Partner")

The app skilled workers use to **list their work and receive leads**. Reuses the
prototype UI, wired to the same **Supabase** backend as the customer app, and
packaged with **Capacitor** for **Android (Play Store)**.

## What's inside
```
index.html          UI markup + CSS (from the prototype)
src/main.js          app logic, wired to Supabase (realtime leads)
src/api.js           data + auth layer
src/supabase.js      Supabase client
src/i18n.js          5-language strings
capacitor.config.json  (appId com.localpro.provider)
```

## Key flows (all live)
- **Phone-OTP login** with role = `provider`.
- **Edit listing** creates/updates the public `providers` row (name, trade,
  phone shown to customers, service area, starting price, about).
- **Leads** = customers who called/enquired. Streamed in **realtime** — a new
  lead pops a toast instantly (Supabase Realtime channel).
- **Mark contacted** updates the lead status (customer sees it move in history).
- **Reviews** received; **Available for work** toggle flips your listing on/off.

## Setup & run
```bash
cp .env.example .env     # add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev              # http://localhost:5174
```

## Build Android (Play Store)
```bash
npm run build
npx cap add android      # first time (needs Android Studio + JDK)
npm run cap:sync
npm run cap:open         # Android Studio → Generate Signed Bundle (.aab)
```

## Notes
- Login needs **Phone auth** enabled in Supabase (MSG91/Twilio + DLT). See
  `../backend/SETUP-OTP.md`.
- Earnings screen shows **completed jobs** count. Rupee earnings tracking arrives
  with the payments/monetization phase (no payment model yet — by design for the free MVP).
