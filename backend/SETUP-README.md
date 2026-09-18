# LocalPro — full setup on any computer (test-ready)

Follow this on the other computer to get both apps running against Supabase.
Real SMS/WhatsApp OTP is NOT needed for testing — we use a Supabase **test phone
number** with a fixed code.

---

## What you need
- The project folders `customer-app/` and `provider-app/` (copy them over).
- Node.js 18+ installed.
- Access to the Supabase project in a browser.

---

## STEP 1 — Set up the database (once)
1. Open the project's **SQL Editor**:
   `https://supabase.com/dashboard/project/<YOUR-REF>/sql/new`
   (current project ref: `anqikuolwhpcrqnfbaoo`)
2. Open **`localpro-full-setup.sql`**, copy ALL of it, paste into the editor.
3. Click **Run**. It creates every table, security rule, function, and 12 demo
   providers. (Safe to run again — it won't duplicate.)

## STEP 2 — Put the keys in both apps
Supabase Dashboard → **Project Settings → API**. Copy **Project URL** and the
**anon / publishable key**. Create `.env` in BOTH `customer-app/` and
`provider-app/`:

```
VITE_SUPABASE_URL=https://<YOUR-REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon or publishable key>
VITE_DEFAULT_LAT=23.0225
VITE_DEFAULT_LNG=72.5714
```

> If you keep using the current project (`anqikuolwhpcrqnfbaoo`), the values are:
> ```
> VITE_SUPABASE_URL=https://anqikuolwhpcrqnfbaoo.supabase.co
> VITE_SUPABASE_ANON_KEY=sb_publishable_cc2LU_CF9qHAQSc44tSjqA_pzMfJ208
> ```
> (The provider `.env` only needs the first two lines.)

## STEP 3 — Add the test phone number (no real OTP needed)
1. Dashboard → **Authentication → Providers → Phone** → **Enable** Phone provider.
2. Find the **"Test OTP"** section → **Add**:
   - **Phone number:** `+917202807340`
   - **Code / Token:** `1234`   ← keep it 4 digits (the app has 4 OTP boxes)
3. **Save.**

> If enabling asks for an SMS provider, pick any (e.g. Twilio) and save — the test
> number never actually sends anything, it just accepts the fixed code.

## STEP 4 — Run the apps
In each app folder:
```
npm install
npm run dev
```
- Customer app → http://localhost:5173
- Provider app → http://localhost:5174

Open on the phone or browser and log in with:
- **Number:** `7202807340`  (the app adds +91 automatically)
- **OTP:** `1 2 3 4`

You should land on Home with live providers (Kavita Ben, Manoj Solanki, …).
Tap **Call** on one → it becomes a **lead** in the provider app (log into the
provider app with the same test number + `1234`).

---

## Notes
- The already-built Android APKs (`builds/…apk`) are tied to the current project's
  keys. If you switch to a DIFFERENT Supabase project, rebuild the APKs after
  updating `.env` (`npm run build`).
- Real OTP later: `EDGE-FUNCTION-OTP-SETUP.md` (WhatsApp, no n8n) +
  `META-WHATSAPP-FULL-SETUP.md`.
- Everything here is idempotent/safe to redo.
