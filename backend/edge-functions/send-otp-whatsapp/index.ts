// =====================================================================
// LocalPro — Supabase "Send SMS Hook" -> WhatsApp Cloud API
// Replaces n8n entirely. Supabase makes + verifies the OTP; this function
// only delivers it over WhatsApp. Deploy with verify_jwt = false.
//
// Secrets (Supabase Dashboard -> Edge Functions -> Secrets, or `supabase secrets set`):
//   SEND_SMS_HOOK_SECRET      = the hook signing secret (v1,whsec_...) from the Send SMS Hook
//   WHATSAPP_TOKEN            = permanent WhatsApp access token   (SECRET)
//   WHATSAPP_PHONE_NUMBER_ID  = your WhatsApp sender's Phone Number ID
//   WHATSAPP_TEMPLATE_NAME    = otp_verification
//   WHATSAPP_TEMPLATE_LANG    = en_US
// =====================================================================
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  // 1) Verify the Supabase Send SMS Hook signature (Standard Webhooks)
  const rawSecret = (Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "")
    .replace("v1,whsec_", "").replace("whsec_", "").trim();
  let body: any;
  try {
    if (rawSecret) {
      body = new Webhook(rawSecret).verify(payload, headers);
    } else {
      body = JSON.parse(payload); // no secret set yet (testing only)
    }
  } catch (_e) {
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  // 2) Extract phone (full intl digits) + otp
  const to = String(body?.user?.phone ?? "").replace(/\D/g, "");
  const otp = String(body?.sms?.otp ?? "");
  if (to.length < 11 || !otp) {
    return new Response(JSON.stringify({ error: "missing phone or otp" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // 3) Send the WhatsApp authentication template
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const templateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? "otp_verification";
  const templateLang = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "en_US";
  if (!phoneNumberId || !token) {
    return new Response(JSON.stringify({ error: "WhatsApp env not configured yet" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const waRes = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLang },
          components: [
            { type: "body", parameters: [{ type: "text", text: otp }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: otp }] },
          ],
        },
      }),
    },
  );

  if (!waRes.ok) {
    const detail = await waRes.text();
    return new Response(JSON.stringify({ error: "whatsapp send failed", detail }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({}), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
