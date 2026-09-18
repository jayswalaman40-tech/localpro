# WhatsApp OTP setup (Meta Cloud API + n8n)

Supabase generates + verifies the OTP; n8n delivers it over **WhatsApp** using
your **Meta WhatsApp Cloud API**. No DLT needed (that's an SMS rule). You DO need
an approved **Authentication** message template.

```
App → Supabase (make OTP, verify, session)
            │  Send SMS Hook (signed POST)
            ▼
       n8n webhook → graph.facebook.com → user's WhatsApp
```

Import `n8n/localpro-otp-whatsapp-workflow.json` into n8n.

---

## Step 1 — Create the Authentication template (needs approval, ~minutes–hours)
Meta **WhatsApp Manager → Message templates → Create template**:
- **Category:** Authentication
- **Name:** `otp_verification`  (lowercase + underscores; remember this)
- **Language:** English (US) → code **`en_US`**
- Body is auto-generated: *"{{1}} is your verification code."*
  - (Optional) tick **security recommendation** and **expiry** — fine to leave.
- **Button:** choose **Copy code** (or "One-tap autofill" if you set up app hash).
- Submit → wait for **Approved** status.

> The workflow sends the code into both the body `{{1}}` and the button, which is
> what authentication templates expect.

## Step 2 — Get your Cloud API values
From **Meta for Developers → your App → WhatsApp → API Setup**:
- **Phone number ID** (the sender's ID — a long number, NOT the phone number)
- **Access token** — use a **permanent** token (System User token), not the 24h test one
- (good to note) your WhatsApp Business Account (WABA) ID

## Step 3 — n8n env variables (secrets stay here, never in the app or chat)
Set on your self-hosted n8n, then restart:
```
WHATSAPP_TOKEN=<permanent access token>          # SECRET
WHATSAPP_PHONE_NUMBER_ID=<phone number id>
WHATSAPP_TEMPLATE_NAME=otp_verification
WHATSAPP_TEMPLATE_LANG=en_US
SUPABASE_SMS_HOOK_SECRET=<from Step 4>
SUPABASE_SMS_HOOK_VERIFY=true
```
Import the workflow, **Activate** it, copy the **production webhook URL**
(e.g. `https://your-n8n-domain/webhook/localpro-otp-wa`). n8n must be public HTTPS.

## Step 4 — Point Supabase at n8n
Supabase Dashboard:
1. **Authentication → Providers → Phone**: **Enable** (leave built-in SMS fields blank).
2. **Authentication → Hooks → Send SMS hook**: Enable, type HTTPS, URL = your n8n
   webhook URL.
3. Copy the shown signing secret (`v1,whsec_...`) into n8n `SUPABASE_SMS_HOOK_SECRET`, restart n8n.

## Step 5 — Test
1. `cd customer-app && npm run dev`, enter your own WhatsApp number.
2. Supabase → n8n → WhatsApp: you get the code on WhatsApp.
3. Enter it → logged in.
4. Same for provider-app.

---

## Important notes
- The login number **must be the user's WhatsApp number** (they get the OTP there).
- Recipient must have WhatsApp installed. For numbers without WhatsApp, keep an
  SMS fallback (the Fast2SMS workflow) — you can branch in n8n later.
- **Test window:** before your template/number is fully live, Meta only delivers
  to numbers you added as **test recipients** in API Setup. Add your own number there first.
- If sending fails with a template error, your approved template's **button type**
  may differ. In the "WhatsApp send" node, the button component is:
  `{"type":"button","sub_type":"url","index":"0","parameters":[{"type":"text","text":"<otp>"}]}`.
  For a pure **Copy code** button some accounts need `"sub_type":"copy_code"` with
  `{"type":"coupon_code","coupon_code":"<otp>"}` — switch if Meta rejects the first.
- Token is a secret → only in n8n env. Never commit it or paste it in chat.

## What I still need from you (non-secret) to finalise
Nothing to paste here — just set the env vars above in n8n. If you hit a template
error, tell me your approved template's **button type** (Copy code vs One-tap) and
I'll set the exact payload.
