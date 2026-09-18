-- =====================================================================
-- LocalPro — DEMO seed data (categories + 12 sample providers)
-- Safe to delete later. Run AFTER 0001..0003 migrations.
--
-- How provider demo accounts work:
--   We insert phone-based rows into auth.users. The on_auth_user_created
--   trigger (0003) auto-creates the matching public.profiles row. Then we
--   insert the public.providers listing referencing that user.
-- On REAL signup you don't need any of this — the app creates it.
-- =====================================================================

-- ---------------- Categories (with 5-language names) ----------------
insert into public.categories (key, translations, sort_order) values
  ('plumber',    '{"en":"Plumber","hi":"प्लंबर","gu":"પ્લમ્બર","mr":"प्लंबर","te":"ప్లంబర్"}',                 1),
  ('electrician','{"en":"Electrician","hi":"इलेक्ट्रीशियन","gu":"ઇલેક્ટ્રિશિયન","mr":"इलेक्ट्रिशियन","te":"ఎలక్ట్రీషియన్"}', 2),
  ('carpenter',  '{"en":"Carpenter","hi":"बढ़ई","gu":"સુથાર","mr":"सुतार","te":"వడ్రంగి"}',                     3),
  ('ac_repair',  '{"en":"AC repair","hi":"AC रिपेयर","gu":"AC રિપેર","mr":"AC दुरुस्ती","te":"AC రిపేర్"}',       4),
  ('painter',    '{"en":"Painter","hi":"पेंटर","gu":"પેઇન્ટર","mr":"पेंटर","te":"పెయింటర్"}',                    5),
  ('tailor',     '{"en":"Tailor","hi":"दर्जी","gu":"દરજી","mr":"शिंपी","te":"టైలర్"}',                          6),
  ('driver',     '{"en":"Driver","hi":"ड्राइवर","gu":"ડ્રાઇવર","mr":"ड्रायव्हर","te":"డ్రైవర్"}',               7),
  ('cook',       '{"en":"Cook","hi":"रसोइया","gu":"રસોઇયો","mr":"स्वयंपाकी","te":"వంటవాడు"}',                   8),
  ('gardener',   '{"en":"Gardener","hi":"माली","gu":"માળી","mr":"माळी","te":"తోటమాలి"}',                       9)
on conflict (key) do nothing;

-- ---------------- Demo providers ----------------
-- (name, phone, category key, about, price, unit, area, exp, verified, lat, lng, rating, reviews, resp%)
do $$
declare
  r record;
  v_uid uuid;
  v_pid uuid;
  v_cat uuid;
begin
  for r in
    select * from (values
      ('Rajesh Kumar',    '+919876543210','plumber',    '10+ years — tap repair, pipeline fitting, bathroom installation.', 250,'onwards','Satellite, Bodakdev, Vastrapur',10,true, 23.030,72.512,4.8,120,92),
      ('Suresh Bhai',     '+919723411890','plumber',    'Tap repair and drain cleaning specialist.',                        200,'onwards','Maninagar, Isanpur',              6,false,23.000,72.600,4.5, 76,80),
      ('Manoj Solanki',   '+919099922341','electrician','Wiring, switchboards and fan installation.',                        300,'onwards','Navrangpura, C.G. Road',        12,true, 23.038,72.560,4.9,210,95),
      ('Iqbal Khan',      '+918812367540','electrician','Short circuit fixes and inverter setup.',                           250,'onwards','Juhapura, Sarkhej',              5,false,22.990,72.520,4.3, 54,78),
      ('Bharat Vaghela',  '+919925078123','carpenter',  'Furniture repair, custom wardrobes, door fitting.',                 400,'onwards','Bopal, South Bopal',            15,true, 23.030,72.470,4.7, 98,88),
      ('Farhan Sheikh',   '+919123455678','ac_repair',  'AC servicing, gas refill and installation.',                        350,'onwards','Vastrapur, Thaltej',             8,true, 23.040,72.530,4.6,143,90),
      ('Deepak Sharma',   '+919654312098','painter',    'Interior painting and waterproofing.',                               15,'sqft',   'Chandkheda, Motera',             9,false,23.110,72.590,4.4, 61,75),
      ('Ramesh Chauhan',  '+919328044567','ac_repair',  'AC servicing and wiring checks.',                                   300,'onwards','Nikol, Naroda',                  4,false,23.070,72.660,4.1, 33,70),
      ('Kavita Ben',      '+919012388451','tailor',     'Blouse stitching, alterations, kids wear.',                         100,'onwards','Paldi, Ambawadi',               14,true, 23.010,72.560,4.9, 87,93),
      ('Anil Yadav',      '+918976534120','driver',     'City drive, outstation trips, airport drops.',                      150,'hr',     'Ghatlodia, Sola',                7,true, 23.070,72.540,4.6, 52,85),
      ('Meena Prajapati', '+919456712309','cook',       'Daily tiffin and party cooking.',                                  4000,'mo',     'Gota, Chandlodia',              11,true, 23.100,72.540,4.8, 64,89),
      ('Ramu Mali',       '+919789065412','gardener',   'Lawn maintenance and plant setup.',                                 500,'visit',  'Prahladnagar, Satellite',        9,false,23.010,72.500,4.5, 29,72)
    ) as x(name,phone,cat,about,price,unit,area,exp,verified,lat,lng,rating,reviews,resp)
  loop
    select id into v_cat from public.categories where key = r.cat;

    -- create demo auth user (trigger creates the profile)
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, phone, phone_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      r.phone, now(), now(), now(),
      '{"provider":"phone"}',
      jsonb_build_object('full_name', r.name, 'role', 'provider')
    )
    on conflict (phone) do nothing;

    -- listing
    insert into public.providers (
      user_id, name, phone, category_id, about, starting_price, price_unit,
      service_area, experience_yrs, verified, kyc_status, available,
      rating_avg, rating_count, response_rate, lat, lng
    ) values (
      v_uid, r.name, r.phone, v_cat, r.about, r.price, r.unit::price_unit,
      r.area, r.exp, r.verified, case when r.verified then 'verified' else 'none' end::kyc_status, true,
      r.rating, r.reviews, r.resp, r.lat, r.lng
    )
    on conflict (user_id) do nothing
    returning id into v_pid;

    -- a couple of services per provider (generic)
    if v_pid is not null then
      insert into public.provider_services (provider_id, name, price, unit, sort_order) values
        (v_pid, 'Basic service', r.price, r.unit::price_unit, 1),
        (v_pid, 'Site visit',    greatest(r.price/2,100), 'visit'::price_unit, 2);
    end if;
  end loop;
end $$;

-- Keep the marketing rating numbers from the prototype (the rating trigger
-- would otherwise recompute from the tiny number of seeded reviews).
-- Real reviews will drive these once customers start rating.
