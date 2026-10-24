# Helpzo — Booking & Dispatch Algorithm (M1)

Yeh doc batata hai ki booking kaise ek provider tak pahunchti hai, aur
"best provider" kaise choose hota hai. Payment **offline** hai (cash / UPI
direct) — koi commission ya payment gateway nahi.

> Files: `migrations/0006_booking_schema.sql`, `0007_dispatch_functions.sql`,
> `0008_booking_rls.sql`. Sabhi `localpro-full-setup.sql` me bhi append hain.

## Flow (ek line me)
`request_booking` → system best provider ko **offer** bhejta hai (10-min timer)
→ provider **accept** kare to booking confirm, **reject / timeout** ho to
**agle best** provider ko offer → koi na bache to customer ko "abhi koi
available nahi"।

## States
- **booking:** `searching → offered → accepted → (scheduled | active) → in_progress → completed` · ya `cancelled` / `unfulfilled`
- **offer:** `pending → accepted | rejected | expired | cancelled`
- Aaj ka kaam accept hua → `active`; aage ki date → `scheduled` (us din cron ise `active` kar deta hai).

## Ranking score (balanced hybrid, 0..1)
Har eligible provider ka score:

```
score = ( 0.35 · distance        -- paas = zyada (15 km ke andar)
        + 0.25 · rating(Bayesian) -- naye ko fair chance (prior 4.3 over 5 reviews)
        + 0.15 · (0.7·response_rate + 0.3·online_now)  -- online = last 30 min
        + 0.10 · verified         -- KYC verified
        + 0.15 · fairness )       -- recent 7-din leads kam = boost (rotation)
        × (1 − min(improper_rejects,5)·0.05)   -- galat reject penalty (max −25%)
```

- **Bayesian rating** = `(5·4.3 + rating_avg·rating_count) / (5 + rating_count) / 5`.
  0 reviews wale provider ko bhi ~0.86 milta hai, 0 nahi — isliye naya banda bhi dikhta hai.
- **Fairness** = `1 / (1 + recent_leads_7d)`. Jise jitni kam leads, utna upar →
  leads rotate hoti hain, kuch providers tikte hain (north-star health).
- **Penalty** = bina-reason / fake reject 3+ baar → score 25% tak girta hai.

Yahi score **do jagah** chalta hai:
1. **Dispatch** (`make_next_offer`) — kis provider ko pehle offer bheji jaaye.
2. **Browsing** (`nearby_providers`) — search me kaun pehle dikhe (Best match).

## Eligibility (offer ke liye zaroori)
`available = true` · `verified = true` · signed **certificate** · lat/lng set ·
sahi category · 15 km ke andar · us slot par **free** (schedule clash nahi) ·
is booking ko pehle offer nahi hui.

## Weights kaise badlein
Weights `0007_dispatch_functions.sql` ke `make_next_offer` aur `nearby_providers`
dono me hardcoded hain (0.35 / 0.25 / 0.15 / 0.10 / 0.15). Data aane ke baad
dono jagah same values badal dein. (Baad me chahein to ek `ranking_config`
table bana ke in-DB tunable kar sakte hain.)

## Timer / cron
- `expire_offers()` — har minute: pending offer jo 10 min me jawab nahi hui →
  `expired`, phir `make_next_offer` se agla.
- `activate_scheduled()` — har 5 min: aaj wali `scheduled` booking → `active`.
- Dono **pg_cron** se schedule hain. Agar pg_cron enable nahi:
  Supabase → Database → Extensions → **pg_cron** on karke, `0007` ke do
  `cron.schedule(...)` calls dobara chala dein.

## Public RPCs (apps inhe call karti hain)
| RPC | Kaun | Kaam |
|---|---|---|
| `request_booking(category, service, note, address, lat, lng, scheduled_for)` | customer | booking banao + dispatch start |
| `respond_to_offer(offer_id, 'accept'\|'reject', reason)` | provider | offer accept/reject |
| `provider_start_job(booking)` | provider | kaam shuru (`in_progress`) |
| `provider_send_bill(booking, amount, mode)` | provider | final bill |
| `provider_collect_payment(booking)` | provider | cash/UPI mila (`paid`) |
| `customer_verify_complete(booking)` | customer | kaam verify → `completed` |
| `cancel_booking(booking, reason)` | dono | cancel |
| `update_provider_location(lat, lng)` | provider | live location (Realtime) |
| `touch_last_seen()` | provider | online heartbeat |
| `sign_certificate(signature_url)` | provider | liability sign |
| `admin_verify_provider(provider, verified)` | admin | KYC verify |

## Abhi kya pending hai (agle milestones)
- **M2:** Provider onboarding UI (docs/selfie/bank) + certificate sign page + admin verify screen.
- **M3:** Active-job UI (start → directions → work update → bill → collect → feedback) + live map.
- **M4:** Dono apps ko in RPCs se wire karna (purana "call = lead" flow se booking flow par shift).

> Note: Yeh M1 SQL abhi ek live DB par test nahi hua (is session me DB nahi
> tha). Supabase SQL Editor me `0006 → 0007 → 0008` order me chala ke
> `request_booking` + `respond_to_offer` ek baar test kar lein.
