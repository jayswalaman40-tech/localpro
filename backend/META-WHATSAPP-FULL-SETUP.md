# Meta + WhatsApp Cloud API — full setup from scratch (India)

Fresh Facebook account se le kar ek **working WhatsApp Business Account (WABA)**
tak, jisse tum apna OTP template bana ke n8n se OTP bhej sako.

**Kyun zaroori:** tumhara pehla error (`does not have permission to create message
template`) isliye aaya kyunki account **verified business** ke andar nahi tha.
Ye guide wahi theek karta hai (Stage 3 = Business Verification).

**Kya free hai:** Facebook, Business Portfolio, Developer app, WABA — sab free.
Sirf (a) OTP messages per-message charge hote hain (~₹0.11–0.35/OTP India), aur
(b) Business Verification ke liye ek **registered business proof** chahiye.

**Time:** setup ~1–2 ghante + Business Verification approval (minutes se 2–3 din).

---

## STAGE 0 — Pehle ye ready rakho (checklist)
- [ ] Ek **real mobile number** (Facebook account ke liye)
- [ ] Ek **alag mobile number** jo WhatsApp sender banega — jo **consumer WhatsApp
      app pe registered NA ho** (ya pehle usse WhatsApp app se delete karo). Ye number
      customers ko OTP bhejega.
- [ ] Ek **business email** (jaise you@yourdomain.com — Gmail se better; Hostinger
      se domain+email le sakte ho)
- [ ] **Business proof document** (India) — inme se koi ek, business ke legal naam +
      address pe:
      - **Udyam / MSME certificate** (free, online ban jata hai — solo founders ke liye best)
      - GST certificate
      - Shops & Establishment license
      - Certificate of Incorporation (company ho to)
      - Business bank statement / business utility bill
- [ ] (Recommended) ek **domain/website** — verification + WhatsApp display name me help karta hai

> **Solo ho, koi registered business nahi?** Sabse aasaan: **Udyam Registration**
> ([udyamregistration.gov.in](https://udyamregistration.gov.in)) — free, Aadhaar+PAN se
> online, turant. Business naam "Helpzo" (ya jo chaho) rakh lo. Yahi document
> Meta verification me chalega.

---

## STAGE 1 — Fresh Facebook account
1. [facebook.com](https://facebook.com) → Create new account (asli naam, mobile, email).
2. Email + phone **verify** karo.
3. Profile photo + thodi info daal do (naya khaali account Meta jaldi flag karta hai).
4. 1–2 din purana account ho to accha (naye account pe kabhi restriction aa jati hai).

## STAGE 2 — Meta Business Portfolio banao
1. [business.facebook.com](https://business.facebook.com) → **Create account**.
2. Bharo: **Business name** (jaise "Helpzo"), tumhara naam, **business email**.
3. Ban gaya → ye tumhara **Business Portfolio** (purana naam: Business Manager) hai.
4. **Business Settings → Business Info** me address, website daal do.

## STAGE 3 — Business Verification (ye sabse zaroori step)
1. **Business Settings → Security Center** (ya "Business verification").
2. **Start verification** → business details bharo — legal naam + address **document
   se bilkul match** hone chahiye (Udyam/GST wale naam se).
3. Document upload karo (Stage 0 wala).
4. Phone/website/email se verification confirm karo.
5. Status **"Verified"** hone ka wait (minutes–3 din). **Verify hone ke baad hi
   template banane ki permission milti hai.**

## STAGE 4 — Developer App (Cloud API ke liye)
1. [developers.facebook.com](https://developers.facebook.com) → apne FB se login →
   **My Apps → Create App**.
2. App type: **Business** → app naam do → **apna Business Portfolio select karo**.
3. App dashboard me **WhatsApp** product **"Set up"** karo.

## STAGE 5 — WhatsApp Business Account + sender number
1. WhatsApp setup me ek **WABA** automatically ban jata hai (tumhare business ke andar).
2. **"Add phone number"** → apna sender number (Stage 0 wala) daalo → **OTP se verify** karo.
3. **Display name** do (jaise "Helpzo") → Meta review karega (thoda time).
4. Ab tumhare paas hai: **Phone Number ID** + **WABA ID** (API Setup page pe dikhte hain).

## STAGE 6 — Permanent Access Token (n8n ke liye — kabhi expire na ho)
1. **Business Settings → Users → System Users → Add** → naam do → role **Admin**.
2. **Add Assets** → apna **App** aur **WhatsApp Account (WABA)** dono assign karo
   (full control).
3. **Generate new token** → app select karo → permissions tick karo:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
4. Token copy karo → ye **permanent** hai → seedhe **n8n env** (`WHATSAPP_TOKEN`)
   me daalo. **Chat/file me mat daalna, commit mat karna.**

## STAGE 7 — OTP template banao (ab permission milegi)
Do me se koi ek:
- **UI:** WhatsApp Manager → Message templates → Create → **Authentication** →
  naam `otp_verification`, language `en_US`, button **Copy code** → submit.
- **Script:** `backend/n8n/create-wa-template.ps1` me apna WABA ID + token daal ke
  chalao (verified account pe ab SUCCESS aayega).

Status **Approved** hone ka wait (aksar minutes).

## STAGE 8 — n8n + Supabase se joda
Ab `backend/OTP-WHATSAPP-SETUP.md` follow karo:
- n8n env me `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME=otp_verification`,
  `WHATSAPP_TEMPLATE_LANG=en_US`
- `localpro-otp-whatsapp-workflow.json` import → Activate → webhook URL
- Supabase → Auth → Hooks → Send SMS hook → wo URL + signing secret

Test: apne WhatsApp number se app me login → OTP WhatsApp pe aayega ✅

---

## Zaroori tips (India)
- **Sender number** consumer WhatsApp app pe registered na ho — warna verify nahi hoga.
  Pehle app se us number ka WhatsApp delete karo, phir Cloud API me daalo.
- **Business Verification ka naam = document ka naam** — mismatch = reject.
- **Test recipients:** live hone se pehle Meta sirf un numbers pe bhejta hai jo tum
  API Setup me "test recipient" me add karte ho — apna number add kar lena.
- **OTP pricing:** authentication messages per-message charge (India ~₹0.11–0.35).
  Meta Business me ek **payment method** add karna padega warna kuch messages ke baad ruk jayega.
- **Green tick (verified badge)** optional hai — OTP ke liye zaroori nahi.

## Abhi ise wait kiye bina app test karni ho
Ye pura Meta setup chalu rahe, lekin **abhi app phone pe chala ke dekhne** ke liye:
Supabase → Auth → Phone → **Test phone number** (fixed OTP, koi SMS/WhatsApp nahi).
Ek number + code daalo, wahi se login karke poora app test karo.

## Jab atko
Har stage pe agar error/reject aaye — mujhe exact message bata do, main us step ka
fix de dunga. Sabse common: verification document mismatch, ya sender number pehle se
WhatsApp app pe registered.
