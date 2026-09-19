# Admin dashboard — setup

The `admin-app/` lets you + your co-founder see all customers, providers, leads,
reviews and KYC documents, and verify/reject providers. Access is restricted to
users whose `profiles.role = 'admin'` (enforced by Supabase RLS — safe even though
it uses the public anon key).

---

## STEP 1 — Enable document storage (run once)
SQL Editor → run **`migrations/0005_admin_documents.sql`**
(already included at the end of `localpro-full-setup.sql`, so if you re-run that
you're covered). This adds the `provider_documents` table + a private `kyc-docs`
storage bucket + admin-only read access.

## STEP 2 — Create the admin users
Supabase Dashboard → **Authentication → Users → Add user**:
- Email + a strong password, tick **Auto Confirm User**.
- Do this for **you** and your **co-founder** (2 users).

(Email/password login is on by default — no SMTP needed with Auto Confirm.)

## STEP 3 — Make them admins
SQL Editor → run this with your two emails:
```sql
update public.profiles
set role = 'admin'
where id in (
  select id from auth.users
  where email in ('you@example.com', 'cofounder@example.com')
);
-- verify:
select p.role, u.email from public.profiles p
join auth.users u on u.id = p.id where p.role = 'admin';
```

## STEP 4 — Run the dashboard
```bash
cd admin-app
cp .env.example .env      # add the same VITE_SUPABASE_URL + anon key
npm install
npm run dev               # http://localhost:5175
```
Log in with an admin email + password. You'll see Overview, Customers, Providers
(click a row for full detail + verify/reject + documents), and Leads.

## STEP 5 (later) — Let providers upload documents
The dashboard already reads `provider_documents` + the `kyc-docs` bucket. To
populate them, add an upload screen in the provider app that does:
```js
await supabase.storage.from('kyc-docs').upload(`${userId}/aadhaar.jpg`, file);
await supabase.from('provider_documents').insert({ provider_id, user_id: userId, doc_type: 'aadhaar', file_path });
```
Tell me when you want this and I'll add it to the provider app.

---

## Notes
- Admins see everything via RLS admin policies; regular users still only see their own data.
- Deploy the dashboard like any web app (Vercel/Netlify/Hostinger) — it's static after `npm run build`. Keep the URL private; login still gates it.
- Never put the service-role key in this app. It only uses the public anon key + your admin login.
