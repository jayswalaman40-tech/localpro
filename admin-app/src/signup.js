// =====================================================================
// HelpZo — public provider registration form (signup.html).
// Writes a row to public.provider_signups via the anon key (RLS allows
// anonymous insert). No login required; the admin panel reviews signups.
// =====================================================================
import { supabase, hasSupabase } from './supabase.js';

const CATS = [
  { key: 'plumber', label: 'Plumber' },
  { key: 'electrician', label: 'Electrician' },
  { key: 'ac_repair', label: 'AC Repair' },
  { key: 'carpenter', label: 'Carpenter' },
  { key: 'painter', label: 'Painter' },
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'home_repair', label: 'Home Repair' },
  { key: 'appliance', label: 'Appliance Repair' },
  { key: 'pest_control', label: 'Pest Control' },
  { key: 'salon', label: 'Salon at Home' },
  { key: 'cctv', label: 'CCTV & Security' },
  { key: 'geyser', label: 'Geyser Repair' },
  { key: 'ro', label: 'RO / Water Purifier' },
  { key: 'gardening', label: 'Gardening' },
  { key: 'movers', label: 'Packers & Movers' },
];
const SUBCATS = {
  plumber: ['Tap & Mixer Repair', 'Pipe Fitting', 'Leakage Repair', 'Drain / Blockage', 'Water Tank', 'Bathroom Fitting', 'Motor & Pump', 'Wash Basin / Sink'],
  electrician: ['Wiring & Rewiring', 'Switch & Socket', 'Fan Installation', 'Lights & Fixtures', 'MCB & Fuse', 'Inverter & Battery', 'Doorbell', 'Appliance Wiring'],
  ac_repair: ['AC Service', 'AC Installation', 'Gas Refilling', 'AC Not Cooling', 'AC Repair', 'AC Uninstall', 'Window AC', 'Split AC'],
  carpenter: ['Furniture Repair', 'Door & Window', 'Modular Kitchen', 'Bed & Sofa', 'Wardrobe / Almirah', 'Wood Polish', 'Drawer & Hinges', 'Curtain Rod'],
  painter: ['Interior Painting', 'Exterior Painting', 'Wall Texture', 'Waterproofing', 'Wood / Metal Paint', 'POP & False Ceiling', 'Single Room', 'Full Home'],
  cleaning: ['Home Deep Cleaning', 'Bathroom Cleaning', 'Kitchen Cleaning', 'Sofa Cleaning', 'Water Tank Cleaning', 'Move-in / Move-out', 'Office Cleaning', 'Floor Scrubbing'],
  home_repair: ['Minor Repairs', 'Wall Mounting', 'Furniture Assembly', 'Door Lock', 'Handyman', 'Tile / Grouting'],
  appliance: ['Washing Machine', 'Refrigerator', 'Microwave', 'Chimney', 'Dishwasher', 'Water Purifier (RO)'],
  pest_control: ['General Pest Control', 'Cockroach', 'Termite', 'Bed Bugs', 'Mosquito', 'Rodent / Rat'],
  salon: ['Haircut & Styling', 'Facial & Cleanup', 'Waxing', 'Manicure & Pedicure', 'Massage', 'Bridal Makeup'],
  cctv: ['CCTV Installation', 'CCTV Repair', 'DVR / NVR Setup', 'Video Door Phone', 'Biometric Lock'],
  geyser: ['Geyser Service', 'Geyser Installation', 'Geyser Repair', 'Element / Thermostat'],
  ro: ['RO Service', 'RO Installation', 'RO Repair', 'Filter Change', 'Water Purifier AMC'],
  gardening: ['Garden Maintenance', 'Lawn Mowing', 'Plant Care', 'Landscaping', 'Tree Trimming'],
  movers: ['House Shifting', 'Office Shifting', 'Packing & Moving', 'Loading & Unloading', 'Single Item Move'],
};
const AREAS = ['Bodakdev', 'Satellite', 'Vastrapur', 'Thaltej', 'Bopal', 'South Bopal', 'Prahlad Nagar', 'Jodhpur', 'Ambawadi', 'Navrangpura', 'Naranpura', 'Vadaj', 'Sabarmati', 'Chandkheda', 'Motera', 'Gota', 'Chandlodia', 'Ghatlodia', 'Ranip', 'Memnagar', 'Jivraj Park', 'Vejalpur', 'Juhapura', 'Sarkhej', 'Makarba', 'Ghuma', 'Shela', 'Science City', 'Sola', 'Shilaj', 'Gurukul', 'Usmanpura', 'Paldi', 'Vasna', 'Maninagar', 'Isanpur', 'Vatva', 'Ghodasar', 'Khokhra', 'Amraiwadi', 'Nikol', 'Naroda', 'Bapunagar', 'Odhav', 'Vastral', 'Ramol', 'CTM', 'Hatkeshwar', 'Rakhial', 'Shahibaug', 'Kalupur', 'Kankaria', 'Ellis Bridge', 'Law Garden', 'Stadium', 'SG Highway', 'Sindhu Bhavan Road', 'Shyamal', 'Ramdevnagar'];

const $ = (id) => document.getElementById(id);

// Populate category + area controls.
$('category').insertAdjacentHTML('beforeend', CATS.map((c) => `<option value="${c.key}">${c.label}</option>`).join(''));
$('areaList').innerHTML = AREAS.map((a) => `<option value="${a}">`).join('');

// Category → multi-select sub-service chips.
function renderSubChips() {
  const subs = SUBCATS[$('category').value] || [];
  const box = $('subChips');
  box.innerHTML = subs.length
    ? subs.map((s) => `<span class="chip" data-sub="${s}">${s}</span>`).join('')
    : '<div class="muted-note">No sub-services for this category.</div>';
}
function selectedSubs() {
  return [...document.querySelectorAll('#subChips .chip.on')].map((c) => c.getAttribute('data-sub'));
}
$('category').addEventListener('change', renderSubChips);
$('subChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip'); if (chip) chip.classList.toggle('on');
});

$('mobile').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });

function showErr(id, on) { const el = $('e-' + id); if (el) el.style.display = on ? 'block' : 'none'; }

$('regForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('company').value) return;              // honeypot tripped → silently ignore
  const name = $('name').value.trim();
  const mobile = $('mobile').value.trim();
  const category = $('category').value;
  const subs = selectedSubs();
  const subcategory = subs.length ? subs.join(', ') : null;
  const area = $('area').value.trim();

  let ok = true;
  showErr('name', !name); if (!name) ok = false;
  const mobOk = /^[6-9]\d{9}$/.test(mobile); showErr('mobile', !mobOk); if (!mobOk) ok = false;
  showErr('category', !category); if (!category) ok = false;
  showErr('area', !area); if (!area) ok = false;
  showErr('form', false);
  if (!ok) return;

  const btn = $('submitBtn'); btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    if (!hasSupabase) throw new Error('offline');
    const { error } = await supabase.from('provider_signups')
      .insert({ name, mobile: '+91' + mobile, category, subcategory, area });
    if (error) throw error;
    $('regForm').style.display = 'none';
    $('done').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showErr('form', true);
    $('e-form').textContent = (err && err.message === 'offline')
      ? 'Setup pending — form will go live once the database is connected.'
      : 'Could not submit. Please check your details and try again.';
  } finally { btn.disabled = false; btn.textContent = 'Register as Provider'; }
});

$('again').addEventListener('click', () => {
  $('regForm').reset();
  $('subChips').innerHTML = '<div class="muted-note">Choose a category first.</div>';
  $('regForm').style.display = 'block';
  $('done').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
