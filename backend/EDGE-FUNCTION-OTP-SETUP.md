# OTP without n8n — Supabase Edge Function (WhatsApp)

No separate server. The function `send-otp-whatsapp`
(`backend/edge-functions/send-otp-whatsapp/index.ts`) IS the Send SMS Hook:
Supabase makes + verifies the OTP, the function delivers it over WhatsApp.

Project: `anqikuolwhpcrqnfbaoo`
Function URL (after deploy):
`https://anqikuolwhpcrqnfbaoo.supabase.co/functions/v1/send-otp-whatsapp`

---

## Part A — Test the app TODAY (no WhatsApp/Meta needed)
So you can log in on your phone right now while the Meta setup is pending:

1. Supabase Dashboard → **Authentication → Sign In / Providers → Phone** → enable Phone.
2. Find **"Test phone numbers"** (a.k.a. Test OTP) → **Add**:
   - Phone: `+919999999999`  →  Code: `123456`  (use any number + code you like)
3. Save.
4. In the app, log in with **that exact number**, enter **that code** → you're in.
   No SMS/WhatsApp is sent for test numbers — the whole app works immediately.

> Do this first. Everything below is for real WhatsApp OTP once Meta is ready.

---

## Part B — Deploy the Edge Function (pick ONE way)

### Way 1 — Dashboard (easiest, no tools)
1. Supabase Dashboard → **Edge Functions → Create a function**.
2. Name it exactly `send-otp-whatsapp`.
3. Paste the full contents of `backend/edge-functions/send-otp-whatsapp/index.ts`.
4. Deploy.
5. Open the function → **Settings** → turn **"Verify JWT" OFF**
   (it's a webhook; it verifies its own signature instead).

### Way 2 — CLI (one command)
```bash
npm i -g supabase
supabase login
supabase functions deploy send-otp-whatsapp --no-verify-jwt --project-ref anqikuolwhpcrqnfbaoo
```

## Part C — Set the secrets (Dashboard → Edge Functions → Secrets)
Add these (values from your Meta setup; token stays here, never in the app):
```
WHATSAPP_TOKEN            = <permanent WhatsApp token>      # SECRET
WHATSAPP_PHONE_NUMBER_ID  = <your sender's Phone Number ID>
WHATSAPP_TEMPLATE_NAME    = otp_verification
WHATSAPP_TEMPLATE_LANG    = en_US
SEND_SMS_HOOK_SECRET      = <filled in Part D>
```
(CLI alternative: `supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... --project-ref anqikuolwhpcrqnfbaoo`)

## Part D — Point Supabase Auth at the function
1. Supabase Dashboard → **Authentication → Hooks → Send SMS hook** → **Enable**.
2. Type: **HTTPS**, URL:
   `https://anqikuolwhpcrqnfbaoo.supabase.co/functions/v1/send-otp-whatsapp`
3. Copy the shown **signing secret** (`v1,whsec_...`) → paste into the
   `SEND_SMS_HOOK_SECRET` edge-function secret (Part C) → redeploy/save.

## Part E — Go live
1. Make sure your Meta WhatsApp is ready (see `META-WHATSAPP-FULL-SETUP.md`) and the
   `otp_verification` template is **Approved**.
2. Add your own number as a **test recipient** in Meta API Setup.
3. Log in from the app with your WhatsApp number → OTP arrives on WhatsApp.

---

## Order that avoids breakage
- **Now:** Part A (test numbers) → use the app today.
- **When Meta is ready:** deploy function (B) → set secrets (C) → enable hook (D) → test (E).
- Do NOT enable the Send SMS Hook (Part D) before WhatsApp works, or real logins will
  fail. Test numbers keep working regardless (they bypass the hook).

## If a WhatsApp send fails
The function returns the exact Meta error in its response/logs
(Dashboard → Edge Functions → send-otp-whatsapp → Logs). Send me that error and I'll
adjust (usually the template button type: `url` vs `copy_code`).
