# OTP via n8n (self-hosted) + Fast2SMS

Instead of wiring an SMS provider directly into Supabase, we let **Supabase
generate + verify the OTP** and delegate only the *delivery* to your **n8n**
workflow, which sends it through **Fast2SMS**. Auth stays secure in Supabase;
n8n just relays the SMS.

```
App → Supabase (make OTP, verify, issue session)
              │  Send SMS Hook (HTTPS POST, signed)
              ▼
        n8n webhook → Fast2SMS → user's phone
```

Files: import `n8n/localpro-otp-workflow.json` into n8n.

---

## Step 0 — DLT (needed for SMS in India; start early, ~1–7 days)
Register Enterprise + a **Sender ID** (e.g. `LCLPRO`) + an OTP **content template**
on a DLT portal (Jio/Airtel/Vodafone). Example template:
```
{#var#} is your LocalPro verification code. Do not share it with anyone.
```
Add the same Sender ID + template inside Fast2SMS. Note the **DLT Template ID**.
(WhatsApp OTP later needs no DLT — different route.)

## Step 1 — Fast2SMS
1. Sign up at **fast2sms.com**, add credit (~₹0.15–0.20 / SMS).
2. Dev API → copy your **API key**.
3. Add your DLT Sender ID + Template (from Step 0).

## Step 2 — Import the n8n workflow
1. n8n → **Import from File** → `localpro-otp-workflow.json`.
2. Open your n8n **environment variables** (self-host: set in the n8n service /
   docker env) and add:
   ```
   FAST2SMS_API_KEY=<your fast2sms key>
   FAST2SMS_SENDER_ID=LCLPRO
   FAST2SMS_DLT_TEMPLATE_ID=<your DLT template id>
   SUPABASE_SMS_HOOK_SECRET=<filled in Step 3>
   SUPABASE_SMS_HOOK_VERIFY=true
   ```
   > Secrets live in n8n env, never in the app. Restart n8n after setting them.
3. **Activate** the workflow. Copy the **Production Webhook URL** of the
   "Supabase SMS Hook" node — looks like
   `https://your-n8n-domain/webhook/localpro-otp`.
   (Your n8n must be reachable from the internet over HTTPS so Supabase can call it.)

## Step 3 — Point Supabase at n8n
Supabase Dashboard:
1. **Authentication → Providers → Phone**: turn **Enable Phone** ON.
   (Leave the built-in SMS provider fields blank — the hook takes over.)
2. **Authentication → Hooks → Send SMS hook**: **Enable**, type **HTTPS**,
   URL = your n8n webhook URL from Step 2.
3. Supabase shows a **signing secret** (`v1,whsec_...`). Copy it into n8n's
   `SUPABASE_SMS_HOOK_SECRET` env, restart n8n.

## Step 4 — Test
1. `cd customer-app && npm run dev`, open on your phone, enter your real number.
2. Supabase makes the OTP → calls n8n → Fast2SMS texts you.
3. Enter the code → you're logged in with a real session.
4. Same for `provider-app`.

---

## While DLT is pending (test the plumbing now)
Set `SUPABASE_SMS_HOOK_VERIFY=false` **only for local testing** and, in the
Fast2SMS node, temporarily switch `route` from `dlt` to `otp` (Fast2SMS's quick
OTP route) so you can confirm the flow end-to-end before DLT approval. Switch
both back for production.

## Troubleshooting
- **n8n never fires:** URL not public / not HTTPS, or workflow not *Activated*
  (test URL ≠ production URL).
- **401 invalid signature:** secret mismatch — re-copy the Supabase signing
  secret into n8n env and restart. Enable rawBody on the Webhook node (already
  set in the JSON).
- **Fast2SMS error:** message text must match the approved DLT template exactly;
  check API key + Sender ID.
- **No SMS but 200 OK:** check the Fast2SMS node output/logs and account balance.

## Bonus — WhatsApp OTP later
Duplicate the workflow, replace the Fast2SMS node with your WhatsApp Business
API (or a BSP) HTTP call sending the same `{{ $json.otp }}`. No DLT needed, but
you'll need a WhatsApp template approved by Meta.
