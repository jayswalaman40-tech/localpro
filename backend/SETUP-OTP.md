# Phone OTP setup (India) — enable real login

Both apps log in with an SMS OTP to `+91<number>`. Supabase sends the SMS
through a provider you connect. In India, transactional SMS needs **DLT
registration** (a TRAI rule). This guide uses **MSG91** (popular, DLT-friendly,
cheap). Twilio also works if you prefer.

Do this once. ~1–2 hours of work + 1–7 days waiting for DLT approval.

---

## Step 1 — DLT registration (do this FIRST, it takes days)
1. Go to any DLT portal (e.g. **Jio TrueConnect**, **Vodafone**, **Airtel DLT**).
2. Register as **Enterprise** with your PAN/GST + business details.
3. Register a **Header (Sender ID)** — 6 letters, e.g. `LCLPRO`.
4. Register a **Content Template** for the OTP, for example:
   ```
   {#var#} is your Helpzo verification code. Do not share it with anyone.
   ```
   Category: **Service Implicit** / **Transactional**.
5. Note the **DLT Template ID** and **Sender ID** once approved.

> No business entity yet? MSG91 can help you register DLT, or you can use their
> shared/quick options to test — but production must be your own DLT.

## Step 2 — MSG91 account
1. Sign up at **msg91.com**.
2. Add your DLT **Sender ID** + **Template** under SMS → and get your **Auth Key**.
3. Add credit (SMS ~₹0.15–0.20 each).

## Step 3 — Connect MSG91 to Supabase
Supabase Dashboard → **Authentication → Providers → Phone**:
1. Turn **Enable Phone provider** ON.
2. SMS provider: choose **MSG91** (or **Twilio**).
3. Paste your **MSG91 Auth Key**, **Sender ID**, **DLT Template ID**.
4. OTP length: **6** (or 4). Expiry: 60–300s.
5. Save.

> Supabase dashboard is the place for these secrets — never put the MSG91 auth
> key in the app `.env` or in code. The app only holds the public anon key.

## Step 4 — Test
1. `cd customer-app && npm run dev` → open on your phone.
2. Enter your real 10-digit number → you should get a real SMS OTP.
3. Enter it → you land on Home with live providers.
4. Repeat for `provider-app` (logs in as a provider).

---

## Costs
- DLT registration: usually free–₹5,000 one-time (varies by operator/aggregator).
- MSG91: pay-as-you-go, ~₹0.15–0.20 per OTP SMS.
- Supabase phone auth: free (you only pay the SMS provider).

## Troubleshooting
- **OTP not arriving:** DLT template mismatch is the #1 cause — the message text
  in MSG91 must match the approved DLT template *exactly*.
- **"Invalid phone":** app sends `+91` automatically; enter only the 10 digits.
- **Rate limits:** Supabase limits OTP sends per hour per number by default.
