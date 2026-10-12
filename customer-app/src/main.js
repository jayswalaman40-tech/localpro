// =====================================================================
// HelpZo Customer — app logic (Capacitor + Vite, wired to Supabase)
// UI markup/CSS in index.html. Data layer in api.js.
// Design: 10-screen HelpZo Customer spec (blue/green, Inter).
// =====================================================================
import * as api from './api.js';
import { hasSupabase } from './supabase.js';
import { nearbyMap, demoProviders, locationPicker } from './maps.js';

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const initials = (name) => String(name || '?').trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const telHref = (p) => 'tel:' + String(p || '').replace(/[^\d+]/g, '');

/* ---------- state ---------- */
let stack = ['splash'];
let session = null;
let myProfile = null;
let selectedProvider = null;
let selectedCat = null;            // category key, e.g. 'plumber'
let selectedSub = null;            // chosen subcategory label (for list title)
let searchQuery = '';              // active search text
let subcatParent = null;           // category key whose subcategories are shown
let catMap = {};                   // category uuid -> label
let catByKey = {};                 // category key  -> uuid
let providerCache = {};            // id -> normalized provider (from lists)
let lastListRows = [];             // providers currently shown on the list screen
let listSort = 'all';              // all | rating | dist | price
let lastBookings = [];             // bookings currently loaded (for filter chips)
let localBookings = [];            // bookings made this session (shown immediately)
let bookFilter = 'upcoming';       // upcoming | completed | cancelled
let selectedServices = [];         // multi-selected service labels (service picker)
let toastTimer = null;

/* ---------- avatar helper (photo or initials) ---------- */
// Shows the uploaded profile photo (data URL) when present, else the initials.
function paintAvatar(el, name, url) {
  if (!el) return;
  if (url) { el.style.backgroundImage = `url("${url}")`; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center'; el.textContent = ''; }
  else { el.style.backgroundImage = 'none'; el.textContent = initials(name || 'Guest User'); }
}
// Read a picked image file, downscale to ~256px, return a small JPEG data URL.
function fileToAvatarDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('no file'));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('read failed'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        const S = 256; const c = document.createElement('canvas'); c.width = S; c.height = S;
        const ctx = c.getContext('2d');
        const scale = Math.max(S / img.width, S / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// Normalize a Supabase provider/RPC row into the shape the UI cards use.
function provFromRow(p) {
  return {
    id: p.id,
    name: p.name,
    trade: catMap[p.category_id] || p.custom_category || 'Service Pro',
    rating: Number(p.rating_avg ?? 0) || 0,
    reviews: p.rating_count ?? 0,
    dist: (p.distance_km != null) ? Number(p.distance_km).toFixed(1) : '—',
    price: p.starting_price ?? 200,
    exp: p.experience_yrs ? p.experience_yrs + ' years exp' : '',
    about: p.about || '',
    area: p.service_area || 'Ahmedabad',
    phone: p.phone || null,
    verified: p.verified,
  };
}

/* ---------- categories (icon + color) ---------- */
// Full catalog. The first 7 are the "Popular Services" shown on Home; the rest
// surface via the "More" tile / All Categories screen.
const CATS = [
  { key:'plumber', label:'Plumber', icon:'🚰', color:'#2680EB' },
  { key:'electrician', label:'Electrician', icon:'⚡', color:'#F5A623' },
  { key:'ac_repair', label:'AC Repair', icon:'❄️', color:'#4FC3F7' },
  { key:'carpenter', label:'Carpenter', icon:'🔧', color:'#8B5E3C' },
  { key:'painter', label:'Painter', icon:'🎨', color:'#C724B1' },
  { key:'cleaning', label:'Cleaning', icon:'🧹', color:'#2E9E5B' },
  { key:'home_repair', label:'Home Repair', icon:'🏠', color:'#F5821F' },
  { key:'appliance', label:'Appliance Repair', icon:'🔌', color:'#7E57C2' },
  { key:'pest_control', label:'Pest Control', icon:'🐜', color:'#8D6E63' },
  { key:'salon', label:'Salon at Home', icon:'💇', color:'#EC407A' },
  { key:'cctv', label:'CCTV & Security', icon:'📹', color:'#455A64' },
  { key:'geyser', label:'Geyser Repair', icon:'🔥', color:'#EF5350' },
  { key:'ro', label:'RO / Water Purifier', icon:'💧', color:'#26C6DA' },
  { key:'gardening', label:'Gardening', icon:'🌱', color:'#43A047' },
  { key:'movers', label:'Packers & Movers', icon:'📦', color:'#FB8C00' },
];
const POPULAR = CATS.slice(0, 7);   // Home grid (7 + a "More" tile)
const MORE_TILE = { key:'__more', label:'More', icon:'⋯', color:'#B8C0CC' };

// Subcategories per category — tapping a category opens this list.
const SUBCATS = {
  plumber: ['Tap & Mixer Repair','Pipe Fitting','Leakage Repair','Drain / Blockage','Water Tank','Bathroom Fitting','Motor & Pump','Wash Basin / Sink'],
  electrician: ['Wiring & Rewiring','Switch & Socket','Fan Installation','Lights & Fixtures','MCB & Fuse','Inverter & Battery','Doorbell','Appliance Wiring'],
  ac_repair: ['AC Service','AC Installation','Gas Refilling','AC Not Cooling','AC Repair','AC Uninstall','Window AC','Split AC'],
  carpenter: ['Furniture Repair','Door & Window','Modular Kitchen','Bed & Sofa','Wardrobe / Almirah','Wood Polish','Drawer & Hinges','Curtain Rod'],
  painter: ['Interior Painting','Exterior Painting','Wall Texture','Waterproofing','Wood / Metal Paint','POP & False Ceiling','Single Room','Full Home'],
  cleaning: ['Home Deep Cleaning','Bathroom Cleaning','Kitchen Cleaning','Sofa Cleaning','Water Tank Cleaning','Move-in / Move-out','Office Cleaning','Floor Scrubbing'],
  home_repair: ['Minor Repairs','Wall Mounting','Furniture Assembly','Door Lock','Handyman','Tile / Grouting'],
  appliance: ['Washing Machine','Refrigerator','Microwave','Chimney','Dishwasher','Water Purifier (RO)'],
  pest_control: ['General Pest Control','Cockroach','Termite','Bed Bugs','Mosquito','Rodent / Rat'],
  salon: ['Haircut & Styling','Facial & Cleanup','Waxing','Manicure & Pedicure','Massage','Bridal Makeup'],
  cctv: ['CCTV Installation','CCTV Repair','DVR / NVR Setup','Video Door Phone','Biometric Lock'],
  geyser: ['Geyser Service','Geyser Installation','Geyser Repair','Element / Thermostat'],
  ro: ['RO Service','RO Installation','RO Repair','Filter Change','Water Purifier AMC'],
  gardening: ['Garden Maintenance','Lawn Mowing','Plant Care','Landscaping','Tree Trimming'],
  movers: ['House Shifting','Office Shifting','Packing & Moving','Loading & Unloading','Single Item Move'],
};

/* ---------- demo data (keeps screens populated) ---------- */
const DEMO_PROVIDERS = [
  // Plumber (multiple so lists never look empty)
  { id:'d1', name:'Ramesh Singh', cat:'plumber', trade:'Plumber', rating:4.8, reviews:124, dist:2.1, price:200, exp:'5+ years exp', verified:true },
  { id:'d1b', name:'Dinesh Patel', cat:'plumber', trade:'Plumber', rating:4.6, reviews:86, dist:3.4, price:180, exp:'4 years exp', verified:true },
  { id:'d1c', name:'Kiran Solanki', cat:'plumber', trade:'Plumber', rating:4.5, reviews:52, dist:4.0, price:220, exp:'6 years exp', verified:true },
  // Electrician
  { id:'d2', name:'Jayesh Patel', cat:'electrician', trade:'Electrician', rating:4.6, reviews:98, dist:3.5, price:250, exp:'4 years exp', verified:true },
  { id:'d2b', name:'Arjun Mehta', cat:'electrician', trade:'Electrician', rating:4.9, reviews:133, dist:1.9, price:280, exp:'7 years exp', verified:true },
  { id:'d2c', name:'Sohel Shaikh', cat:'electrician', trade:'Electrician', rating:4.4, reviews:61, dist:4.6, price:230, exp:'3 years exp', verified:true },
  // AC Repair
  { id:'d3', name:'Imran Khan', cat:'ac_repair', trade:'AC Repair', rating:4.5, reviews:76, dist:4.8, price:220, exp:'6 years exp', verified:true },
  { id:'d3b', name:'Cooltech Services', cat:'ac_repair', trade:'AC Repair', rating:4.7, reviews:104, dist:2.5, price:299, exp:'8 years exp', verified:true },
  { id:'d3c', name:'Vipul Rana', cat:'ac_repair', trade:'AC Repair', rating:4.3, reviews:40, dist:5.1, price:250, exp:'4 years exp', verified:true },
  // Carpenter
  { id:'d4', name:'Mukesh Yadav', cat:'carpenter', trade:'Carpenter', rating:4.3, reviews:54, dist:5.2, price:180, exp:'3 years exp', verified:true },
  { id:'d4b', name:'Harish Vishwakarma', cat:'carpenter', trade:'Carpenter', rating:4.8, reviews:97, dist:2.8, price:250, exp:'9 years exp', verified:true },
  // Painter
  { id:'d5', name:'Sanjay Mehta', cat:'painter', trade:'Painter', rating:4.7, reviews:88, dist:3.0, price:300, exp:'7 years exp', verified:true },
  { id:'d5b', name:'ColorHome Painters', cat:'painter', trade:'Painter', rating:4.6, reviews:72, dist:4.2, price:280, exp:'6 years exp', verified:true },
  // Cleaning
  { id:'d6', name:'Pooja Shah', cat:'cleaning', trade:'Cleaning', rating:4.9, reviews:142, dist:1.8, price:150, exp:'4 years exp', verified:true },
  { id:'d6b', name:'SparkleClean Pros', cat:'cleaning', trade:'Cleaning', rating:4.7, reviews:111, dist:3.1, price:199, exp:'5 years exp', verified:true },
  // Home repair
  { id:'d7', name:'Rakesh Verma', cat:'home_repair', trade:'Home Repair', rating:4.4, reviews:61, dist:4.1, price:200, exp:'5 years exp', verified:true },
  { id:'d7b', name:'FixIt Handyman', cat:'home_repair', trade:'Home Repair', rating:4.6, reviews:83, dist:2.4, price:180, exp:'6 years exp', verified:true },
  // Long-tail (2 each)
  { id:'d8', name:'Amit Chauhan', cat:'appliance', trade:'Appliance Repair', rating:4.5, reviews:73, dist:3.9, price:250, exp:'6 years exp', verified:true },
  { id:'d8b', name:'HomeCare Appliances', cat:'appliance', trade:'Appliance Repair', rating:4.7, reviews:59, dist:2.7, price:299, exp:'7 years exp', verified:true },
  { id:'d9', name:'HealthyHome Pest', cat:'pest_control', trade:'Pest Control', rating:4.6, reviews:52, dist:5.0, price:500, exp:'8 years exp', verified:true },
  { id:'d9b', name:'SafeGuard Pest', cat:'pest_control', trade:'Pest Control', rating:4.4, reviews:34, dist:4.3, price:450, exp:'5 years exp', verified:true },
  { id:'d10', name:'Glow Salon at Home', cat:'salon', trade:'Salon at Home', rating:4.8, reviews:110, dist:2.6, price:400, exp:'5 years exp', verified:true },
  { id:'d10b', name:'Blush Beauty', cat:'salon', trade:'Salon at Home', rating:4.7, reviews:88, dist:3.3, price:450, exp:'4 years exp', verified:true },
  { id:'d11', name:'SecureView CCTV', cat:'cctv', trade:'CCTV & Security', rating:4.4, reviews:39, dist:6.2, price:800, exp:'7 years exp', verified:true },
  { id:'d12', name:'Nitin Prajapati', cat:'geyser', trade:'Geyser Repair', rating:4.5, reviews:47, dist:3.3, price:250, exp:'4 years exp', verified:true },
  { id:'d13', name:'AquaCare RO', cat:'ro', trade:'RO / Water Purifier', rating:4.7, reviews:64, dist:2.9, price:350, exp:'5 years exp', verified:true },
  { id:'d14', name:'GreenThumb Garden', cat:'gardening', trade:'Gardening', rating:4.6, reviews:33, dist:4.7, price:400, exp:'6 years exp', verified:true },
  { id:'d15', name:'QuickShift Movers', cat:'movers', trade:'Packers & Movers', rating:4.5, reviews:81, dist:5.5, price:1500, exp:'9 years exp', verified:true },
];
const DEMO_BOOKINGS = [
  { service:'AC Repair', provider:'Suresh Kumar', when:'12 Sep 2025 • 5:00 PM', addr:'Bopal, Ahmedabad', pill:'green', status:'Confirmed' },
  { service:'Electrician', provider:'Ajay Sharma', when:'15 Sep 2025 • 4:00 PM', addr:'Satellite, Ahmedabad', pill:'orange', status:'Pending' },
  { service:'Carpenter', provider:'Mahesh Patel', when:'18 Sep 2025 • 11:00 AM', addr:'Thaltej, Ahmedabad', pill:'green', status:'Confirmed' },
];
const DEMO_NOTIF = [
  { color:'#22B24C', ic:'✓', title:'Service Request Accepted', body:'Ramesh Singh has accepted your AC repair request.', ago:'2m ago', go:'bookings' },
  { color:'#1667E8', ic:'📅', title:'Booking Confirmed', body:'Your booking for electrician service is confirmed for 15 Sep 2025.', ago:'1h ago', go:'bookings' },
  { color:'#F5A623', ic:'🏷️', title:'New Offer', body:'Get 15% OFF on your first AC service booking!', ago:'3h ago', go:'home' },
  { color:'#F5A623', ic:'🔔', title:'Reminder', body:'Your appointment is tomorrow at 5:00 PM.', ago:'1d ago', go:'bookings' },
  { color:'#F6B01E', ic:'★', title:'Review Request', body:'Please share your experience with Ramesh Singh.', ago:'1d ago', go:'bookings' },
];
// Where a notification should take the customer when tapped.
function notifTarget(type) {
  return ({ booking:'bookings', lead:'bookings', review:'bookings', offer:'home', system:'home' })[type] || 'bookings';
}

/* ---------- toast ---------- */
function toast(msg) {
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- navigation ---------- */
const TAB_SCREENS = ['home', 'bookings', 'account'];
function show(id, push = true) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
  const el = $('s-' + id); if (!el) return;
  el.classList.add('on');
  const sc = el.querySelector('.scroll'); if (sc) sc.scrollTop = 0;
  if (push && stack[stack.length - 1] !== id) stack.push(id);
  onEnter(id);
  applyLang(curLang, el);   // translate this screen (incl. freshly-rendered content)
}
function back() { if (stack.length > 1) { stack.pop(); show(stack[stack.length - 1], false); } else show('home', false); }
window.show = show;
window.back = back;
// Android hardware back button → go back one screen (exit app only at a root).
(async () => {
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => { if (stack.length > 1) back(); else App.exitApp(); });
  } catch (e) { /* web preview — no native back button */ }
})();

/* ---------- i18n (English / हिन्दी / ગુજરાતી) ---------- */
let curLang = 'en';
const LANGS = { en: 'English', hi: 'हिन्दी', gu: 'ગુજરાતી' };
const I18N = {
  hi: {
    'Home': 'होम', 'Bookings': 'बुकिंग', 'Profile': 'प्रोफ़ाइल', 'Account': 'खाता',
    'Popular Services': 'लोकप्रिय सेवाएँ', 'See All': 'सभी देखें', 'See all': 'सभी देखें',
    'Top Providers Near You': 'आपके पास टॉप प्रोवाइडर', 'Nearby Providers': 'आस-पास के प्रोवाइडर',
    'Verified professionals near you': 'आपके पास सत्यापित पेशेवर', 'Near your location': 'आपके स्थान के पास',
    'Login to Your Account': 'अपने खाते में लॉगिन करें', 'Get OTP': 'OTP पाएं',
    'Verify & Continue': 'सत्यापित करें और जारी रखें', 'Verify OTP': 'OTP सत्यापित करें',
    'Enter Mobile Number': 'मोबाइल नंबर दर्ज करें', 'Change': 'बदलें', 'Resend OTP': 'OTP फिर भेजें',
    'Book Service': 'सेवा बुक करें', 'Book Now': 'अभी बुक करें', 'Confirm Booking': 'बुकिंग पक्की करें',
    'Select Date & Time': 'तारीख़ और समय चुनें', 'Service Address': 'सेवा का पता',
    'Enter your service address': 'अपनी सेवा का पता दर्ज करें', 'Additional Note (Optional)': 'अतिरिक्त नोट (वैकल्पिक)',
    'Today': 'आज', 'Tomorrow': 'कल', 'My Bookings': 'मेरी बुकिंग',
    'Upcoming': 'आगामी', 'Completed': 'पूर्ण', 'Cancelled': 'रद्द',
    'Edit Profile': 'प्रोफ़ाइल संपादित करें', 'Personal Details': 'व्यक्तिगत विवरण',
    'Full Name': 'पूरा नाम', 'Mobile Number': 'मोबाइल नंबर', 'Email Address': 'ईमेल पता',
    'Gender': 'लिंग', 'Male': 'पुरुष', 'Female': 'महिला', 'Other': 'अन्य',
    'Address': 'पता', 'Full Address': 'पूरा पता', 'Save Profile': 'प्रोफ़ाइल सहेजें',
    'Complete Profile': 'प्रोफ़ाइल पूरा करें', 'Logout': 'लॉग आउट', 'Guest User': 'अतिथि उपयोगकर्ता',
    'Support': 'सहायता', 'Legal': 'कानूनी', 'Help & Support': 'मदद और सहायता',
    'Terms & Conditions': 'नियम और शर्तें', 'Privacy Policy': 'गोपनीयता नीति',
    'Refund & Cancellation': 'रिफंड और रद्दीकरण', 'About HelpZo': 'HelpZo के बारे में',
    'Trust, Safety & Verification': 'विश्वास, सुरक्षा और सत्यापन', 'Notifications': 'सूचनाएं',
    'Approve & Pay': 'स्वीकृत करें और भुगतान करें', 'Dispute': 'विवाद', 'Total': 'कुल', 'Done': 'पूर्ण',
    'Reviews': 'समीक्षाएं', 'Language': 'भाषा', 'Choose your language': 'अपनी भाषा चुनें',
    'Need a Service?': 'सेवा चाहिए?', "We're here to help!": 'हम मदद के लिए हैं!', 'View Profile': 'प्रोफ़ाइल देखें',
    'Plumber': 'प्लंबर', 'Electrician': 'इलेक्ट्रीशियन', 'AC Repair': 'AC रिपेयर', 'Carpenter': 'बढ़ई',
    'Painter': 'पेंटर', 'Cleaning': 'सफ़ाई', 'Home Repair': 'घर मरम्मत', 'More': 'और',
    'Call': 'कॉल करें', 'Message': 'संदेश', 'Reschedule': 'पुनर्निर्धारित करें', 'View Details': 'विवरण देखें',
  },
  gu: {
    'Home': 'હોમ', 'Bookings': 'બુકિંગ', 'Profile': 'પ્રોફાઇલ', 'Account': 'એકાઉન્ટ',
    'Popular Services': 'લોકપ્રિય સેવાઓ', 'See All': 'બધું જુઓ', 'See all': 'બધું જુઓ',
    'Top Providers Near You': 'તમારી નજીક ટોપ પ્રોવાઇડર', 'Nearby Providers': 'નજીકના પ્રોવાઇડર',
    'Verified professionals near you': 'તમારી નજીક ચકાસાયેલ વ્યાવસાયિકો', 'Near your location': 'તમારા સ્થાન પાસે',
    'Login to Your Account': 'તમારા એકાઉન્ટમાં લૉગિન કરો', 'Get OTP': 'OTP મેળવો',
    'Verify & Continue': 'ચકાસો અને આગળ વધો', 'Verify OTP': 'OTP ચકાસો',
    'Enter Mobile Number': 'મોબાઇલ નંબર દાખલ કરો', 'Change': 'બદલો', 'Resend OTP': 'OTP ફરી મોકલો',
    'Book Service': 'સેવા બુક કરો', 'Book Now': 'હમણાં બુક કરો', 'Confirm Booking': 'બુકિંગ કન્ફર્મ કરો',
    'Select Date & Time': 'તારીખ અને સમય પસંદ કરો', 'Service Address': 'સેવાનું સરનામું',
    'Enter your service address': 'તમારી સેવાનું સરનામું દાખલ કરો', 'Additional Note (Optional)': 'વધારાની નોંધ (વૈકલ્પિક)',
    'Today': 'આજે', 'Tomorrow': 'આવતીકાલે', 'My Bookings': 'મારી બુકિંગ',
    'Upcoming': 'આગામી', 'Completed': 'પૂર્ણ', 'Cancelled': 'રદ',
    'Edit Profile': 'પ્રોફાઇલ સંપાદિત કરો', 'Personal Details': 'વ્યક્તિગત વિગતો',
    'Full Name': 'પૂરું નામ', 'Mobile Number': 'મોબાઇલ નંબર', 'Email Address': 'ઇમેઇલ સરનામું',
    'Gender': 'લિંગ', 'Male': 'પુરુષ', 'Female': 'સ્ત્રી', 'Other': 'અન્ય',
    'Address': 'સરનામું', 'Full Address': 'પૂરું સરનામું', 'Save Profile': 'પ્રોફાઇલ સાચવો',
    'Complete Profile': 'પ્રોફાઇલ પૂર્ણ કરો', 'Logout': 'લૉગ આઉટ', 'Guest User': 'અતિથિ વપરાશકર્તા',
    'Support': 'સપોર્ટ', 'Legal': 'કાનૂની', 'Help & Support': 'મદદ અને સપોર્ટ',
    'Terms & Conditions': 'નિયમો અને શરતો', 'Privacy Policy': 'ગોપનીયતા નીતિ',
    'Refund & Cancellation': 'રિફંડ અને રદ્દીકરણ', 'About HelpZo': 'HelpZo વિશે',
    'Trust, Safety & Verification': 'વિશ્વાસ, સલામતી અને ચકાસણી', 'Notifications': 'સૂચનાઓ',
    'Approve & Pay': 'મંજૂર કરો અને ચૂકવો', 'Dispute': 'વિવાદ', 'Total': 'કુલ', 'Done': 'થઈ ગયું',
    'Reviews': 'સમીક્ષાઓ', 'Language': 'ભાષા', 'Choose your language': 'તમારી ભાષા પસંદ કરો',
    'Need a Service?': 'સેવા જોઈએ છે?', "We're here to help!": 'અમે મદદ માટે છીએ!', 'View Profile': 'પ્રોફાઇલ જુઓ',
    'Plumber': 'પ્લમ્બર', 'Electrician': 'ઇલેક્ટ્રિશિયન', 'AC Repair': 'AC રિપેર', 'Carpenter': 'સુથાર',
    'Painter': 'પેઇન્ટર', 'Cleaning': 'સફાઈ', 'Home Repair': 'ઘર સમારકામ', 'More': 'વધુ',
    'Call': 'કૉલ કરો', 'Message': 'સંદેશ', 'Reschedule': 'ફરી શેડ્યૂલ કરો', 'View Details': 'વિગતો જુઓ',
  },
};
const _origText = new WeakMap();
function applyLang(code, root) {
  const scope = root || document.body;
  // revert cached originals (back to English) within scope
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((n) => { if (_origText.has(n)) { n.nodeValue = _origText.get(n); } });
  if (code && code !== 'en') {
    const dict = I18N[code] || {};
    nodes.forEach((n) => {
      const key = (n.nodeValue || '').trim();
      if (!key || !dict[key]) return;
      if (!_origText.has(n)) _origText.set(n, n.nodeValue);
      n.nodeValue = n.nodeValue.replace(key, dict[key]);
    });
  }
}
function setLang(code) {
  curLang = code;
  try { localStorage.setItem('helpzo_lang', code); } catch (e) {}
  if (hasSupabase && session) { try { api.updateMyProfile({ preferred_lang: code }); } catch (e) {} }
  applyLang(code, document.body);
  renderLangScreen();
}
function renderLangScreen() {
  const el = $('langList'); if (!el) return;
  el.innerHTML = Object.entries(LANGS).map(([code, name]) =>
    `<div class="mrow" data-lang="${code}"><span class="ml">${name}</span><span class="mc">${code === curLang ? '✓' : '›'}</span></div>`).join('<div class="divide"></div>');
}

/* ---------- theme (light / dark) ---------- */
let curTheme = 'light';
function applyTheme(t) {
  curTheme = (t === 'dark') ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', curTheme);
  try { localStorage.setItem('helpzo_theme', curTheme); } catch (e) {}
  $('themeToggle')?.classList.toggle('on', curTheme === 'dark');
}
function toggleTheme() { applyTheme(curTheme === 'dark' ? 'light' : 'dark'); }

/* ---------- tab bar ---------- */
const TABS = [
  { id:'home', ic:'🏠', lb:'Home' },
  { id:'bookings', ic:'📋', lb:'Bookings' },
  { id:'account', ic:'👤', lb:'Profile' },
];
function buildTabBars() {
  document.querySelectorAll('[data-tabbar]').forEach((bar) => {
    const cur = bar.closest('.screen').id.replace('s-', '');
    const active = cur === 'notifications' ? 'account' : cur;
    bar.innerHTML = TABS.map((tb) => `<div class="tab${tb.id === active ? ' on' : ''}" data-tab="${tb.id}"><span class="ti">${tb.ic}</span>${tb.lb}</div>`).join('');
  });
}

/* ---------- enter hooks ---------- */
function onEnter(id) {
  if (id === 'home') renderHome();
  if (id === 'list') renderList();
  if (id === 'profile') renderProfile();
  if (id === 'book') renderBook();
  if (id === 'bookings') renderBookings();
  if (id === 'notifications') renderNotif();
  if (id === 'account') renderAccount();
  if (id === 'editprofile') renderEditProfile();
  if (id === 'lang') renderLangScreen();
  if (id === 'city') renderCityScreen();
  if (id === 'booked') renderBooked();
  if (id === 'chat') renderChat();
  if (id === 'feedback') renderFeedback();
  if (id === 'map') renderMapScreen();
}

/* ---------- nearby providers map ---------- */
let mapCat = null;   // category filter on the map screen
async function renderMapScreen() {
  applyProfileCity();
  // category chips (All + popular)
  const chips = $('mapChips');
  if (chips) {
    chips.innerHTML = `<div class="chip${!mapCat ? ' on' : ''}" data-mapcat="">All</div>`
      + POPULAR.map((c) => `<div class="chip${mapCat === c.key ? ' on' : ''}" data-mapcat="${c.key}">${esc(c.label)}</div>`).join('');
  }
  const el = $('nearbyMap'); if (!el) return;
  // gather providers (real when signed in, else demo scatter)
  let provs = null, center = null;
  if (hasSupabase) {
    try {
      const loc = await api.getCurrentLocation(); center = loc;
      const catId = mapCat ? (catByKey[mapCat] || null) : null;
      const live = await api.searchProviders({ lat: loc.lat, lng: loc.lng, categoryId: catId, radiusKm: 50 });
      provs = (live || []).filter((p) => p.lat != null && p.lng != null).map((p) => ({
        lat: p.lat, lng: p.lng, name: p.name,
        etaMin: Math.max(2, Math.round((Number(p.distance_km) || 2) * 3)),
      }));
    } catch (e) { provs = null; }
  }
  if (!provs || !provs.length) provs = demoProviders(center);   // offline / none nearby
  const catLabel = mapCat ? (CATS.find((c) => c.key === mapCat)?.label || 'Providers') : 'Providers';
  setMapText('mapSheetTitle', 'Nearby ' + catLabel);
  setMapText('mapCount', String(provs.length));
  await nearbyMap(el, provs);
}
function setMapText(id, v) { const e = $(id); if (e) e.textContent = v; }

/* ---------- service matching + provider badges ---------- */
// Deterministic hash so a provider's offered-service set is stable across renders.
function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return Math.abs(h); }
// Which services (from its category) a provider offers. Synthesised deterministically
// so lists stay stable; ~2/3 of the category's services per provider.
function providerServices(p) {
  const all = SUBCATS[p.cat || selectedCat] || [];
  return all.filter((s) => hashCode(String(p.id) + '|' + s) % 3 !== 0);
}
// How many of the currently-selected services this provider offers.
function serviceMatch(p) {
  if (!selectedServices.length) return { n: 0, all: false };
  const offered = providerServices(p).map((s) => s.toLowerCase());
  const n = selectedServices.filter((s) => offered.includes(String(s).toLowerCase())).length;
  return { n, all: n === selectedServices.length && n > 0 };
}
// Location + rating driven badges, computed over the *visible* set.
function computeBadges(rows) {
  const map = {}; if (!rows.length) return map;
  const add = (id, k) => { (map[id] = map[id] || []).push(k); };
  const near = rows.reduce((a, c) => ((parseFloat(c.dist) || 1e9) < (parseFloat(a.dist) || 1e9) ? c : a));
  const best = rows.reduce((a, c) => ((c.rating || 0) > (a.rating || 0) ? c : a));
  const pop = rows.reduce((a, c) => ((c.reviews || 0) > (a.reviews || 0) ? c : a));
  if (parseFloat(near.dist) < 1e9) add(near.id, 'near');
  if ((best.rating || 0) >= 4.5) add(best.id, 'best');
  if ((pop.reviews || 0) >= 80 && pop.id !== best.id) add(pop.id, 'pop');
  return map;
}
const BADGE_META = {
  near: ['#1667E8', '📍', 'Nearest'], best: ['#F6B01E', '⭐', 'Top Rated'],
  pop: ['#E5484D', '🔥', 'Popular'], allsvc: ['#22B24C', '✅', 'All services'],
};
function badgeHtml(keys) {
  if (!keys || !keys.length) return '';
  return `<div class="pbadges">` + keys.map((k) => {
    const m = BADGE_META[k]; if (!m) return '';
    return `<span class="pbadge" style="background:${m[0]}1f;color:${m[0]}">${m[1]} ${m[2]}</span>`;
  }).join('') + `</div>`;
}

/* ---------- renderers ---------- */
function catCell(c) {
  return `<div class="scell" data-cat="${c.key}" data-label="${esc(c.label)}"><div class="scirc" style="background:${c.color}">${c.icon}</div><span class="lb">${esc(c.label)}</span></div>`;
}
function provAvatarHtml(p, size) {
  const s = size || 64;
  if (p.avatar || p.photo) return `<div class="avatar" style="width:${s}px;height:${s}px;border-radius:16px;background-image:url('${p.avatar || p.photo}');background-size:cover;background-position:center"></div>`;
  return `<div class="avatar" style="width:${s}px;height:${s}px;border-radius:16px">${initials(p.name)}</div>`;
}
function topCard(p, badges) {
  return `<div class="card">
    <div style="display:flex;gap:12px">
      ${provAvatarHtml(p, 64)}
      <div style="flex:1">
        <div><span class="h3">${esc(p.name)}</span> ${p.verified === true ? '<span class="verif">✔</span>' : ''}</div>
        <div class="rating" style="font-size:13px;margin-top:3px"><span class="st">★</span> <b>${p.rating || '—'}</b> <span class="sec">(${p.reviews} reviews)</span></div>
        <div class="meta">📍 ${p.dist} km away</div>
        <div class="sec" style="margin-top:2px">${esc(p.trade)}${p.exp ? ' • ' + esc(p.exp) : ''}</div>
        ${badgeHtml(badges)}
      </div>
    </div>
    <button class="btn btn-green pill" style="margin-top:12px" data-open="${p.id}">View Profile</button>
  </div>`;
}
async function renderHome() {
  applyProfileCity();
  const grid = $('catGrid'); if (grid) grid.innerHTML = POPULAR.map(catCell).join('') + catCell(MORE_TILE);
  const top = $('homeTop'); if (!top) return;
  // Show the top 3 providers (by rating) so the section never looks empty.
  const demoTop = DEMO_PROVIDERS.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 3);
  let topB = computeBadges(demoTop);
  top.innerHTML = demoTop.map((p) => topCard(p, topB[p.id])).join('');
  if (hasSupabase) {
    try {
      const loc = await api.getCurrentLocation();
      const live = await api.searchProviders({ lat: loc.lat, lng: loc.lng, radiusKm: 50 });
      if (live && live.length) {
        const rows = live.slice(0, 3).map((r) => { const p = provFromRow(r); providerCache[p.id] = p; return p; });
        topB = computeBadges(rows);
        top.innerHTML = rows.map((p) => topCard(p, topB[p.id])).join('');
      }
    } catch (e) {}
  }
}

/* ---------- All Categories / Subcategories browse ---------- */
function openAllCategories() {
  subcatParent = null; selectedServices = [];
  if ($('subcatTitle')) $('subcatTitle').textContent = 'All Categories';
  if ($('subcatSub')) $('subcatSub').textContent = 'Choose a service type';
  const grid = $('subcatGrid');
  if (grid) grid.innerHTML = `<div class="sgrid">${CATS.map(catCell).join('')}</div>`;
  if ($('subcatBook')) $('subcatBook').style.display = 'none';
  const tabs = document.querySelector('#s-subcats [data-tabbar]'); if (tabs) tabs.style.display = '';
  show('subcats');
}
// Tapping a category opens its services as a MULTI-select list with a sticky
// "Book" bar. Pick one or more services, then Book → provider list ranked by
// how many of the chosen services each provider offers.
function openSubcats(key) {
  const c = CATS.find((x) => x.key === key);
  if (!c || !(SUBCATS[key] && SUBCATS[key].length)) { selectedCat = key; selectedSub = null; selectedServices = []; searchQuery = ''; show('list'); return; }
  subcatParent = key; selectedCat = key; selectedServices = []; searchQuery = '';
  if ($('subcatTitle')) $('subcatTitle').textContent = c.label;
  if ($('subcatSub')) $('subcatSub').textContent = 'Select one or more services';
  const grid = $('subcatGrid');
  if (grid) grid.innerHTML = SUBCATS[key].map((s) => serviceRow(c, s)).join('');
  updateBookBar();
  show('subcats');
}
function serviceRow(c, s) {
  return `<div class="subrow svc" data-svc="${esc(s)}">
    <div class="subic" style="background:${c.color}22;color:${c.color}">${c.icon}</div>
    <div class="subtxt">${esc(s)}</div><span class="svc-check">○</span></div>`;
}
function updateBookBar() {
  const bar = $('subcatBook'); if (!bar) return;
  const n = selectedServices.length;
  bar.style.display = n ? 'flex' : 'none';
  const btn = $('subcatBookBtn'); if (btn) btn.textContent = n > 1 ? `Book — ${n} services` : 'Book';
  // The bottom tab bar sits above the sticky bar; hide it while the Book bar shows.
  const tabs = document.querySelector('#s-subcats [data-tabbar]');
  if (tabs) tabs.style.display = n ? 'none' : '';
}
function providerCard(p, badges) {
  let svcLine = '';
  if (selectedServices.length) {
    const m = serviceMatch(p);
    svcLine = `<div class="sec" style="margin-top:3px;font-size:12px;color:${m.all ? 'var(--success)' : 'var(--tSecondary)'}">${m.all ? `✓ Offers all ${selectedServices.length} selected services` : `Offers ${m.n} of ${selectedServices.length} selected services`}</div>`;
  }
  return `<div class="card" style="margin-bottom:12px">
    <div style="display:flex;gap:12px">
      ${provAvatarHtml(p, 64)}
      <div style="flex:1">
        <div style="display:flex;align-items:center"><span class="h3">${esc(p.name)}</span> ${p.verified === true ? '<span class="verif">✔</span>' : ''}</div>
        <div class="rating" style="font-size:13px;margin-top:3px"><span class="st">★</span> <b>${p.rating}</b> <span class="sec">(${p.reviews} reviews)</span></div>
        <div class="meta">📍 ${p.dist} km away</div>
        <div class="price" style="margin-top:2px">${inr(p.price)} <span style="font-weight:500;color:var(--tSecondary)">onwards</span></div>
        ${svcLine}
        ${badgeHtml(badges)}
      </div>
    </div>
    <button class="btn btn-green pill" style="margin-top:12px" data-open="${p.id}">Book Now</button>
  </div>`;
}
async function renderList() {
  listSort = 'all';
  document.querySelectorAll('[data-sort]').forEach((c) => c.classList.toggle('on', c.getAttribute('data-sort') === 'all'));
  // Title: subcategory > search term > category > default
  let title = 'Providers';
  if (selectedSub) title = selectedSub;
  else if (searchQuery) title = `“${searchQuery}”`;
  else if (selectedCat) title = CATS.find((c) => c.key === selectedCat)?.label || 'Providers';
  if ($('listTitle')) $('listTitle').textContent = title;
  const el = $('listCards'); if (!el) return;
  el.innerHTML = `<div class="empty">Loading…</div>`;
  let rows = null;
  if (hasSupabase) {
    try {
      const loc = await api.getCurrentLocation();
      const catId = selectedCat ? (catByKey[selectedCat] || null) : null;
      const live = await api.searchProviders({ lat: loc.lat, lng: loc.lng, categoryId: catId, radiusKm: 50 });
      rows = (live || []).map(provFromRow);
      rows.forEach((p) => { providerCache[p.id] = p; });
    } catch (e) { rows = null; }
  }
  if (!rows) rows = DEMO_PROVIDERS.slice();          // not signed in / offline
  lastListRows = filterRows(rows);
  paintList();
}

// Run a search from the Home search bar.
function doSearch() {
  const q = ($('homeSearch')?.value || '').trim();
  searchQuery = q; selectedSub = null; selectedServices = [];
  // If the query is (part of) a single category name, scope to that category.
  const matched = CATS.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
  selectedCat = (q && matched.length === 1) ? matched[0].key : null;
  show('list');
}

// Apply the active category + search filter to a set of provider rows.
function filterRows(rows) {
  let out = rows.slice();
  if (selectedCat) {
    const catLabel = (CATS.find((c) => c.key === selectedCat)?.label || '').toLowerCase();
    out = out.filter((p) => p.cat === selectedCat
      || String(p.trade || '').toLowerCase() === catLabel);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    // match a category by name so e.g. "ac" or "painter" narrows the list
    const matchedCats = CATS.filter((c) => c.label.toLowerCase().includes(q)).map((c) => c.key);
    out = out.filter((p) =>
      String(p.name || '').toLowerCase().includes(q)
      || String(p.trade || '').toLowerCase().includes(q)
      || matchedCats.includes(p.cat));
  }
  return out;
}
// Sort + paint the already-loaded list rows (used by the filter chips too).
function paintList() {
  const el = $('listCards'); if (!el) return;
  let rows = lastListRows.slice();
  if (listSort === 'rating') rows.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else if (listSort === 'dist') rows.sort((a, b) => (parseFloat(a.dist) || 1e9) - (parseFloat(b.dist) || 1e9));
  else if (listSort === 'price') rows.sort((a, b) => (a.price || 0) - (b.price || 0));
  // When services were chosen on the picker, providers offering ALL of them
  // float to the top, then by how many they offer, then by rating.
  if (selectedServices.length) {
    rows.forEach((p) => { p._m = serviceMatch(p).n; });
    rows.sort((a, b) => (b._m - a._m) || ((b.rating || 0) - (a.rating || 0)));
  }
  if (!rows.length) { el.innerHTML = `<div class="empty">No providers found nearby.<br>Try a different service.</div>`; return; }
  const badges = computeBadges(rows);
  el.innerHTML = rows.map((p) => {
    const keys = (badges[p.id] || []).slice();
    if (selectedServices.length && serviceMatch(p).all) keys.unshift('allsvc');
    return providerCard(p, keys);
  }).join('');
}
function reviewRow(r) {
  const when = r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const stars = '★★★★★☆☆☆☆☆'.slice(5 - (r.rating || 5), 10 - (r.rating || 5));
  return `<div style="display:flex;gap:10px;margin-top:12px">
    <div class="avatar" style="width:40px;height:40px">${initials(r.reviewer_name || 'C')}</div>
    <div style="flex:1">
      <div style="display:flex;align-items:center"><b style="font-size:14px">${esc(r.reviewer_name || 'Customer')}</b><div class="spacer"></div><span class="ter">${esc(when)}</span></div>
      <div class="rating" style="font-size:13px"><span class="st">${stars}</span> <b>${r.rating || 5}.0</b></div>
      ${r.body ? `<p class="sec" style="margin:4px 0 0">${esc(r.body)}</p>` : ''}
      ${r.provider_reply ? `<div class="panel" style="background:var(--bgMuted);border-radius:12px;padding:8px 10px;margin-top:6px"><div class="ter" style="font-weight:700;color:var(--primary)">Provider reply</div><div class="sec" style="font-size:12.5px">${esc(r.provider_reply)}</div></div>` : ''}
    </div>
  </div>`;
}
const PROV_SERVICES = {
  plumber: ['Tap & mixer repair', 'Pipe leakage fix', 'Bathroom fitting', 'Drain cleaning', 'Water tank'],
  electrician: ['Wiring & switchboard', 'Fan installation', 'Inverter setup', 'Short-circuit fix', 'Light fitting'],
  ac_repair: ['AC service', 'Gas refill', 'Installation', 'Cooling repair'],
  carpenter: ['Furniture repair', 'Door & lock fitting', 'Wardrobe work', 'Hinges & drawers'],
  painter: ['Interior painting', 'Waterproofing', 'Texture & POP'],
  cleaning: ['Home deep cleaning', 'Bathroom cleaning', 'Sofa & carpet'],
  home_repair: ['General repairs', 'Fittings', 'Maintenance'],
};
async function renderProfile() {
  const p = selectedProvider || DEMO_PROVIDERS[0];
  const el = $('profileBody'); if (!el) return;
  const about = p.about || `Experienced ${String(p.trade || 'professional').toLowerCase()} serving ${esc(p.area || 'Ahmedabad')} with great reviews for home and commercial work. Quick, clean and reliable service — satisfaction guaranteed.`;
  const revs = Number(p.reviews) || 0;
  const years = Number((String(p.exp || '').match(/\d+/) || [Math.max(2, Math.round(revs / 30))])[0]);
  const jobs = Math.max(revs * 3, 40);
  const onTime = 94 + (revs % 6);
  const repeat = 60 + (revs % 25);
  const svc = PROV_SERVICES[p.cat] || ['General service', 'Repairs', 'Installation'];
  const verified = p.verified === true;
  const trustChip = (ic, t) => `<div style="flex:1;text-align:center;background:var(--successBg,#E6F6EC);border-radius:12px;padding:10px 4px">
    <div style="font-size:18px">${ic}</div><div style="font-size:11px;font-weight:700;color:var(--success);margin-top:2px">${t}</div></div>`;
  const stat = (v, l) => `<div style="flex:1;text-align:center"><div style="font-weight:800;font-size:18px">${v}</div><div class="sec" style="font-size:11px">${l}</div></div>`;
  const why = (ic, t) => `<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:9px"><span style="font-size:16px">${ic}</span><span class="sec" style="font-size:13px;line-height:1.5">${t}</span></div>`;
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px">
      <div class="avatar" style="width:60px;height:60px;border-radius:16px;font-size:22px">${initials(p.name)}</div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:6px"><span class="h2">${esc(p.name)}</span>${verified ? '<span class="verif">✔</span>' : ''}</div>
        <div class="rating" style="margin-top:2px"><span class="st">★</span> <b>${p.rating || '—'}</b> <span class="sec">(${revs} reviews)</span></div>
        <div class="sec" style="font-size:12.5px;margin-top:2px">${esc(p.trade)} • ${esc(p.area || 'Ahmedabad')}</div>
      </div>
      ${verified ? '<span class="pill green">✓ Verified</span>' : '<span class="pill grey">Pending</span>'}
    </div>

    <div style="display:flex;gap:8px;margin-top:14px">
      ${trustChip('🛡️', 'ID Verified')}${trustChip('👮', 'Police Verified')}${trustChip('🔍', 'Background Check')}
    </div>

    <div class="panel" style="display:flex;gap:10px;align-items:center;margin-top:12px;background:var(--successBg,#E6F6EC);border:1px solid var(--success)">
      <span style="font-size:22px">✅</span>
      <div><div style="font-weight:700;font-size:13.5px;color:var(--success)">HelpZo Verified Partner</div>
        <div class="sec" style="font-size:12px">Aadhaar, PAN &amp; live selfie verified by HelpZo. Safe to invite home or office.</div></div>
    </div>

    <div class="card" style="display:flex;margin-top:12px;padding:12px 8px">
      ${stat(jobs + '+', 'Jobs Done')}${stat(years + ' yrs', 'Experience')}${stat(onTime + '%', 'On-time')}${stat(repeat + '%', 'Repeat')}
    </div>

    <div class="price" style="font-size:18px;margin-top:14px">${inr(p.price)} <span style="font-weight:500;color:var(--tSecondary);font-size:14px">onwards</span></div>

    <div class="h2" style="margin:18px 0 8px;font-size:16px">Services offered</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">${svc.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>

    <div class="h2" style="margin:18px 0 6px;font-size:16px">About</div>
    <p class="sec" style="line-height:1.6;margin:0">${esc(about)}</p>

    <div class="h2" style="margin:18px 0 8px;font-size:16px">Why you can trust ${esc((p.name || '').split(' ')[0])}</div>
    ${why('🪪', 'Government ID (Aadhaar + PAN) and address verified by HelpZo.')}
    ${why('⭐', `Rated ${p.rating || '4.8'}★ by ${revs} real customers in your area.`)}
    ${why('💬', 'Chat & call inside the app — no need to share your personal number.')}
    ${why('🛡️', 'HelpZo support + money-back protection if anything goes wrong.')}

    <div class="h2" style="margin:18px 0 8px;font-size:16px">Reviews &amp; Ratings</div>
    <div id="profReviews"><div class="sec" style="font-size:13px">Loading reviews…</div></div>`;
  // real reviews
  const rc = $('profReviews');
  if (hasSupabase && p.id && !String(p.id).startsWith('d')) {
    try {
      const revs = await api.getProviderReviews(p.id);
      rc.innerHTML = (revs && revs.length) ? revs.map(reviewRow).join('') : '<div class="sec" style="font-size:13px">No reviews yet.</div>';
    } catch (e) { rc.innerHTML = '<div class="sec" style="font-size:13px">No reviews yet.</div>'; }
  } else {
    rc.innerHTML = reviewRow({ reviewer_name: 'Neha Patel', rating: 5, body: 'Very professional and quick service. Highly recommended!', created_at: '2025-09-12' });
  }
}
function setCity(name) { if (name) document.querySelectorAll('.cityName').forEach((e) => { e.textContent = name; }); }

/* ---------- city / area picker (only Ahmedabad live; rest "Coming soon") ---------- */
const LIVE_CITIES = ['Ahmedabad'];
const GUJ_CITIES = ['Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Junagadh', 'Anand', 'Nadiad', 'Mehsana', 'Bharuch', 'Navsari', 'Morbi', 'Surendranagar', 'Gandhidham', 'Vapi', 'Valsad', 'Porbandar', 'Botad', 'Palanpur', 'Patan', 'Dahod', 'Godhra', 'Veraval', 'Amreli', 'Bhuj', 'Himatnagar', 'Modasa', 'Deesa', 'Jetpur', 'Gondal', 'Dhoraji', 'Kalol', 'Bardoli', 'Ankleshwar', 'Vallabh Vidyanagar', 'Mandvi', 'Kadi', 'Visnagar', 'Unjha', 'Sidhpur', 'Mahuva', 'Wadhwan', 'Dholka', 'Bavla', 'Sanand', 'Kheda', 'Petlad', 'Khambhat', 'Chhota Udaipur', 'Rajpipla', 'Dhrangadhra', 'Jafrabad', 'Keshod', 'Una', 'Talaja', 'Savarkundla', 'Vyara', 'Halol', 'Lunawada', 'Santrampur'];
function cityRow(name, live) {
  return live
    ? `<div class="mrow" data-city="${esc(name)}"><span class="mi">&#128205;</span><span class="ml">${esc(name)}</span><span class="pill green" style="font-size:11px">Available</span></div>`
    : `<div class="mrow" data-city="${esc(name)}" style="opacity:.7"><span class="mi">&#128205;</span><span class="ml">${esc(name)}</span><span class="pill grey" style="font-size:11px">Coming soon</span></div>`;
}
function renderCityScreen() {
  const q = ($('citySearch')?.value || '').trim().toLowerCase();
  const live = LIVE_CITIES.filter((c) => c.toLowerCase().includes(q));
  const soon = GUJ_CITIES.filter((c) => c.toLowerCase().includes(q));
  if ($('cityLive')) $('cityLive').innerHTML = live.length ? live.map((c) => cityRow(c, true)).join('<div class="divide"></div>') : `<div class="empty" style="font-size:13px">No match</div>`;
  if ($('citySoon')) $('citySoon').innerHTML = soon.length ? soon.map((c) => cityRow(c, false)).join('<div class="divide"></div>') : `<div class="empty" style="font-size:13px">No match</div>`;
}
function pickCity(name) {
  if (LIVE_CITIES.includes(name)) {
    setCity(name);
    if (myProfile) myProfile.city = name; else myProfile = { city: name };
    if (hasSupabase && session) { try { api.updateMyProfile({ home_area: name }); } catch (e) {} }
    toast(name + ' selected'); back();
  } else {
    toast(name + ' — Coming soon! We\'re launching here shortly.');
  }
}
// City from the signed-in profile (tap the location to change it).
function applyProfileCity() {
  const c = myProfile && (myProfile.city || myProfile.area || myProfile.location);
  if (c) setCity(c);
}
async function setCityPrompt() {
  const cur = (myProfile && (myProfile.city || myProfile.area)) || '';
  const name = prompt('Your area / city:', cur);
  if (name == null) return;
  const clean = name.trim(); if (!clean) return;
  setCity(clean);
  if (hasSupabase && session) { try { await api.updateMyProfile({ city: clean }); } catch (e) {} }
  if (myProfile) myProfile.city = clean; else myProfile = { city: clean };
}
function renderBook() {
  const p = selectedProvider || DEMO_PROVIDERS[0];
  const addrEl = $('bookAddr');
  if (addrEl && !addrEl.value) addrEl.value = (myProfile && (myProfile.address || myProfile.city || myProfile.area)) || '';
  const el = $('bookProvider'); if (el) el.innerHTML = `
    <div class="avatar" style="width:48px;height:48px">${initials(p.name)}</div>
    <div><div><span class="h3">${esc(p.name)}</span> ${p.verified === true ? '<span class="verif">✔</span>' : ''}</div>
    <div class="rating" style="font-size:12.5px"><span class="st">★</span> <b>${p.rating}</b> <span class="sec">(${p.reviews} reviews)</span></div>
    <div class="sec" style="font-size:12.5px">${esc(p.trade)} • ${inr(p.price)} onwards</div></div>`;
  // default date = today; default time already 10:00 (chip "Afternoon 3" is .on → keep input in sync)
  const today = new Date();
  bookDateIso = isoLocalDate(today);
  calMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  renderCalendar();
  initBookMap();
}
/* ---------- booking location picker (map) ---------- */
let bookPicker = null, bookLatLng = null, addrTyping = false, addrTypeTimer = null;
function initBookMap() {
  const el = $('bookMap'); if (!el) return;
  bookLatLng = null;
  locationPicker(el, {
    onPick: ({ lat, lng, address }) => {
      bookLatLng = { lat, lng };
      // Only auto-fill the address from the map when the user isn't typing.
      if (address && !addrTyping && $('bookAddr')) $('bookAddr').value = address;
    },
  }).then((pk) => { bookPicker = pk; }).catch(() => {});
}
/* ---------- booking calendar (any date) + time (24/7) ---------- */
let calMonth = null;      // first day of the month being shown
let bookDateIso = null;   // selected date (YYYY-MM-DD)
function isoLocalDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function renderCalendar() {
  const grid = $('calGrid'); if (!grid || !calMonth) return;
  const title = $('calTitle'); if (title) title.textContent = calMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<div></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(calMonth.getFullYear(), calMonth.getMonth(), d);
    const iso = isoLocalDate(date);
    const past = date < today;
    const sel = iso === bookDateIso;
    const style = `aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:13.5px;` +
      (past ? 'color:var(--tTertiary);opacity:.4;pointer-events:none;' :
        sel ? 'background:var(--primary);color:#fff;font-weight:700;' : 'cursor:pointer;color:var(--tPrimary);');
    cells += `<div data-day="${iso}" style="${style}">${d}</div>`;
  }
  grid.innerHTML = cells;
  // Disable "prev" when already at current month
  const prev = $('calPrev');
  if (prev) prev.style.visibility = (calMonth.getFullYear() === today.getFullYear() && calMonth.getMonth() === today.getMonth()) ? 'hidden' : 'visible';
}
function calShift(delta) {
  if (!calMonth) return;
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1);
  renderCalendar();
}
// Human 12-hour label from a 24h "HH:MM" value.
function timeLabel(hhmm) {
  const [h, m] = (hhmm || '10:00').split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM'; const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}
// Buckets a raw status into one of the three filter chips.
function bookBucket(st) {
  const s = String(st || 'pending').toLowerCase();
  if (s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return 'upcoming'; // pending / confirmed / anything else
}
function renderBookings() {
  const el = $('bookRows'); if (!el) return;
  bookFilter = 'upcoming';
  document.querySelectorAll('[data-bfilter]').forEach((c) => c.classList.toggle('on', c.getAttribute('data-bfilter') === 'upcoming'));
  if (hasSupabase && session) {
    // Signed in → show ONLY real data. Start from this session's own bookings
    // (or a loading note), then swap in the live rows. Never flash demo
    // bookings that then disappear.
    lastBookings = localBookings.slice();
    if (lastBookings.length) paintBookings();
    else { const el2 = $('bookRows'); if (el2) el2.innerHTML = `<div class="empty">Loading…</div>`; }
    api.getMyBookingList().then((live) => {
      const liveRows = (live || []).map((b) => {
        const pv = b.provider || {};
        const st = (b.status || 'pending');
        return {
          id: b.id, service: b.service || 'Service', provider: pv.name || 'Provider',
          when: `${b.scheduled_date || ''} ${b.scheduled_time || ''}`.trim(), addr: b.address || '',
          status: st[0].toUpperCase() + st.slice(1),
          bill: b.bill_status || 'none', total: b.total_amount, paid: !!b.paid,
        };
      });
      // Keep demo-provider bookings made this session (not persisted server-side).
      lastBookings = localBookings.filter((b) => b._demo).concat(liveRows);
      paintBookings();
    }).catch(() => { paintBookings(); });
  } else {
    // Offline / not signed in → demo data so the screen isn't blank.
    lastBookings = localBookings.concat(DEMO_BOOKINGS.map((b) => ({
      service: b.service, provider: b.provider, when: b.when, addr: b.addr, status: b.status,
    })));
    paintBookings();
  }
}
let shownBookings = [];     // the bookings currently rendered (for tap → details)
function paintBookings() {
  const el = $('bookRows'); if (!el) return;
  const rows = lastBookings.filter((b) => bookBucket(b.status) === bookFilter);
  shownBookings = rows;
  if (!rows.length) { el.innerHTML = `<div class="empty">No ${esc(bookFilter)} bookings.</div>`; return; }
  el.innerHTML = rows.map((b, i) => {
    const s = String(b.status).toLowerCase();
    const pill = s.startsWith('confirm') || s.startsWith('complet') ? 'green' : s.startsWith('cancel') ? 'grey' : 'orange';
    return `<div class="row" style="cursor:pointer;${i ? 'border-top:1px solid var(--cardBorder)' : ''}" data-bookdetail="${i}">
      <div class="avatar" style="width:52px;height:52px">${initials(b.provider)}</div>
      <div class="mid"><div class="h3">${esc(b.service)}</div><div class="sec">${esc(b.provider)}</div>
        <div class="meta">📅 ${esc(b.when)}</div><div class="meta">📍 ${esc(b.addr)}</div>
        ${billLine(b)}</div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><span class="pill ${pill}">${esc(b.status)}</span><span class="mc" style="color:var(--tTertiary)">›</span></div>
    </div>`;
  }).join('');
}

/* ---------- booking details (tap a booking) ---------- */
let detailBooking = null;
function openBookingDetail(b) {
  if (!b) return;
  detailBooking = b;
  // best-effort provider object for Call / Chat
  b._prov = providerCache[b.providerId] || DEMO_PROVIDERS.find((p) => p.name === b.provider) || { id: b.providerId || 'd1', name: b.provider, phone: b.phone };
  const s = String(b.status || '').toLowerCase();
  const pill = s.startsWith('confirm') || s.startsWith('complet') ? 'green' : s.startsWith('cancel') ? 'grey' : 'orange';
  const field = (ic, lbl, val) => `<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--cardBorder)">
    <div style="font-size:18px">${ic}</div><div style="flex:1"><div class="ter">${lbl}</div><div style="font-weight:600;color:var(--tPrimary);margin-top:2px">${esc(val || '—')}</div></div></div>`;
  const body = $('bookDetailBody');
  if (body) body.innerHTML = `
    <div class="card">
      <div style="display:flex;gap:12px;align-items:center">
        <div class="avatar" style="width:56px;height:56px">${initials(b.provider)}</div>
        <div style="flex:1"><div class="h2">${esc(b.service)}</div><div class="sec">${esc(b.provider)}</div></div>
        <span class="pill ${pill}">${esc(b.status)}</span>
      </div>
    </div>
    <div class="card" style="margin-top:14px;padding:4px 16px">
      ${field('📅', 'Date & Time', b.when)}
      ${field('📍', 'Service Address', b.addr)}
      ${b.note ? field('📝', 'Note', b.note) : ''}
      ${b.total ? field('💰', 'Amount', inr(b.total) + (b.paid ? ' • Paid' : '')) : ''}
      <div style="padding:12px 0"><div class="ter">Booking status</div><div style="font-weight:600;color:var(--tPrimary);margin-top:2px">${esc(b.status)}</div></div>
    </div>
    ${billLine(b) ? `<div style="margin-top:14px">${billLine(b)}</div>` : ''}`;
  const act = $('bookDetailActions');
  const canChange = !(s.startsWith('cancel') || s.startsWith('complet'));
  if (act) act.innerHTML = `
    <button class="btn btn-out-green" style="flex:1" data-call="${esc((b._prov && b._prov.phone) || '')}">📞 Call</button>
    <button class="btn btn-out" style="flex:1" id="bdChatBtn">💬 Chat</button>
    ${canChange ? `<button class="btn btn-green" style="flex:1" id="bdReschedBtn">Reschedule</button>` : ''}
    ${canChange ? `<button class="btn btn-out-danger" style="flex:1" id="bdCancelBtn">Cancel</button>` : ''}`;
  show('bookingdetail');
}
async function cancelBookingDetail() {
  const b = detailBooking; if (!b) return;
  if (b.id && hasSupabase && session) { try { await api.cancelBooking(b.id); } catch (e) {} }
  b.status = 'Cancelled';
  const idx = localBookings.findIndex((x) => x === b);
  toast('Booking cancelled');
  renderBookings(); show('bookings');
}
function rescheduleBookingDetail() {
  const b = detailBooking; if (!b) return;
  selectedProvider = b._prov || selectedProvider;
  toast('Pick a new date & time');
  show('book');
}
// Bill call-to-action under a booking row.
function billLine(b) {
  if (!b.id) return '';
  if (b.paid) return `<div class="meta" style="color:var(--success)">✓ Paid${b.total ? ' • ' + inr(b.total) : ''}</div>`;
  if (b.bill === 'sent') return `<button class="btn btn-green pill" style="margin-top:8px;padding:8px 14px" data-bill="${b.id}">Review &amp; Pay${b.total ? ' ' + inr(b.total) : ''}</button>`;
  if (b.bill === 'approved') return `<button class="btn btn-green pill" style="margin-top:8px;padding:8px 14px" data-bill="${b.id}">Pay Now${b.total ? ' ' + inr(b.total) : ''}</button>`;
  if (b.bill === 'disputed') return `<div class="meta" style="color:var(--danger)">⚠ Bill disputed — support will contact you</div>`;
  return '';
}
let billBooking = null;   // booking id currently shown on the bill screen
async function openBill(id) {
  billBooking = id;
  if (!(hasSupabase && session)) { show('bill'); return; }
  try {
    const { booking, items } = await api.getBill(id);
    const total = items.reduce((s, it) => s + (it.amount || 0), 0) || booking.total_amount || 0;
    const prov = booking.provider || {};
    if ($('billHead')) $('billHead').innerHTML = `<div class="h3">${esc(booking.service || 'Service')}</div>
      <div class="sec" style="margin-top:2px">${esc(prov.name || 'Provider')}</div>`;
    if ($('billBody')) $('billBody').innerHTML = (items.length ? items.map((it) =>
      `<div style="display:flex;justify-content:space-between;padding:6px 0"><span>${esc(it.label)}</span><span>${inr(it.amount)}</span></div>`).join('')
      : `<div class="sec" style="font-size:13px">No extra charges — base price applies.</div>`)
      + `<div class="divide" style="margin:10px 0"></div><div style="display:flex;justify-content:space-between"><b>Total</b><b style="font-size:17px">${inr(total)}</b></div>`;
    const act = $('billActions');
    if (act) {
      if (booking.paid) act.innerHTML = `<button class="btn btn-out" data-go="bookings">Done</button>`;
      else act.innerHTML = `<button class="btn btn-out-danger" data-billdispute="${id}">Dispute</button>
        <button class="btn btn-green" data-billpay="${id}" data-amt="${total}">✓ Approve &amp; Pay</button>`;
    }
  } catch (e) { toast(e.message || 'Could not load bill'); return; }
  show('bill');
}
async function approveAndPay(id, amount) {
  if (!(hasSupabase && session)) { toast('Payment demo — approved'); show('bookings'); return; }
  try {
    await api.approveBill(id);
    await api.payBooking(id, amount, 'online');
    toast('Payment successful 🎉');
    show('bookings'); renderBookings();
  } catch (e) { toast(e.message || 'Payment failed'); }
}
async function disputeBill(id) {
  if (hasSupabase && session) { try { await api.disputeBill(id); } catch (e) {} }
  toast('Bill disputed — our team will reach out');
  show('bookings'); renderBookings();
}
function notifIcon(type) {
  return ({ booking: { c: '#1667E8', i: '📅' }, lead: { c: '#22B24C', i: '✓' }, review: { c: '#F6B01E', i: '★' }, offer: { c: '#F5A623', i: '🏷️' }, system: { c: '#8B44D6', i: '🔔' } })[type] || { c: '#1667E8', i: '🔔' };
}
async function renderNotif() {
  const el = $('notifRows'); if (!el) return;
  if (hasSupabase && session) {
    el.innerHTML = `<div class="empty">Loading…</div>`;
    try {
      const rows = await api.getNotifications();
      el.innerHTML = rows.length ? rows.map((n, i) => {
        const ic = notifIcon(n.type);
        const ago = n.created_at ? new Date(n.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="row" style="align-items:flex-start;cursor:pointer;${i ? 'border-top:1px solid var(--cardBorder)' : ''}" data-notifgo="${notifTarget(n.type)}">
          <div class="avatar" style="width:44px;height:44px;background:${ic.c};color:#fff">${ic.i}</div>
          <div class="mid"><div style="display:flex"><div class="h3" style="flex:1">${esc(n.title || 'Notification')}</div><span class="ter">${esc(ago)}</span></div>
            <div class="sec" style="margin-top:2px">${esc(n.body || '')}</div><div class="ter" style="margin-top:4px;color:var(--primary)">Tap to view ›</div></div></div>`;
      }).join('') : `<div class="empty">No notifications yet.</div>`;
    } catch (e) { el.innerHTML = `<div class="empty">No notifications yet.</div>`; }
    return;
  }
  el.innerHTML = DEMO_NOTIF.map((n, i) => `
    <div class="row" style="align-items:flex-start;cursor:pointer;${i ? 'border-top:1px solid var(--cardBorder)' : ''}" data-notifgo="${n.go || 'bookings'}">
      <div class="avatar" style="width:44px;height:44px;background:${n.color};color:#fff">${n.ic}</div>
      <div class="mid"><div style="display:flex"><div class="h3" style="flex:1">${esc(n.title)}</div><span class="ter">${esc(n.ago)}</span></div>
        <div class="sec" style="margin-top:2px">${esc(n.body)}</div><div class="ter" style="margin-top:4px;color:var(--primary)">Tap to view ›</div></div>
    </div>`).join('');
}
function renderAccount() {
  const name = (myProfile && myProfile.full_name) || 'Guest User';
  const phone = (myProfile && myProfile.phone) || (session?.user?.phone ? '+' + session.user.phone : '');
  if ($('accName')) $('accName').textContent = name;
  paintAvatar($('accAvatar'), name, myProfile && myProfile.avatar);   // photo if set, else initials
  if ($('accPhone')) $('accPhone').textContent = phone || '+91 —';
  const pct = profileCompletion();
  if ($('completePct')) $('completePct').textContent = pct + '%';
  if ($('completeBar')) $('completeBar').style.width = pct + '%';
  if ($('langCurrent')) $('langCurrent').textContent = LANGS[curLang] + ' ›';
  $('themeToggle')?.classList.toggle('on', curTheme === 'dark');
}

/* ---------- auth ---------- */
async function doGetOtp() {
  const raw = ($('phone').value || '').replace(/\D/g, '');
  if (raw.length !== 10) { toast('Enter a valid 10-digit number'); return; }
  const btn = $('getOtpBtn'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    if (hasSupabase) { window._pendingPhone = await api.sendOtp(raw); }
    else { window._pendingPhone = '+91' + raw; }
    $('otpPhoneLabel').textContent = window._pendingPhone;
    $('loginPhoneStep').hidden = true; $('loginOtpStep').hidden = false;
    document.querySelectorAll('[data-otp]')[0]?.focus();
    startOtpAutofill();
  } catch (e) { toast(e.message || 'Could not send OTP'); }
  finally { btn.disabled = false; btn.textContent = 'Get OTP'; }
}
async function doVerify() {
  const code = Array.from(document.querySelectorAll('[data-otp]')).map((i) => i.value).join('');
  if (code.length !== 6) { toast('Enter the 6-digit code'); return; }
  const btn = $('verifyOtpBtn'); btn.disabled = true; btn.textContent = 'Verifying…';
  try {
    if (hasSupabase) {
      await api.verifyOtp(window._pendingPhone, code);
      session = await api.getSession();
      myProfile = await api.getMyProfile().catch(() => null);
    }
    stack = ['splash']; show('home');
  } catch (e) { toast(e.message || 'Invalid code'); }
  finally { btn.disabled = false; btn.textContent = 'Verify & Continue'; }
}

/* ---------- booking ---------- */
let lastBooking = null;   // for the success screen (Call Provider)
async function confirmBooking() {
  // Service address is required — a provider can't come without one.
  const addr = ($('bookAddr')?.value || '').trim();
  if (!addr) { toast('Please enter your service address'); $('bookAddr')?.focus(); return; }
  if (!bookDateIso) { toast('Please select a date'); return; }
  const timeVal = $('bookTime')?.value || '';
  if (!timeVal) { toast('Please select a time'); return; }
  const btn = $('confirmBookBtn'); btn.disabled = true; btn.textContent = 'Booking…';
  try {
    const p = selectedProvider || DEMO_PROVIDERS[0];
    const time = timeLabel(timeVal);
    const dateNice = new Date(bookDateIso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const isDemo = !(hasSupabase && session && p.id && !String(p.id).startsWith('d'));
    if (!isDemo) {
      await api.createBooking(p.id, { service: p.trade, date: bookDateIso, time, address: addr, note: $('bookNote')?.value || '', lat: bookLatLng?.lat, lng: bookLatLng?.lng });
    }
    localBookings.unshift({
      service: selectedSub || p.trade || 'Service', provider: p.name || 'Provider',
      when: `${dateNice} • ${time}`, addr, status: 'Pending', _demo: isDemo,
    });
    lastBooking = { name: p.name || 'Provider', trade: p.trade || 'Service', phone: p.phone || '+91 90000 00000', when: `${dateNice} • ${time}`, addr, verified: p.verified };
    show('booked');
  } catch (e) { toast(e.message || 'Could not book'); }
  finally { btn.disabled = false; btn.textContent = 'Confirm Booking'; }
}
/* ---------- chat with provider (realtime) ---------- */
let chatProvider = null, chatSub = null;
const DEMO_CHAT_C = [
  { me: false, body: 'Hello! Thanks for reaching out. How can I help?', time: '10:02 AM' },
  { me: true, body: 'Hi, my kitchen tap is leaking. Can you come today?', time: '10:03 AM' },
  { me: false, body: 'Sure, I can reach by 3 PM. Please share your address.', time: '10:04 AM' },
];
const chatTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
function chatBubble(m) {
  return m.me
    ? `<div style="display:flex;justify-content:flex-end;margin:6px 0"><div style="max-width:76%;background:var(--primary);color:#fff;border-radius:14px 14px 4px 14px;padding:9px 12px;font-size:13.5px">${esc(m.body)}<div style="font-size:10px;opacity:.75;text-align:right;margin-top:2px">${esc(m.time || '')}</div></div></div>`
    : `<div style="display:flex;margin:6px 0"><div style="max-width:76%;background:var(--cardBg,#fff);border:1px solid var(--cardBorder);border-radius:14px 14px 14px 4px;padding:9px 12px;font-size:13.5px">${esc(m.body)}<div style="font-size:10px;color:var(--tTertiary);margin-top:2px">${esc(m.time || '')}</div></div></div>`;
}
function openChatWith(p) { chatProvider = p || selectedProvider || DEMO_PROVIDERS[0]; show('chat'); }
function scrollChat() { const sc = $('chatScroll'); if (sc) sc.scrollTop = sc.scrollHeight; }
function appendChat(m) { const box = $('chatMsgs'); if (!box) return; box.insertAdjacentHTML('beforeend', chatBubble(m)); scrollChat(); }
async function renderChat() {
  const p = chatProvider || selectedProvider || DEMO_PROVIDERS[0]; if (!p) return;
  if ($('chatName')) $('chatName').textContent = p.name || 'Provider';
  if ($('chatAvatar')) $('chatAvatar').textContent = initials(p.name || 'P');
  if ($('chatCallBtn')) $('chatCallBtn').setAttribute('data-call', p.phone || '+91 90000 00000');
  const box = $('chatMsgs'); if (!box) return;
  const real = hasSupabase && session && p.id && !String(p.id).startsWith('d');
  let msgs = DEMO_CHAT_C;
  if (real) {
    try { const rows = await api.getMessages(p.id); if (rows && rows.length) msgs = rows.map((r) => ({ me: r.sender_role === 'customer', body: r.body, time: chatTime(r.created_at) })); } catch (e) {}
  }
  box.innerHTML = msgs.map(chatBubble).join(''); scrollChat();
  try { chatSub?.unsubscribe?.(); } catch (e) {}
  chatSub = null;
  if (real) {
    try { chatSub = await api.subscribeMessages(p.id, (row) => { appendChat({ me: row.sender_role === 'customer', body: row.body, time: chatTime(row.created_at) }); }); } catch (e) {}
  }
}
async function sendChat() {
  const inp = $('chatInput'); if (!inp) return;
  const body = (inp.value || '').trim(); if (!body) return;
  inp.value = '';
  appendChat({ me: true, body, time: chatTime(new Date()) });
  const p = chatProvider;
  const real = hasSupabase && session && p?.id && !String(p.id).startsWith('d');
  if (real) { try { await api.sendMessage(p.id, body); } catch (e) { toast('Message not sent'); } }
}
/* ---------- feedback to admin (chat) ---------- */
const FB_KEY = 'helpzo_feedback_thread';
let fbThread = [];
function loadFbThread() {
  try { fbThread = JSON.parse(localStorage.getItem(FB_KEY) || 'null') || []; } catch (e) { fbThread = []; }
}
function saveFbThread() { try { localStorage.setItem(FB_KEY, JSON.stringify(fbThread.slice(-50))); } catch (e) {} }
async function renderFeedback() {
  loadFbThread();
  const box = $('fbMsgs'); if (!box) return;
  // Pull any admin replies from the server when signed in.
  if (hasSupabase && session) {
    try {
      const rows = await api.getFeedback();
      if (rows && rows.length) fbThread = rows.map((r) => ({ me: r.sender_role !== 'admin', body: r.body, time: chatTime(r.created_at) }));
    } catch (e) {}
  }
  const intro = { me: false, body: 'Hi! This is the HelpZo team. Tell us any problem or suggestion — we read every message.', time: '' };
  const msgs = [intro].concat(fbThread);
  box.innerHTML = msgs.map(chatBubble).join('');
  const sc = $('fbScroll'); if (sc) sc.scrollTop = sc.scrollHeight;
}
async function sendFeedback() {
  const inp = $('fbInput'); if (!inp) return;
  const body = (inp.value || '').trim(); if (!body) return;
  inp.value = '';
  const msg = { me: true, body, time: chatTime(new Date()) };
  fbThread.push(msg); saveFbThread();
  const box = $('fbMsgs'); if (box) { box.insertAdjacentHTML('beforeend', chatBubble(msg)); const sc = $('fbScroll'); if (sc) sc.scrollTop = sc.scrollHeight; }
  let sent = false;
  if (hasSupabase && session) { try { await api.sendFeedback(body); sent = true; } catch (e) {} }
  setTimeout(() => {
    const ack = { me: false, body: sent ? 'Thanks! Your message reached our team — we’ll get back to you shortly.' : 'Thanks! We’ve noted your feedback and our team will review it.', time: chatTime(new Date()) };
    fbThread.push(ack); saveFbThread();
    const box2 = $('fbMsgs'); if (box2) { box2.insertAdjacentHTML('beforeend', chatBubble(ack)); const sc = $('fbScroll'); if (sc) sc.scrollTop = sc.scrollHeight; }
  }, 500);
}

function renderBooked() {
  const b = lastBooking; if (!b) return;
  if ($('bookedInfo')) $('bookedInfo').textContent = `${b.trade} • ${b.when}`;
  if ($('bookedProv')) $('bookedProv').innerHTML = `
    <div style="display:flex;gap:12px;align-items:center">
      <div class="avatar" style="width:46px;height:46px">${initials(b.name)}</div>
      <div style="flex:1"><div><span class="h3">${esc(b.name)}</span> ${b.verified === true ? '<span class="verif">✔</span>' : ''}</div>
        <div class="sec" style="font-size:12.5px">📍 ${esc(b.addr)}</div></div>
    </div>`;
  const cb = $('bookedCallBtn'); if (cb) cb.setAttribute('data-call', b.phone);
}

/* ---------- open a provider ---------- */
async function openProvider(id) {
  let p = providerCache[id] || DEMO_PROVIDERS.find((x) => x.id === id);
  if (!p && hasSupabase) {
    try { const row = await api.getProvider(id); if (row) p = provFromRow(row); } catch (e) {}
  }
  selectedProvider = p || DEMO_PROVIDERS[0];
  show('profile');
}

/* ---------- click delegation ---------- */
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]'); if (go) { show(go.getAttribute('data-go')); return; }
  const tab = e.target.closest('[data-tab]'); if (tab) { stack = [tab.getAttribute('data-tab')]; show(tab.getAttribute('data-tab'), false); return; }
  const cat = e.target.closest('[data-cat]'); if (cat) {
    const key = cat.getAttribute('data-cat');
    searchQuery = ''; selectedSub = null;
    if (key === '__more') { openAllCategories(); return; }
    selectedCat = key; openSubcats(key); return;
  }
  const svc = e.target.closest('[data-svc]'); if (svc) {
    const label = svc.getAttribute('data-svc');
    const i = selectedServices.indexOf(label);
    const chk = svc.querySelector('.svc-check');
    if (i >= 0) { selectedServices.splice(i, 1); svc.classList.remove('on'); if (chk) chk.textContent = '○'; }
    else { selectedServices.push(label); svc.classList.add('on'); if (chk) chk.textContent = '●'; }
    updateBookBar(); return;
  }
  if (e.target.closest('#subcatBookBtn')) {
    if (!selectedServices.length) { toast('Select at least one service'); return; }
    selectedSub = selectedServices.length === 1 ? selectedServices[0] : null;
    selectedCat = subcatParent || selectedCat;
    show('list'); return;
  }
  const open = e.target.closest('[data-open]'); if (open) { openProvider(open.getAttribute('data-open')); return; }
  const day = e.target.closest('[data-day]'); if (day) { bookDateIso = day.getAttribute('data-day'); renderCalendar(); return; }
  if (e.target.closest('#calPrev')) { calShift(-1); return; }
  if (e.target.closest('#calNext')) { calShift(1); return; }
  const sl = e.target.closest('#slotRow .slot'); if (sl) {
    document.querySelectorAll('#slotRow .slot').forEach((x) => x.classList.remove('on')); sl.classList.add('on');
    const t = sl.getAttribute('data-time'); if (t && $('bookTime')) $('bookTime').value = t; return;
  }
  const callEl = e.target.closest('[data-call]'); if (callEl) { const ph = callEl.getAttribute('data-call'); if (ph) window.location.href = telHref(ph); return; }
  if (e.target.closest('#callBtn')) { dialProvider(); return; }
  if (e.target.closest('#profChatBtn')) { openChatWith(selectedProvider); return; }
  if (e.target.closest('#bookedChatBtn')) { openChatWith(selectedProvider); return; }
  if (e.target.closest('#editProfileBtn')) { editProfile(); return; }
  if (e.target.closest('#epPhotoBtn') || e.target.closest('#epAvatarWrap')) { $('epPhoto')?.click(); return; }
  if (e.target.closest('#epSaveBtn')) { saveProfile(); return; }
  const gch = e.target.closest('#epGender [data-gender]'); if (gch) { document.querySelectorAll('#epGender [data-gender]').forEach((c) => c.classList.remove('on')); gch.classList.add('on'); return; }
  const lng = e.target.closest('[data-lang]'); if (lng) { setLang(lng.getAttribute('data-lang')); return; }
  const cty = e.target.closest('[data-city]'); if (cty) { pickCity(cty.getAttribute('data-city')); return; }
  if (e.target.closest('[data-setcity]')) { setCityPrompt(); return; }
  const mc = e.target.closest('[data-mapcat]'); if (mc) { mapCat = mc.getAttribute('data-mapcat') || null; renderMapScreen(); return; }
  const billBtn = e.target.closest('[data-bill]'); if (billBtn) { openBill(billBtn.getAttribute('data-bill')); return; }
  const payBtn = e.target.closest('[data-billpay]'); if (payBtn) { approveAndPay(payBtn.getAttribute('data-billpay'), Number(payBtn.getAttribute('data-amt')) || 0); return; }
  const dispBtn = e.target.closest('[data-billdispute]'); if (dispBtn) { disputeBill(dispBtn.getAttribute('data-billdispute')); return; }
  const seeall = e.target.closest('[data-seeall]'); if (seeall) { selectedCat = null; selectedSub = null; selectedServices = []; searchQuery = ''; openAllCategories(); return; }
  const allprov = e.target.closest('[data-allprov]'); if (allprov) { selectedCat = null; selectedSub = null; selectedServices = []; searchQuery = ''; show('list'); return; }
  const sort = e.target.closest('[data-sort]'); if (sort) {
    document.querySelectorAll('[data-sort]').forEach((c) => c.classList.remove('on'));
    sort.classList.add('on'); listSort = sort.getAttribute('data-sort'); paintList(); return;
  }
  const bf = e.target.closest('[data-bfilter]'); if (bf) {
    document.querySelectorAll('[data-bfilter]').forEach((c) => c.classList.remove('on'));
    bf.classList.add('on'); bookFilter = bf.getAttribute('data-bfilter'); paintBookings(); return;
  }
  if (e.target.closest('#themeRow') || e.target.closest('#themeToggle')) { toggleTheme(); return; }
  const bd = e.target.closest('[data-bookdetail]'); if (bd) { openBookingDetail(shownBookings[Number(bd.getAttribute('data-bookdetail'))]); return; }
  if (e.target.closest('#bdCancelBtn')) { cancelBookingDetail(); return; }
  if (e.target.closest('#bdReschedBtn')) { rescheduleBookingDetail(); return; }
  if (e.target.closest('#bdChatBtn')) { openChatWith(detailBooking && detailBooking._prov); return; }
  const ng = e.target.closest('[data-notifgo]'); if (ng) { const t = ng.getAttribute('data-notifgo'); stack = [t]; show(t, false); return; }
  const doc = e.target.closest('[data-doc]'); if (doc) { openDoc(doc.getAttribute('data-doc')); return; }
  if (e.target.closest('[data-back]')) { back(); return; }
  const tst = e.target.closest('[data-toast]'); if (tst) { toast(tst.getAttribute('data-toast')); return; }
});

/* ---------- legal / info pages ---------- */
function openDoc(key) {
  const d = DOCS[key]; if (!d) return;
  if ($('docTitle')) $('docTitle').textContent = d.title;
  if ($('docBody')) $('docBody').innerHTML = d.body;
  show('doc');
}
const DOC_UPDATED = 'Last updated: 9 October 2026';
const H = (t) => `<h3 style="margin:18px 0 7px;font-size:15px;color:var(--tPrimary)">${t}</h3>`;
const P = (t) => `<p style="margin:0 0 10px;font-size:13.5px;line-height:1.75;color:var(--tSecondary)">${t}</p>`;
const UL = (arr) => `<ul style="margin:0 0 10px;padding-left:18px;font-size:13.5px;line-height:1.75;color:var(--tSecondary)">${arr.map((i) => `<li style="margin-bottom:4px">${i}</li>`).join('')}</ul>`;
const META = (t) => `<p style="margin:0 0 14px;font-size:12px;color:var(--tTertiary)">${t}</p>`;
const DOCS = {
  terms: { title: 'Terms & Conditions', body:
    META(DOC_UPDATED) +
    P('Welcome to HelpZo. These Terms govern your use of the HelpZo app and services that connect customers with local service professionals ("Providers") in Ahmedabad and other serviceable areas. By using HelpZo you agree to these Terms.') +
    H('1. About HelpZo') +
    P('HelpZo is a technology platform that helps you discover, contact and book independent service Providers (plumbers, electricians, AC technicians, carpenters and more). HelpZo is a marketplace — the service itself is performed by the Provider, not by HelpZo.') +
    H('2. Eligibility & account') +
    UL(['You must be 18 years or older and provide a valid mobile number.', 'You are responsible for keeping your account and OTP secure.', 'Information you provide (name, address, phone) must be accurate.']) +
    H('3. Bookings & pricing') +
    UL(['Base prices shown are set by each Provider and are indicative ("onwards").', 'Final charges may include parts and labour, shown to you as a bill inside the app for your approval before payment.', 'You can approve or dispute a bill from the app before paying.']) +
    H('4. Payments') +
    P('You pay for the service after the work is completed and the bill is approved, through the methods offered in the app or directly to the Provider as agreed. HelpZo may charge a platform or convenience fee, which will be shown transparently.') +
    H('5. Your responsibilities') +
    UL(['Provide safe access to the service location and accurate address.', 'Treat Providers with respect; harassment is not tolerated.', 'Do not misuse the platform for unlawful purposes.']) +
    H('6. Cancellations') +
    P('You may cancel a booking before the Provider starts work. Repeated last-minute cancellations may lead to a cancellation fee or account limits. See our Refund & Cancellation Policy.') +
    H('7. Limitation of liability') +
    P('HelpZo connects you with independent Providers and does not directly perform the service. To the extent permitted by law, HelpZo is not liable for the acts or omissions of Providers, but we actively verify Providers and help resolve disputes.') +
    H('8. Changes & governing law') +
    P('We may update these Terms from time to time; continued use means acceptance. These Terms are governed by the laws of India, with jurisdiction in Ahmedabad, Gujarat.') +
    H('9. Contact') +
    P('Questions? Email <b>support@helpzo.app</b>.') },

  privacy: { title: 'Privacy Policy', body:
    META(DOC_UPDATED) +
    P('Your privacy matters to us. This policy explains what HelpZo collects, why, and your choices.') +
    H('Information we collect') +
    UL(['<b>Account:</b> name, mobile number, and (optional) email.', '<b>Service:</b> your address and booking details so a Provider can reach you.', '<b>Location:</b> approximate location (with your permission) to show nearby Providers and ETAs.', '<b>Usage:</b> app activity and device info to keep the service secure and improve it.']) +
    H('How we use it') +
    UL(['To create your account and verify you via OTP.', 'To connect you with Providers and complete bookings and payments.', 'To send booking updates and important notifications.', 'To prevent fraud and keep the platform safe.']) +
    H('Sharing') +
    P('We share only what is needed to deliver the service — for example, your name, address and phone are shared with the Provider you book. We do not sell your personal data.') +
    H('Data security') +
    P('We use industry-standard safeguards (encryption in transit, access controls). KYC documents are stored privately and visible only to you and authorised HelpZo staff.') +
    H('Your rights') +
    UL(['Access or correct your profile from the app.', 'Request deletion of your account by emailing us.', 'Control location permission from your phone settings.']) +
    H('Contact') +
    P('For privacy requests, email <b>privacy@helpzo.app</b>.') },

  refund: { title: 'Refund & Cancellation', body:
    META(DOC_UPDATED) +
    H('Cancellations') +
    UL(['<b>Free cancellation</b> before the Provider starts travelling or begins work.', 'If the Provider has already reached your location, a small visiting charge may apply.', 'Providers may also cancel in genuine cases (unsafe site, wrong details); you are not charged in that case.']) +
    H('Refunds') +
    UL(['If you paid in the app and the service was not delivered, you are eligible for a full refund.', 'If the work was partially done, a fair amount for completed work may be retained.', 'Approved refunds are processed to the original payment method, usually within 5–7 business days.']) +
    H('Disputes') +
    P('If a bill looks wrong, tap <b>Dispute</b> on the bill screen. Our team reviews the job details and photos and helps reach a fair resolution before any payment is finalised.') +
    H('How to request') +
    P('Open the booking in <b>My Bookings</b> and use Dispute, or email <b>support@helpzo.app</b> with your booking details.') },

  safety: { title: 'Trust, Safety & Verification', body:
    META(DOC_UPDATED) +
    P('Every HelpZo Partner goes through verification before they can take jobs — so you can book with confidence.') +
    H('How we verify Providers') +
    UL(['<b>Aadhaar (KYC):</b> government ID, front and back.', '<b>PAN card:</b> identity and tax verification.', '<b>Live selfie:</b> matched against the ID to confirm the real person.', '<b>Bank details:</b> for secure, traceable payouts.', '<b>Skill & experience:</b> trade and years of experience are reviewed.']) +
    H('The “Verified” badge') +
    P('A green <b>✔ Verified</b> badge means the Provider has cleared HelpZo’s KYC checks and holds a verification certificate. Providers still under review are marked accordingly.') +
    H('Safety while booking') +
    UL(['See ratings and real customer reviews before you book.', 'Share your live booking status with family.', 'In-app chat and call — no need to share your personal number publicly.', 'Rate every job; low-rated Providers are reviewed and can be removed.']) +
    H('Report a concern') +
    P('If anything feels wrong, contact us immediately at <b>safety@helpzo.app</b>. We take every report seriously.') },

  about: { title: 'About HelpZo', body:
    META('HelpZo · Version 1.0') +
    P('<b>HelpZo — Your Problem · Our Priority.</b>') +
    P('HelpZo is a hyperlocal services marketplace that connects you with trusted, verified local professionals — plumbers, electricians, AC technicians, carpenters, painters and more — right in your neighbourhood.') +
    H('Why HelpZo') +
    UL(['<b>Verified professionals</b> near you, with ratings and reviews.', '<b>Transparent pricing</b> — approve the bill before you pay.', '<b>Fast & local</b> — book in minutes, get help the same day.', '<b>Secure</b> — your data and payments are protected.']) +
    H('Our mission') +
    P('To make everyday home services simple, trustworthy and fair — for customers and for the skilled workers who serve them.') +
    H('Reach us') +
    P('Ahmedabad, Gujarat, India<br>Email: <b>hello@helpzo.app</b>') },

  contact: { title: 'Contact & Support', body:
    META('We’re here to help, 7 days a week') +
    H('Customer support') +
    P('Email: <b>support@helpzo.app</b>') +
    H('Safety concerns') +
    P('Email: <b>safety@helpzo.app</b>') +
    H('Privacy requests') +
    P('Email: <b>privacy@helpzo.app</b>') +
    H('Become a Partner') +
    P('Are you a service professional? Join HelpZo and get more work in your area — ask our team for the Partner app.') +
    H('Office') +
    P('HelpZo, Ahmedabad, Gujarat, India') }
};

/* ---------- call the selected provider (creates a lead, then dials) ---------- */
async function dialProvider() {
  let p = selectedProvider || DEMO_PROVIDERS[0];
  if (hasSupabase && session && p.id && !String(p.id).startsWith('d')) {
    api.createLead(p.id).catch(() => {});               // fire-and-forget lead
    if (!p.phone) { try { const row = await api.getProvider(p.id); if (row?.phone) p.phone = row.phone; } catch (e) {} }
  }
  if (p.phone) { toast('Calling ' + p.name + '…'); window.location.href = telHref(p.phone); }
  else { toast('Request sent to ' + p.name); }
}

/* ---------- edit profile (name) ---------- */
function editProfile() { show('editprofile'); }

/* ---------- profile: fields, completion, local persistence ---------- */
const PROFILE_KEY = 'helpzo_customer_profile';
const AHM_AREAS = ['Satellite','Bodakdev','Vastrapur','Thaltej','Bopal','South Bopal','Prahlad Nagar','Jodhpur','Ambawadi','Navrangpura','Naranpura','Memnagar','Vejalpur','Gota','Chandkheda','Motera','Sola','Science City','Maninagar','Isanpur','Ghatlodia','Nikol','Naroda','Vastral','Chandlodia','Paldi','Vasna','Shahibaug','SG Highway','Ellis Bridge'];
function loadLocalProfile() {
  try { const j = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); if (j) myProfile = { ...(myProfile || {}), ...j }; } catch (e) {}
}
function saveLocalProfile() {
  try {
    const p = myProfile || {};
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ full_name: p.full_name, email: p.email, gender: p.gender, area: p.area, home_area: p.home_area, address: p.address, avatar: p.avatar }));
  } catch (e) {}
}
function profileCompletion() {
  const p = myProfile || {};
  const vals = [p.full_name, p.email, p.gender, (p.area || p.home_area), p.address];
  return Math.round(vals.filter((v) => v && String(v).trim()).length / vals.length * 100);
}
function renderEditProfile() {
  const p = myProfile || {};
  const name = p.full_name || '';
  if ($('epName')) $('epName').value = name;
  if ($('epEmail')) $('epEmail').value = p.email || '';
  if ($('epArea')) $('epArea').value = p.area || p.home_area || '';
  if ($('epAddr')) $('epAddr').value = p.address || '';
  if ($('epPhone')) $('epPhone').value = p.phone || (session?.user?.phone ? '+' + session.user.phone : '') || '';
  paintAvatar($('epAvatar'), name, p.avatar);
  document.querySelectorAll('#epGender [data-gender]').forEach((c) => c.classList.toggle('on', c.getAttribute('data-gender') === p.gender));
  const dl = $('epAreaList'); if (dl && !dl.children.length) dl.innerHTML = AHM_AREAS.map((a) => `<option value="${a}">`).join('');
}
async function saveProfile() {
  const name = ($('epName').value || '').trim();
  if (!name) { toast('Please enter your name'); $('epName').focus(); return; }
  const email = ($('epEmail').value || '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Enter a valid email'); $('epEmail').focus(); return; }
  const gender = document.querySelector('#epGender [data-gender].on')?.getAttribute('data-gender') || '';
  const area = ($('epArea').value || '').trim();
  const address = ($('epAddr').value || '').trim();
  myProfile = { ...(myProfile || {}), full_name: name, email, gender, area, home_area: area, address };
  saveLocalProfile();
  if (hasSupabase && session) { try { await api.updateMyProfile({ full_name: name, home_area: area }); } catch (e) {} }
  renderAccount();
  toast('Profile saved');
  show('account');
}

/* ---------- OTP input UX ---------- */
// Spread a full code across the 6 boxes (autofill / paste / Web OTP) and
// auto-verify once all digits are present.
function fillOtp(code) {
  const inputs = Array.from(document.querySelectorAll('[data-otp]'));
  const digits = String(code).replace(/\D/g, '').slice(0, inputs.length).split('');
  if (!digits.length) return;
  inputs.forEach((inp, i) => { inp.value = digits[i] || ''; });
  (inputs[Math.min(digits.length, inputs.length - 1)] || inputs[0]).focus();
  if (digits.length >= inputs.length) setTimeout(() => doVerify(), 180);
}
function otpAllFilled() { return Array.from(document.querySelectorAll('[data-otp]')).every((i) => i.value); }
function wireOtpInputs() {
  const inputs = Array.from(document.querySelectorAll('[data-otp]'));
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      const v = inp.value.replace(/\D/g, '');
      if (v.length > 1) { fillOtp(v); return; }          // SMS autofill / paste of the whole code
      inp.value = v.slice(0, 1);
      if (inp.value && i < inputs.length - 1) inputs[i + 1].focus();
      else if (inp.value && otpAllFilled()) setTimeout(() => doVerify(), 180);
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus(); });
    inp.addEventListener('paste', (e) => {
      const t = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      if (/\d{2,}/.test(t)) { e.preventDefault(); fillOtp(t); }
    });
  });
}
// Web OTP API — on supported browsers the SMS code is read and filled with no typing.
let otpAbort = null;
function startOtpAutofill() {
  try { otpAbort?.abort(); } catch (e) {}
  if (!('OTPCredential' in window) || !navigator.credentials) return;
  try {
    otpAbort = new AbortController();
    navigator.credentials.get({ otp: { transport: ['sms'] }, signal: otpAbort.signal })
      .then((c) => { if (c && c.code) fillOtp(c.code); })
      .catch(() => {});
  } catch (e) {}
}

/* ---------- logout ---------- */
async function logout() {
  try { if (hasSupabase) await api.signOut(); } catch (e) {}
  session = null; myProfile = null;
  $('loginOtpStep').hidden = true; $('loginPhoneStep').hidden = false;
  document.querySelectorAll('[data-otp]').forEach((i) => (i.value = ''));
  if ($('phone')) $('phone').value = '';
  stack = ['splash']; show('login');
}

/* ---------- boot ---------- */
async function boot() {
  buildTabBars();
  loadLocalProfile();   // restore any locally-saved profile fields
  try { const l = localStorage.getItem('helpzo_lang'); if (l && LANGS[l]) curLang = l; } catch (e) {}
  try { applyTheme(localStorage.getItem('helpzo_theme') || 'light'); } catch (e) {}
  wireOtpInputs();
  $('getOtpBtn')?.addEventListener('click', doGetOtp);
  $('verifyOtpBtn')?.addEventListener('click', doVerify);
  $('resendBtn')?.addEventListener('click', doGetOtp);
  $('changeNumBtn')?.addEventListener('click', () => { $('loginOtpStep').hidden = true; $('loginPhoneStep').hidden = false; });
  $('phone')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doGetOtp(); });
  $('confirmBookBtn')?.addEventListener('click', confirmBooking);
  $('logoutBtn')?.addEventListener('click', logout);
  $('homeSearch')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  $('homeSearchGo')?.addEventListener('click', doSearch);
  $('citySearch')?.addEventListener('input', renderCityScreen);
  $('bookAddr')?.addEventListener('input', () => {
    addrTyping = true; clearTimeout(addrTypeTimer);
    addrTypeTimer = setTimeout(() => { addrTyping = false; try { bookPicker?.geocodeAddress($('bookAddr').value); } catch (e) {} }, 700);
  });
  $('chatSendBtn')?.addEventListener('click', sendChat);
  $('chatInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  $('fbSendBtn')?.addEventListener('click', sendFeedback);
  $('fbInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendFeedback(); });
  $('epPhoto')?.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      const url = await fileToAvatarDataUrl(f);
      myProfile = { ...(myProfile || {}), avatar: url };
      saveLocalProfile();
      paintAvatar($('epAvatar'), myProfile.full_name, url);
      paintAvatar($('accAvatar'), myProfile.full_name, url);
      toast('Photo updated');
    } catch (err) { toast('Could not read image'); }
    e.target.value = '';
  });

  // Restore session + reference data before routing (guarded so the splash
  // never hangs on the network).
  const ready = (async () => {
    if (!hasSupabase) return;
    try {
      const cats = await api.getCategories();
      (cats || []).forEach((c) => {
        const label = (c.translations && (c.translations.en)) || c.key;
        catMap[c.id] = label;
        catByKey[c.key] = c.id;
      });
    } catch (e) {}
    try { session = await api.getSession(); } catch (e) {}
    if (session) {
      myProfile = await api.getMyProfile().catch(() => null);
      loadLocalProfile();   // overlay locally-saved extras (email, gender, address)
    }
  })();

  const route = () => { stack = ['splash']; show(session ? 'home' : 'login'); };
  // Route after the session settles, but no later than 2.6s (splash cap).
  Promise.race([ready, new Promise((r) => setTimeout(r, 2600))]).then(() => {
    setTimeout(route, session != null || !hasSupabase ? 400 : 0);
  });
  setTimeout(() => { if (currentScreenIsSplash()) route(); }, 2800);
}
function currentScreenIsSplash() {
  const s = document.querySelector('.screen.on');
  return !s || s.id === 's-splash';
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
