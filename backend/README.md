# LocalPro — Backend (Supabase)

Yeh LocalPro ka **real database** hai — customer app aur provider app dono isi se judenge.
Abhi tak prototype me data hardcoded tha; ab yeh Postgres me aa jayega.

## Files (isi order me run karo)

| File | Kya karta hai |
|------|----------------|
| `migrations/0001_schema.sql` | Tables, enums, indexes (profiles, providers, leads, reviews...) |
| `migrations/0002_rls.sql`    | Row Level Security — har user sirf apna data dekhe |
| `migrations/0003_functions.sql` | Triggers (auto-profile, rating, lead-notify) + `nearby_providers` search |
| `seed.sql` | 12 demo providers + categories (5 bhasha) — baad me delete kar sakte ho |

## Setup (2 tareeke)

### A) Supabase Dashboard se (sabse aasaan)
1. [supabase.com/dashboard](https://supabase.com/dashboard) → apna **LocalPro** project kholo
2. Left menu → **SQL Editor** → **New query**
3. Har file ka content copy-paste karke **Run** karo, isi order me:
   `0001` → `0002` → `0003` → `seed.sql`
4. Left menu → **Table Editor** me tables + data dikhne lagenge ✅

### B) Supabase CLI se (developer tareeka)
```bash
supabase link --project-ref <your-project-ref>
supabase db push        # migrations chala dega
# seed:
psql "$DATABASE_URL" -f seed.sql
```

## App ko connect karne ke liye keys
Dashboard → **Project Settings → API**:
- **Project URL** (`https://xxxx.supabase.co`)
- **anon / publishable key** (client apps me use hoti hai — safe)
- **service_role key** — ⚠️ SECRET, sirf server/admin me, kabhi app me nahi

## Phone OTP (asli login) chalu karne ke liye
Dashboard → **Authentication → Providers → Phone** enable karo, phir SMS provider jodo:
- India ke liye **MSG91** (DLT-compliant) recommended — sender ID + OTP template register karna padega (3–7 din)
- Test ke liye Supabase ka built-in / Twilio bhi chalta hai

## Data model (chhota overview)
```
profiles ──1:1── providers ──1:N── provider_services
   │                 │
   │                 ├──1:N── leads      (customer ne call kiya = lead)
   │                 └──1:N── reviews    (moderated: pending → approved)
   └──1:N── saved_providers, notifications
```

## Ho jane ke baad — agla milestone
1. **Auth**: Phone + real OTP (MSG91)
2. **Customer app (Flutter)**: search → `nearby_providers` RPC se "near you", detail, call = lead
3. **Provider app (Flutter)**: dashboard, live leads (realtime), listing edit, reviews
4. **Push**: FCM — naya lead aane par provider ko notification
5. **Compliance + Play Store** release

> ⚠️ Reminder: agar tumne chat me Supabase access token share kiya tha, use
> [account/tokens](https://supabase.com/dashboard/account/tokens) se **revoke** kar do.
