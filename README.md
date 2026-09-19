# Helpzo

Hyperlocal services marketplace for India — customers find nearby skilled workers
(plumber, electrician, tailor, cook…) and call them directly. Every call becomes a
**lead** in the provider app. Two Android apps + one Supabase backend. 5 languages
(English, हिन्दी, ગુજરાતી, मराठी, తెలుగు).

## Repo layout
```
customer-app/     Customer app (find + call providers)   — Vite + Capacitor
provider-app/     Provider app (listings + live leads)   — Vite + Capacitor
admin-app/        Admin dashboard (customers/providers/leads/KYC) — Vite web
backend/          Supabase SQL + setup guides
  localpro-full-setup.sql     run once in Supabase SQL Editor (whole DB)
  SETUP-README.md             set up + test on any computer (test OTP)
  migrations/                 individual migrations 0001–0004
  edge-functions/             send-otp-whatsapp (OTP without n8n)
  EDGE-FUNCTION-OTP-SETUP.md  WhatsApp OTP via Supabase Edge Function
  META-WHATSAPP-FULL-SETUP.md WhatsApp Business setup A→Z (India)
builds/           Prebuilt debug APKs
.github/workflows/android.yml  builds APKs in the cloud
```

## Quick start (test in ~5 min)
See **`backend/SETUP-README.md`**. Short version:
1. Run `backend/localpro-full-setup.sql` in the Supabase SQL Editor.
2. Put the project URL + anon key in `customer-app/.env` and `provider-app/.env`
   (copy from `.env.example`).
3. Supabase → Auth → Phone → **Test OTP**: add `+917202807340` = `1234`.
4. In each app: `npm install && npm run dev`. Log in with `7202807340` / `1234`.

## Status
- ✅ Backend live (Supabase): schema, RLS, `nearby_providers` RPC, seed data
- ✅ Both apps built + connected; debug APKs in `builds/`
- ✅ Realtime leads (call → provider dashboard)
- ✅ Admin dashboard (`admin-app/`) — see all users/providers/leads, verify KYC (see `backend/ADMIN-SETUP.md`)
- ⏳ Real OTP: WhatsApp via Supabase Edge Function (Meta business verification pending)
- ⏳ Play Store: signed release `.aab`

## Notes
- `.env`, `node_modules/`, and the generated `android/` folder are gitignored.
  Rebuild native: `npm run build && npx cap add android && npm run cap:sync`.
- Free MVP — monetization (subscription / pay-per-lead) decided later.
