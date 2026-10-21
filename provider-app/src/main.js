// =====================================================================
// HelpZo Partner — app logic (Capacitor + Vite, wired to Supabase)
// UI markup/CSS in index.html. Data layer in api.js.
// Design: 22-screen HelpZo Provider spec (blue/green, Inter).
// =====================================================================
import * as api from './api.js';
import { hasSupabase } from './supabase.js';
import { openMaps, liveMap } from './maps.js';

/* ---------- tiny helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const telHref = (p) => 'tel:' + String(p || '').replace(/[^\d+]/g, '');

/* ---------- profile photo ---------- */
const PROV_PHOTO_KEY = 'helpzo_provider_photo';
let provPhoto = null;
try { provPhoto = localStorage.getItem(PROV_PHOTO_KEY) || null; } catch (e) {}
// Read a picked image, downscale to ~256px square, return a small JPEG data URL.
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
// Paint the profile avatar: photo (keeping the online dot) or the name's first letter.
function paintProvAvatar() {
  const el = $('profAvatar'); if (!el) return;
  const dot = el.querySelector('span');
  const letter = ((myProvider && myProvider.name) || 'P')[0].toUpperCase();
  if (provPhoto) {
    el.style.backgroundImage = `url("${provPhoto}")`; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center';
    if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.textContent = '';
  } else {
    el.style.backgroundImage = 'none';
    if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.textContent = letter;
    else el.insertBefore(document.createTextNode(letter), el.firstChild);
  }
  if (dot) dot.style.display = '';
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

/* ---------- app state ---------- */
let stack = ['splash'];
let categories = [];
let myProvider = null;
let session = null;
let pendingPhone = null;
let selectedCatId = null;
let selectedCatLabel = null;
let selectedExp = 2;
let editMode = false;      // true = reg2 opened from Profile as "Edit Profile"
let chatCustomer = null;   // { id, name } for the active chat
let chatFromInbox = false; // true when chat opened from the Messages inbox
let chatChannel = null;
let timerHandle = null;
let toastTimer = null;

/* ---------- service categories (icon + color, matches design) ---------- */
const CATS = [
  { key: 'plumber',     label: 'Plumber',     icon: '🚰', cls: 'c-plumb' },
  { key: 'electrician', label: 'Electrician', icon: '⚡', cls: 'c-elec' },
  { key: 'ac_repair',   label: 'AC Repair',   icon: '❄️', cls: 'c-ac' },
  { key: 'carpenter',   label: 'Carpenter',   icon: '🔧', cls: 'c-carp' },
  { key: 'painter',     label: 'Painter',     icon: '🎨', cls: 'c-paint' },
  { key: 'cleaning',    label: 'Cleaning',    icon: '🧹', cls: 'c-clean' },
  { key: 'home_repair', label: 'Home Repair', icon: '🏠', cls: 'c-home' },
  { key: 'other',       label: 'More',        icon: '⋯',  cls: 'c-more' },
];
const catCls = (key) => (CATS.find((c) => c.key === key) || CATS[7]).cls;
const catIcon = (key) => (CATS.find((c) => c.key === key) || CATS[7]).icon;
// Map a free-text service label (e.g. "Plumbing", "Electrical") to a category key.
function catKeyFromLabel(label) {
  const l = String(label || '').trim().toLowerCase();
  if (!l) return 'other';
  const hit = CATS.find((c) => l.includes(c.key.replace('_', ' ')) || l.includes(c.label.toLowerCase()));
  if (hit) return hit.key;
  if (l.includes('plumb')) return 'plumber';
  if (l.includes('electric')) return 'electrician';
  if (l.includes('ac ') || l.includes('a/c') || l.includes('air con')) return 'ac_repair';
  if (l.includes('carp') || l.includes('furnitur')) return 'carpenter';
  if (l.includes('paint')) return 'painter';
  if (l.includes('clean')) return 'cleaning';
  if (l.includes('home') || l.includes('repair')) return 'home_repair';
  return 'other';
}

/* ---------- KYC documents ----------
   Aadhaar needs BOTH sides, so it has two upload slots (front + back).      */
const DOCS = [
  { kind: 'aadhaar', title: 'Aadhaar Card', sub: 'Front & Back', icon: '💳', tile: '#EAF1FE', color: 'var(--primary)', slots: ['aadhaar_front', 'aadhaar_back'], slotLabels: ['Front', 'Back'] },
  { kind: 'pan',     title: 'PAN Card',     sub: 'Front',        icon: '💳', tile: '#EAF1FE', color: 'var(--primary)' },
  { kind: 'selfie',  title: 'Selfie with Aadhaar', sub: 'Live Photo', icon: '🧑', tile: '#EAF1FE', color: 'var(--primary)' },
  { kind: 'bank',    title: 'Bank Details', sub: 'Cancel Cheque / Passbook', icon: '🏦', tile: '#FFF1DC', color: '#E08A1E' },
];
// Which provider column each uploaded KYC slot is saved to.
const KYC_COL = { aadhaar_front: 'aadhaar_path', aadhaar_back: 'aadhaar_back_path', pan: 'pan_path', selfie: 'selfie_path' };
const kycFiles = {};      // slot -> File
const kycUploaded = {};   // slot -> path (verified/uploaded)

/* ---------- Ahmedabad service areas (Service Area autocomplete) ---------- */
// Provider's map coordinates — without lat/lng a listing never appears in the
// customer "nearby" search (the RPC filters out rows with null lat/lng).
const DEF_LAT = Number(import.meta.env.VITE_DEFAULT_LAT ?? 23.0225);
const DEF_LNG = Number(import.meta.env.VITE_DEFAULT_LNG ?? 72.5714);
function providerCoords() {
  return new Promise((res) => {
    if (!navigator.geolocation) return res({ lat: DEF_LAT, lng: DEF_LNG });
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res({ lat: DEF_LAT, lng: DEF_LNG }),
      { timeout: 6000, maximumAge: 60000 });
  });
}
const AHMEDABAD_AREAS = ['Bodakdev','Satellite','Vastrapur','Thaltej','Bopal','South Bopal','Prahlad Nagar','Jodhpur','Ambawadi','Navrangpura','Naranpura','Vadaj','Sabarmati','Chandkheda','Motera','Gota','Chandlodia','Ghatlodia','Nirnaynagar','Ranip','New Ranip','Memnagar','Vastrapur','Jivraj Park','Vejalpur','Juhapura','Sarkhej','Makarba','Ghuma','Shela','Science City','Sola','Shilaj','Gurukul','Drive-In','Helmet','Chanakyapuri','Usmanpura','Ashram Road','Paldi','Vasna','Maninagar','Isanpur','Vatva','Ghodasar','Khokhra','Amraiwadi','Nikol','Naroda','Bapunagar','Odhav','Vastral','Ramol','CTM','Hatkeshwar','Rakhial','Saraspur','Gomtipur','Shahibaug','Dariapur','Kalupur','Shahpur','Raikhad','Jamalpur','Behrampura','Danilimda','Narol','Lambha','Chandola','Kankaria','Ellis Bridge','Law Garden','Gulbai Tekra','Stadium','Commerce Six Roads','SG Highway','Thaltej Road','Sindhu Bhavan Road','Shyamal','Anandnagar','Ramdevnagar'];

/* ---------- DEMO data (keeps screens populated like the mockups) ---------- */
const DEMO_JOBS = [
  { cat:'plumber', title:'Plumbing', area:'Satellite, Ahmedabad', when:'Today, 3:00 PM', name:'Rohit Mehta', phone:'+91 98240 11223', desc:'Tap leaking in bathroom', status:'New Request', pill:'orange', isNew:true },
  { cat:'ac_repair', title:'AC Repair', area:'Bodakdev, Ahmedabad', when:'Today, 5:00 PM', name:'Rahul Sharma', phone:'+91 98765 43210', status:'On the way', pill:'green', a:'Get Directions', b:'Update Status', ga:'enroute', gb:'enroute' },
  { cat:'electrician', title:'Electrician', area:'Thaltej, Ahmedabad', when:'Today, 6:30 PM', name:'Neha Patel', phone:'+91 91234 56789', status:'In Progress', pill:'blue', a:'View Details', b:'Mark Complete', ga:'jobdetail', gb:'completed' },
  { cat:'carpenter', title:'Carpenter', area:'Vastrapur, Ahmedabad', when:'Tomorrow, 10:00 AM', name:'Kunal Mehta', phone:'+91 99887 66554', status:'Scheduled', pill:'orange', a:'Reschedule', b:'View Details', ga:'', gb:'jobdetail' },
  { cat:'cleaning', title:'Cleaning', area:'Satellite, Ahmedabad', when:'Tomorrow, 2:00 PM', name:'Priya Desai', phone:'+91 87654 32109', status:'Scheduled', pill:'purple', a:'Reschedule', b:'View Details', ga:'', gb:'jobdetail' },
  { cat:'plumber', title:'Plumbing', area:'Maninagar, Ahmedabad', when:'In 2 days, 11:00 AM', name:'Amit Shah', phone:'+91 90909 12345', status:'Scheduled', pill:'orange', a:'Reschedule', b:'View Details', ga:'', gb:'jobdetail' },
  { cat:'ac_repair', title:'AC Repair', area:'Satellite, Ahmedabad', when:'Yesterday, 4:00 PM', name:'Mehul Shah', phone:'+91 98250 11111', desc:'AC gas refill — done', status:'Completed', pill:'green', a:'View Details', b:'', ga:'jobdetail', gb:'' },
  { cat:'plumber', title:'Plumbing', area:'Bopal, Ahmedabad', when:'2 days ago', name:'Ritu Shah', phone:'+91 98250 22222', desc:'Pipe leak fixed', status:'Completed', pill:'green', a:'View Details', b:'', ga:'jobdetail', gb:'' },
  { cat:'electrician', title:'Electrician', area:'Naranpura, Ahmedabad', when:'3 days ago', name:'Sachin Rao', phone:'+91 98250 33333', desc:'Switchboard replaced', status:'Completed', pill:'green', a:'View Details', b:'', ga:'jobdetail', gb:'' },
];
const DEMO_LEADS = [
  { cat:'ac_repair', title:'AC Repair', name:'Rohit Mehta', phone:'+91 98240 11223', area:'Ahmedabad - Satellite', desc:'AC not cooling, needs service', dist:'2.1 km • Today, 5:00 PM', price:'₹300 - ₹500' },
  { cat:'plumber', title:'Plumbing', name:'Sneha Joshi', phone:'+91 99250 44556', area:'Ahmedabad - Bodakdev', desc:'Tap leaking in bathroom', dist:'3.4 km • Today, 4:30 PM', price:'₹200 - ₹400' },
  { cat:'electrician', title:'Electrician', name:'Vijay Rana', phone:'+91 97370 77889', area:'Ahmedabad - Thaltej', desc:'Fan and switch repair', dist:'4.2 km • Today, 6:00 PM', price:'₹250 - ₹450' },
  { cat:'carpenter', title:'Carpenter', name:'Anita Shah', phone:'+91 90999 33221', area:'Ahmedabad - Nikol', desc:'Door alignment and lock fix', dist:'1.8 km • Tomorrow, 10:00 AM', price:'₹400 - ₹800' },
];
const DEMO_TXN = [
  { cat:'ac_repair', t:'AC Repair - Rahul Sharma', daysAgo:0, amt:450 },
  { cat:'plumber', t:'Plumbing - Amit Shah', daysAgo:1, amt:300 },
  { cat:'electrician', t:'Electrical - Neha Patel', daysAgo:2, amt:400 },
  { cat:'carpenter', t:'Carpenter - Kunal Mehta', daysAgo:4, amt:600 },
];
// Human date for a demo transaction, relative to today (keeps the list fresh).
function txnDate(daysAgo) {
  const d = new Date(); d.setDate(d.getDate() - (daysAgo || 0));
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
const DEMO_REVIEWS = [
  { name:'Rahul Sharma', rating:5, ago:'2 days ago', body:'Great service! Very professional and on time. My AC is working perfectly now. Highly recommended!', tags:['On Time','Professional','Good Communication'] },
  { name:'Neha Patel', rating:5, ago:'1 week ago', body:'Very polite and skilled. Fixed the plumbing issue quickly. Will definitely call again.', tags:['Quick Service','Knowledgeable','Polite'] },
  { name:'Kishan Makwana', rating:4, ago:'2 weeks ago', body:'Good work overall. Arrived a bit late but the job was done well.', tags:['Good Quality','Late Arrival'] },
];
const DEMO_NOTIF = [
  { icon:'📅', cls:'c-clean', title:'New Job Assigned', body:'New job request for AC Repair in Bodakdev, Ahmedabad.', ago:'2 min', unread:true },
  { icon:'🧭', cls:'c-plumb', title:'Job Starting Soon', body:'Your AC Repair with Rahul Sharma in Bodakdev starts at 5:00 PM.', ago:'15 min', unread:true },
  { icon:'💳', cls:'c-elec', title:'Payment Received', body:'You received ₹1,400 from Rahul Sharma via UPI.', ago:'1 hr', unread:true },
  { icon:'★', cls:'c-paint', title:'New Review', body:'Rahul Sharma gave you a 5-star rating. "Great service!"', ago:'2 hr', unread:false },
  { icon:'✓', cls:'c-clean', title:'Job Completed', body:'Your Electrical job at Thaltej has been marked completed.', ago:'1 day', unread:false },
  { icon:'🔔', cls:'c-more', title:'System Update', body:'New features have been added to improve your experience.', ago:'2 days', unread:false },
];
const DEMO_SCHED = [
  { day:0, t1:'10:00 AM', t2:'11:00 AM', cat:'ac_repair', title:'AC Repair', name:'Rahul Sharma', phone:'+91 98765 43210', area:'Bodakdev', desc:'Split AC not cooling properly', pill:'Upcoming', p:'blue' },
  { day:0, t1:'1:00 PM', t2:'2:00 PM', cat:'plumber', title:'Plumbing', name:'Neha Patel', phone:'+91 91234 56789', area:'Vastrapur', desc:'Water leakage in kitchen', pill:'Upcoming', p:'blue' },
  { day:1, t1:'11:00 AM', t2:'12:00 PM', cat:'electrician', title:'Electrical', name:'Kishan Makwana', phone:'+91 99887 66554', area:'Maninagar', desc:'Switch board not working', pill:'Upcoming', p:'blue' },
  { day:1, t1:'3:00 PM', t2:'4:00 PM', cat:'carpenter', title:'Carpenter', name:'Priya Desai', phone:'+91 87654 32109', area:'Satellite', desc:'Fix wardrobe hinges & drawer', pill:'Upcoming', p:'blue' },
  { day:2, t1:'9:30 AM', t2:'10:30 AM', cat:'cleaning', title:'Deep Cleaning', name:'Amit Shah', phone:'+91 90909 12345', area:'Thaltej', desc:'Full home deep cleaning', pill:'Upcoming', p:'blue' },
];
const DEMO_CHAT = [
  { me:false, body:"Hi, I'm Rahul. My AC is not cooling properly. Can you check today?", time:'9:12 AM' },
  { me:true,  body:'Hi Rahul, sure! I am on the way, will reach in ~15 min.', time:'9:15 AM' },
  { me:false, body:'Okay, thank you. Please bring the gas too.', time:'9:16 AM' },
  { me:true,  body:'Noted 👍 See you soon.', time:'9:18 AM' },
];

/* ---------- toast ---------- */
function toast(msg) {
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- navigation ---------- */
const TAB_SCREENS = ['jobs', 'schedule', 'earnings', 'profile'];
function show(id, push = true) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
  const el = $('s-' + id);
  if (!el) return;
  el.classList.add('on');
  const sc = el.querySelector('.scroll'); if (sc) sc.scrollTop = 0;
  if (push && stack[stack.length - 1] !== id) stack.push(id);
  onEnter(id);
  applyLang(curLang, el);   // translate this screen (incl. freshly-rendered content)
}
function back() {
  if (stack.length > 1) { stack.pop(); show(stack[stack.length - 1], false); }
  else show('jobs', false);
}
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
    'Jobs': 'काम', 'Leads': 'लीड', 'Schedule': 'शेड्यूल', 'Earnings': 'कमाई', 'Profile': 'प्रोफ़ाइल',
    'My Jobs': 'मेरे काम', 'New Requests (Leads)': 'नई रिक्वेस्ट (लीड)', 'My Schedule': 'मेरा शेड्यूल',
    'Active': 'सक्रिय', 'Completed': 'पूर्ण', 'Cancelled': 'रद्द', 'All': 'सभी', 'Pending': 'लंबित', 'Accepted': 'स्वीकृत',
    'Accept': 'स्वीकारें', 'Reject': 'अस्वीकारें', 'Get Directions': 'दिशा पाएं', 'Directions': 'दिशा',
    'Update Status': 'स्थिति अपडेट करें', 'View Details': 'विवरण देखें', 'Mark Complete': 'पूर्ण करें',
    'Start Job': 'काम शुरू करें', 'Reschedule': 'पुनर्निर्धारित करें', 'Call': 'कॉल करें',
    'En Route to Job': 'काम की ओर', 'Job In Progress': 'काम जारी है', 'Job Completed': 'काम पूर्ण',
    'Job Details': 'काम का विवरण', 'Accept Job': 'काम स्वीकारें', 'Arrived': 'पहुंच गए', 'Report': 'रिपोर्ट',
    'Work Update': 'काम अपडेट', 'Add Photos': 'फोटो जोड़ें', 'Add Notes': 'नोट्स जोड़ें',
    'Bill — Charges': 'बिल — शुल्क', 'Add': 'जोड़ें', 'Total': 'कुल', 'Customer Signature': 'ग्राहक हस्ताक्षर',
    'Send Bill & Complete': 'बिल भेजें और पूर्ण करें', 'Issue': 'समस्या', 'Next Job': 'अगला काम', 'Home': 'होम',
    'Earnings': 'कमाई', 'Total Earnings': 'कुल कमाई', 'Available Balance': 'उपलब्ध शेष', 'Withdraw': 'निकालें',
    'Jobs Done': 'पूर्ण काम', 'Rating': 'रेटिंग', 'Recent Transactions': 'हाल के लेनदेन', 'View All': 'सभी देखें',
    'My Profile': 'मेरी प्रोफ़ाइल', 'Online': 'ऑनलाइन', 'Personal Information': 'व्यक्तिगत जानकारी',
    'Service Categories': 'सेवा श्रेणियां', 'My Documents': 'मेरे दस्तावेज़', 'Reviews & Ratings': 'समीक्षा और रेटिंग',
    'Help & Support': 'मदद और सहायता', 'Privacy & Settings': 'गोपनीयता और सेटिंग्स', 'Settings': 'सेटिंग्स',
    'Account Settings': 'खाता सेटिंग्स', 'Edit Profile': 'प्रोफ़ाइल संपादित करें', 'App Preferences': 'ऐप प्राथमिकताएं',
    'Notifications': 'सूचनाएं', 'Language': 'भाषा', 'Dark Mode': 'डार्क मोड', 'Legal': 'कानूनी', 'Logout': 'लॉग आउट',
    'Save Changes': 'बदलाव सहेजें', 'Next': 'अगला', 'Choose your language': 'अपनी भाषा चुनें',
  },
  gu: {
    'Jobs': 'કામ', 'Leads': 'લીડ', 'Schedule': 'શેડ્યૂલ', 'Earnings': 'કમાણી', 'Profile': 'પ્રોફાઇલ',
    'My Jobs': 'મારા કામ', 'New Requests (Leads)': 'નવી વિનંતીઓ (લીડ)', 'My Schedule': 'મારું શેડ્યૂલ',
    'Active': 'સક્રિય', 'Completed': 'પૂર્ણ', 'Cancelled': 'રદ', 'All': 'બધા', 'Pending': 'બાકી', 'Accepted': 'સ્વીકૃત',
    'Accept': 'સ્વીકારો', 'Reject': 'નકારો', 'Get Directions': 'દિશા મેળવો', 'Directions': 'દિશા',
    'Update Status': 'સ્થિતિ અપડેટ કરો', 'View Details': 'વિગતો જુઓ', 'Mark Complete': 'પૂર્ણ કરો',
    'Start Job': 'કામ શરૂ કરો', 'Reschedule': 'ફરી શેડ્યૂલ કરો', 'Call': 'કૉલ કરો',
    'En Route to Job': 'કામ તરફ', 'Job In Progress': 'કામ ચાલુ છે', 'Job Completed': 'કામ પૂર્ણ',
    'Job Details': 'કામની વિગતો', 'Accept Job': 'કામ સ્વીકારો', 'Arrived': 'પહોંચી ગયા', 'Report': 'રિપોર્ટ',
    'Work Update': 'કામ અપડેટ', 'Add Photos': 'ફોટા ઉમેરો', 'Add Notes': 'નોંધ ઉમેરો',
    'Bill — Charges': 'બિલ — શુલ્ક', 'Add': 'ઉમેરો', 'Total': 'કુલ', 'Customer Signature': 'ગ્રાહક સહી',
    'Send Bill & Complete': 'બિલ મોકલો અને પૂર્ણ કરો', 'Issue': 'સમસ્યા', 'Next Job': 'આગળનું કામ', 'Home': 'હોમ',
    'Earnings': 'કમાણી', 'Total Earnings': 'કુલ કમાણી', 'Available Balance': 'ઉપલબ્ધ બેલેન્સ', 'Withdraw': 'ઉપાડો',
    'Jobs Done': 'પૂર્ણ કામ', 'Rating': 'રેટિંગ', 'Recent Transactions': 'તાજેતરના વ્યવહારો', 'View All': 'બધું જુઓ',
    'My Profile': 'મારી પ્રોફાઇલ', 'Online': 'ઓનલાઇન', 'Personal Information': 'વ્યક્તિગત માહિતી',
    'Service Categories': 'સેવા શ્રેણીઓ', 'My Documents': 'મારા દસ્તાવેજો', 'Reviews & Ratings': 'સમીક્ષા અને રેટિંગ',
    'Help & Support': 'મદદ અને સપોર્ટ', 'Privacy & Settings': 'ગોપનીયતા અને સેટિંગ્સ', 'Settings': 'સેટિંગ્સ',
    'Account Settings': 'એકાઉન્ટ સેટિંગ્સ', 'Edit Profile': 'પ્રોફાઇલ સંપાદિત કરો', 'App Preferences': 'એપ પસંદગીઓ',
    'Notifications': 'સૂચનાઓ', 'Language': 'ભાષા', 'Dark Mode': 'ડાર્ક મોડ', 'Legal': 'કાનૂની', 'Logout': 'લૉગ આઉટ',
    'Save Changes': 'ફેરફારો સાચવો', 'Next': 'આગળ', 'Choose your language': 'તમારી ભાષા પસંદ કરો',
  },
};
const _origText = new WeakMap();
function applyLang(code, root) {
  const scope = root || document.body;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((n) => { if (_origText.has(n)) n.nodeValue = _origText.get(n); });
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
  if (hasSupabase && session && typeof api.updateMyProfile === 'function') { try { api.updateMyProfile({ preferred_lang: code }); } catch (e) {} }
  applyLang(code, document.body);
  const lc = $('langCurrent'); if (lc) lc.textContent = LANGS[code] + ' ›';
  renderLangScreen();
}
function renderLangScreen() {
  const el = $('langList'); if (!el) return;
  el.innerHTML = Object.entries(LANGS).map(([code, name]) =>
    `<div class="mrow" data-lang="${code}"><div class="mt"><div class="a">${name}</div></div><span class="mc">${code === curLang ? '✓' : '›'}</span></div>`).join('<div class="divide"></div>');
}

/* ---------- bottom tab bar ---------- */
const TABS = [
  { id: 'jobs', ic: '💼', lb: 'Jobs' },
  { id: 'schedule', ic: '📅', lb: 'Schedule' },
  { id: 'earnings', ic: '₹', lb: 'Earnings' },
  { id: 'profile', ic: '👤', lb: 'Profile' },
];
function buildTabBars() {
  document.querySelectorAll('[data-tabbar]').forEach((bar) => {
    const cur = bar.closest('.screen').id.replace('s-', '');
    bar.innerHTML = TABS.map((tb) => {
      const on = tb.id === cur ? ' on' : '';
      // new-request badge now lives on the Jobs tab (the "New" sub-tab)
      const badge = tb.id === 'jobs' ? '<span class="tbadge" style="display:none">0</span>' : '';
      return `<div class="tab${on}" data-tab="${tb.id}"><span class="ti">${tb.ic}</span>${badge}${tb.lb}</div>`;
    }).join('');
  });
}

/* ---------- per-screen enter hooks ---------- */
function onEnter(id) {
  if (id === 'jobs') renderJobs();
  if (id === 'leads') renderLeads();
  if (id === 'earnings') renderEarnings();
  if (id === 'reviews') renderReviews();
  if (id === 'notif') renderNotif();
  if (id === 'schedule') renderSchedule();
  if (id === 'profile') renderProfile();
  if (id === 'lang') renderLangScreen();
  if (id === 'reg2') applyReg2Mode();
  if (id === 'certificate') renderCertificate();
  if (id === 'skills') renderSkillGrid();
  if (id === 'reg3') renderDocList();
  if (id === 'verify') renderVerifyList();
  if (id === 'jobdetail') renderJobDetail();
  if (id === 'enroute' || id === 'progress' || id === 'completed') fillJob(currentJob);
  if (id === 'enroute') {
    const m = $('enrouteMap');
    const dest = (currentJob && currentJob.addr) || 'Bodakdev, Ahmedabad';
    if (m) liveMap(m, dest, (info) => {
      if (info.dur && $('etaMin')) $('etaMin').textContent = info.dur;
      if (info.dist && $('etaKm')) $('etaKm').textContent = info.dist;
      if (info.arr && $('etaArr')) $('etaArr').textContent = info.arr.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    });
  }
  if (id === 'chat') openChat();
  if (id === 'messages') renderMessages();
  if (id === 'completed') renderCompleted();
  if (id === 'progress') { startTimer(); initSignature(); initBill(); } else stopTimer();
}

/* ---------- current job (drives En Route / Progress / Completed / Chat) ---------- */
let currentJob = null;
let jobsView = [];     // array currently shown on the Jobs screen
let leadsView = [];    // array currently shown on the Leads screen
let schedView = [];    // rows currently shown on the Schedule screen
function normalizeJob(src) {
  if (!src) return null;
  const real = ('service' in src) || ('customer_name' in src) || ('scheduled_date' in src) || ('customer_phone' in src);
  if (real) return {
    rawId: src.id || null, bill_status: src.bill_status || 'none', paid: !!src.paid,
    status: src.status || 'pending',
    cat: src.category || catKeyFromLabel(src.service),
    cust: src.customer_name || 'Customer', phone: src.customer_phone || '',
    service: src.service || 'Service', desc: src.note || src.description || '',
    addr: src.address || 'Ahmedabad',
    id: src.id ? '#' + String(src.id).replace(/-/g, '').slice(0, 6).toUpperCase() : '#SRV',
    when: `${src.scheduled_date || ''} ${src.scheduled_time || ''}`.trim(),
  };
  return {
    rawId: null, bill_status: 'none', paid: false,
    cat: src.cat || catKeyFromLabel(src.title),
    cust: src.name || 'Customer', phone: src.phone || '',
    service: src.title || 'Service', desc: src.desc || '',
    addr: src.area || 'Ahmedabad', id: src.id || '#SRV1234', when: src.when || '',
  };
}
function fillJob(j) {
  if (!j) return;
  const set = (cls, txt) => document.querySelectorAll('.' + cls).forEach((e) => { e.textContent = txt; });
  set('j-cust', j.cust); set('j-service', j.service); set('j-desc', j.desc || '');
  set('j-sub', `${j.service} • ${j.id}`); set('j-addr', j.addr || '');
  set('j-initial', (j.cust || 'C')[0].toUpperCase());
  const cat = j.cat || catKeyFromLabel(j.service);
  document.querySelectorAll('.j-icon').forEach((e) => { e.className = 'scirc ' + catCls(cat) + ' j-icon'; e.textContent = catIcon(cat); });
  document.querySelectorAll('.j-phone').forEach((e) => { e.textContent = j.phone || ''; });
  document.querySelectorAll('.j-call').forEach((e) => { if (j.phone) e.setAttribute('data-call', j.phone); });
  document.querySelectorAll('.j-maps').forEach((e) => { e.setAttribute('data-maps', j.addr || 'Ahmedabad'); });
  if ($('chatName') && j.cust) $('chatName').textContent = j.cust;
}

/* ---------- bill (job line-items → customer approval → payment) ---------- */
let billItems = [];   // [{id?, label, amount}]
let rateCard = [];    // admin rate card [{item, rate, max_cap, unit}]
async function loadRateCard() {
  if (!(hasSupabase && session)) { rateCard = []; }
  else { try { rateCard = await api.getRateCard(); } catch (e) { rateCard = []; } }
  const dl = $('rateCardList');
  if (dl) dl.innerHTML = rateCard.map((r) => `<option value="${esc(r.item)}">${inr(r.rate)}${r.max_cap ? ' · max ' + inr(r.max_cap) : ''}</option>`).join('');
}
function rateFor(label) {
  const l = String(label || '').trim().toLowerCase();
  return rateCard.find((r) => String(r.item).trim().toLowerCase() === l) || null;
}
async function initBill() {
  billItems = [];
  await loadRateCard();
  if (hasSupabase && currentJob && currentJob.rawId) {
    try { billItems = (await api.getJobItems(currentJob.rawId)).map((it) => ({ id: it.id, label: it.label, amount: it.amount })); } catch (e) {}
  }
  renderBillEditor();
}
function billSum() { return billItems.reduce((s, it) => s + (Number(it.amount) || 0), 0); }
function renderBillEditor() {
  const el = $('billItems'); if (!el) return;
  el.innerHTML = billItems.length ? billItems.map((it, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--cardBorder)">
      <div style="flex:1;font-size:14px">${esc(it.label)}</div>
      <div style="font-weight:700">${inr(it.amount)}</div>
      <span class="link" data-billdel="${i}" style="color:var(--danger)">✕</span></div>`).join('')
    : `<div class="sec" style="font-size:12.5px">No charges added yet.</div>`;
  if ($('billTotal')) $('billTotal').textContent = inr(billSum());
}
async function addBillItem() {
  const label = ($('billLabel').value || '').trim();
  let amount = Math.round(Number($('billAmt').value) || 0);
  if (!label) { toast('Enter item name'); return; }
  if (!amount) { toast('Enter amount'); return; }
  // Enforce the admin rate-card cap for known items.
  const rc = rateFor(label);
  const cap = rc && (rc.max_cap ?? rc.rate);
  if (cap && amount > cap) { amount = cap; toast(`Max for "${label}" is ${inr(cap)} — capped`); }
  const item = { label, amount };
  if (hasSupabase && currentJob && currentJob.rawId) {
    try { const row = await api.addJobItem(currentJob.rawId, label, amount); item.id = row.id; } catch (e) { toast(e.message || 'Could not add'); return; }
  }
  billItems.push(item);
  $('billLabel').value = ''; $('billAmt').value = '';
  renderBillEditor();
}
async function removeBillItem(i) {
  const it = billItems[i]; if (!it) return;
  if (hasSupabase && it.id) { try { await api.deleteJobItem(it.id); } catch (e) {} }
  billItems.splice(i, 1); renderBillEditor();
}
// "Send Bill & Complete": send the bill to the customer for approval.
async function completeJob() {
  const btn = $('completeBtn');
  if (hasSupabase && currentJob && currentJob.rawId) {
    if (!billItems.length) { toast('Add at least one charge, or use the base price'); }
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try { await api.sendBill(currentJob.rawId); toast('Bill sent to customer for approval'); }
    catch (e) { toast(e.message || 'Could not send bill'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '✓ Send Bill & Complete'; } }
    if (currentJob) currentJob.bill_status = 'sent';
  }
  show('completed');
}
function renderCompleted() {
  const bill = $('compBill');
  const total = billSum();
  if (bill) {
    bill.innerHTML = (billItems.length ? billItems.map((it) =>
      `<div style="display:flex;justify-content:space-between;padding:5px 0"><span>${esc(it.label)}</span><span>${inr(it.amount)}</span></div>`).join('')
      : `<div class="sec" style="font-size:13px">No extra charges — base price applies.</div>`)
      + `<div class="divide" style="margin:10px 0"></div><div style="display:flex;justify-content:space-between"><b>Total Amount</b><b>${inr(total)}</b></div>`;
  }
  const pay = $('compPay');
  if (pay) {
    const st = (currentJob && currentJob.bill_status) || (hasSupabase ? 'sent' : 'none');
    const paid = currentJob && currentJob.paid;
    let label, cls;
    if (paid) { label = 'Paid'; cls = 'green'; }
    else if (st === 'approved') { label = 'Approved — awaiting payment'; cls = 'blue'; }
    else if (st === 'disputed') { label = 'Disputed'; cls = 'grey'; }
    else if (st === 'sent') { label = 'Sent — awaiting customer approval'; cls = 'orange'; }
    else { label = 'Not billed'; cls = 'grey'; }
    pay.innerHTML = `<div class="panel" style="display:flex;align-items:center"><span style="font-size:22px">💰</span>
      <div style="flex:1;margin-left:10px"><div style="font-weight:700;font-size:13.5px">Payment Status</div>
      <div class="sec" style="font-size:12px">Customer approves the bill in their app before paying.</div></div>
      <span class="pill ${cls}">${esc(label)}</span></div>`;
  }
}

/* ---------- renderers ---------- */
function jobCard(j) {
  // A brand-new request must be Accepted/Rejected first (card still opens details on tap).
  const actions = j.isNew
    ? `<button class="btn btn-green sm" data-acceptjob>✓ Accept</button>
       <button class="btn btn-out-danger sm" data-rejectjob>Reject</button>`
    : `<button class="btn btn-out sm" ${j.ga ? `data-go="${j.ga}"` : ''}>${esc(j.a)}</button>
       <button class="btn btn-blue sm" ${j.gb ? `data-go="${j.gb}"` : ''}>${esc(j.b)}</button>`;
  return `<div class="card" style="margin-bottom:12px" data-go="${j.isNew ? 'jobdetail' : (j.gb || 'jobdetail')}">
    <div style="display:flex;gap:12px"><div class="scirc ${catCls(j.cat)}">${catIcon(j.cat)}</div>
      <div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:start"><div class="h3">${esc(j.title)}</div><span class="pill ${j.pill}">${esc(j.status)}</span></div>
        <div class="meta"><span class="mi">📍</span>${esc(j.area)}</div>
        <div class="meta"><span class="mi">📅</span>${esc(j.when)}</div>
        <div class="meta"><span class="mi">👤</span>${esc(j.name)}</div>
        <div class="meta"><span class="mi">📞</span><a href="${telHref(j.phone)}" style="color:inherit;text-decoration:none">${esc(j.phone)}</a> <span style="color:var(--whatsapp)">💬</span></div>
      </div></div>
    <div style="display:flex;gap:8px;margin-top:12px">${actions}</div></div>`;
}
function bookingCard(b) {
  const st = String(b.status || 'pending').toLowerCase();
  const bucket = jobBucket(st);
  const pill = bucket === 'active' ? 'green' : bucket === 'cancelled' ? 'grey' : 'orange';
  const label = st[0].toUpperCase() + st.slice(1);
  const cat = b.category || catKeyFromLabel(b.service);
  return `<div class="card" style="margin-bottom:12px" data-go="jobdetail">
    <div style="display:flex;gap:12px"><div class="scirc ${catCls(cat)}">${catIcon(cat)}</div><div style="flex:1">
      <div style="display:flex;justify-content:space-between;align-items:start"><div class="h3">${esc(b.service || 'Service')}</div><span class="pill ${pill}">${esc(label)}</span></div>
      <div class="meta"><span class="mi">📍</span>${esc(b.address || '—')}</div>
      <div class="meta"><span class="mi">📅</span>${esc(b.scheduled_date || '')} ${esc(b.scheduled_time || '')}</div>
      <div class="meta"><span class="mi">👤</span>${esc(b.customer_name || 'Customer')}</div>
      <div class="meta"><span class="mi">📞</span><a href="${telHref(b.customer_phone)}" style="color:inherit;text-decoration:none">${esc(b.customer_phone || '')}</a></div>
      ${b.note ? `<div class="sec" style="font-size:12.5px;margin-top:4px">${esc(b.note)}</div>` : ''}
    </div></div>
    <div style="display:flex;gap:8px;margin-top:12px">${bucket === 'new'
      ? `<button class="btn btn-green sm" data-acceptbook="${b.id}">✓ Accept</button>
         <button class="btn btn-out-danger sm" data-rejectbook="${b.id}">Reject</button>`
      : `<button class="btn btn-out sm" data-maps="${esc(b.address || 'Ahmedabad')}">🧭 Directions</button>
         <button class="btn btn-blue sm" data-go="jobdetail">View &amp; Update</button>`}
    </div></div>`;
}
let jobTab = 'new';
let pendingJobTab = null;   // set by the "Jobs Done" tile to open the Completed tab
let lastJobsRows = null;   // real bookings array (null = not loaded yet)
// Every tab is driven by the real `bookings` table — no demo data.
function jobBucket(st) {
  const s = String(st || 'pending').toLowerCase();
  if (s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'canceled' || s === 'rejected' || s === 'declined') return 'cancelled';
  if (s === 'pending' || s === 'new' || s === 'requested') return 'new';
  return 'active'; // confirmed / accepted / on the way / in progress / scheduled
}
async function renderJobs() {
  const list = $('jobsList'); if (!list) return;
  jobTab = pendingJobTab || 'new';   // default to the New-requests tab ("Jobs Done" tile opens Completed)
  pendingJobTab = null;
  document.querySelectorAll('[data-jobtab]').forEach((c) => c.classList.toggle('on', c.getAttribute('data-jobtab') === jobTab));
  if (!(hasSupabase && myProvider)) { lastJobsRows = []; updateJobCounts(); paintJobs(); return; }
  if (lastJobsRows === null) list.innerHTML = `<div class="empty">Loading…</div>`;
  try { lastJobsRows = await api.getMyBookings(); } catch (e) { lastJobsRows = lastJobsRows || []; }
  updateJobCounts(); paintJobs();
}
function newRequestCount() { return (lastJobsRows || []).filter((b) => jobBucket(b.status) === 'new').length; }
function updateNewBadge(n) {
  document.querySelectorAll('.tbadge').forEach((b) => { b.textContent = n > 9 ? '9+' : String(n); b.style.display = n > 0 ? 'flex' : 'none'; });
}
function updateJobCounts() {
  const c = { new: 0, active: 0, completed: 0, cancelled: 0 };
  (lastJobsRows || []).forEach((b) => { c[jobBucket(b.status)]++; });
  document.querySelectorAll('[data-jobtab]').forEach((ch) => {
    const k = ch.getAttribute('data-jobtab');
    ch.textContent = k[0].toUpperCase() + k.slice(1) + ` (${c[k]})`;
  });
  updateNewBadge(c.new);
}
function emptyJobsMsg(tab) {
  if (tab === 'new') return 'No new requests right now. New customer bookings will appear here.';
  if (tab === 'active') return 'No active jobs. Accept a new request to start working.';
  if (tab === 'completed') return 'No completed jobs yet.';
  return 'No cancelled jobs.';
}
function paintJobs() {
  const list = $('jobsList'); if (!list) return;
  jobsView = (lastJobsRows || []).filter((b) => jobBucket(b.status) === jobTab);
  if (!jobsView.length) { list.innerHTML = `<div class="empty">${emptyJobsMsg(jobTab)}</div>`; return; }
  const render = jobTab === 'completed' ? completedCard : bookingCard;
  list.innerHTML = jobsView.map(render).join('');
}
// Completed card: only the work done + customer name + address (tap for full details).
function completedCard(b) {
  return `<div class="card" style="margin-bottom:12px" data-go="jobdetail">
    <div style="display:flex;gap:12px"><div class="scirc ${catCls(b.category || catKeyFromLabel(b.service))}">${catIcon(b.category || catKeyFromLabel(b.service))}</div><div style="flex:1">
      <div style="display:flex;justify-content:space-between;align-items:start"><div class="h3">${esc(b.service || 'Service')}</div><span class="pill green">Completed</span></div>
      <div class="meta"><span class="mi">👤</span>${esc(b.customer_name || 'Customer')}</div>
      <div class="meta"><span class="mi">📍</span>${esc(b.address || '—')}</div>
    </div></div></div>`;
}
function leadCard(l) {
  return `<div class="card" style="margin-bottom:12px" data-go="jobdetail">
    <div style="display:flex;gap:12px"><div class="scirc ${catCls(l.cat)}">${catIcon(l.cat)}</div><div style="flex:1">
      <div class="h3">${esc(l.title)}</div>
      <div class="meta"><span class="mi">📍</span>${esc(l.area)}</div>
      <div class="meta"><span class="mi">🕐</span>${esc(l.dist)}</div>
      <div class="green-t" style="margin-top:6px;font-size:15px">${esc(l.price)}</div></div></div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-green sm" data-accept>✓ Accept</button><button class="btn btn-out-danger sm" data-reject>Reject</button></div>
  </div>`;
}
function realLeadCard(l) {
  const when = l.created_at ? new Date(l.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const st = l.status || 'new';
  const pill = st === 'completed' ? 'green' : st === 'contacted' ? 'blue' : st === 'cancelled' ? 'grey' : 'orange';
  return `<div class="card" style="margin-bottom:12px">
    <div style="display:flex;gap:12px"><div class="scirc c-more">🔔</div><div style="flex:1">
      <div style="display:flex;justify-content:space-between;align-items:start"><div class="h3">${esc(l.customer_name || 'New request')}</div><span class="pill ${pill}">${esc(st)}</span></div>
      <div class="meta"><span class="mi">📞</span><a href="${telHref(l.customer_phone)}" style="color:inherit;text-decoration:none">${esc(l.customer_phone || '')}</a></div>
      ${l.note ? `<div class="sec" style="font-size:12.5px;margin-top:2px">${esc(l.note)}</div>` : ''}
      <div class="ter" style="margin-top:4px">${esc(when)}</div></div></div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-green sm" data-accept="${l.id}">✓ Accept</button><button class="btn btn-out-danger sm" data-reject="${l.id}">Reject</button></div>
  </div>`;
}
let leadTab = 'all';
let lastLeadsRows = null;   // real leads array, or null = demo
function leadBucket(st) {
  const s = String(st || 'new').toLowerCase();
  if (s === 'contacted' || s === 'completed') return 'accepted';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return 'pending'; // new
}
async function renderLeads() {
  const list = $('leadsList'); if (!list) return;
  leadTab = 'all';
  document.querySelectorAll('[data-ltab]').forEach((c) => c.classList.toggle('on', c.getAttribute('data-ltab') === 'all'));
  if (hasSupabase && myProvider) {
    list.innerHTML = `<div class="empty">Loading…</div>`;
    try {
      const rows = await api.getMyLeads();
      if (rows && rows.length) { lastLeadsRows = rows; updateLeadCounts(); paintLeads(); return; }
    } catch (e) {}
  }
  lastLeadsRows = null;   // no real leads yet → show demo so the screen looks populated
  paintLeads();
}
function updateLeadCounts() {
  const c = { all: (lastLeadsRows || []).length, pending: 0, accepted: 0 };
  (lastLeadsRows || []).forEach((l) => { const b = leadBucket(l.status); if (b === 'pending') c.pending++; else if (b === 'accepted') c.accepted++; });
  document.querySelectorAll('[data-ltab]').forEach((ch) => {
    const k = ch.getAttribute('data-ltab');
    const lbl = k[0].toUpperCase() + k.slice(1);
    ch.textContent = lbl + (lastLeadsRows ? ` (${c[k]})` : '');
  });
}
function paintLeads() {
  const list = $('leadsList'); if (!list) return;
  if (lastLeadsRows === null) {   // demo
    leadsView = (leadTab === 'all' || leadTab === 'pending') ? DEMO_LEADS : [];
    list.innerHTML = leadsView.length ? leadsView.map(leadCard).join('') : `<div class="empty">No ${leadTab} leads.</div>`;
    return;
  }
  leadsView = leadTab === 'all' ? lastLeadsRows : lastLeadsRows.filter((l) => leadBucket(l.status) === leadTab);
  list.innerHTML = leadsView.length ? leadsView.map(realLeadCard).join('') : `<div class="empty">No ${leadTab} leads.</div>`;
}
/* ---------- earnings ---------- */
const EARN_DATA = {
  today: { label: 'Today',      total: 850,  jobs: 2,  bars: [['9a', 30], ['12p', 65], ['3p', 90], ['6p', 55]] },
  week:  { label: 'This Week',  total: 3300, jobs: 6,  bars: [['M', 40], ['T', 70], ['W', 55], ['T', 85], ['F', 60], ['S', 95]] },
  month: { label: 'This Month', total: 12480, jobs: 24, bars: [['W1', 52], ['W2', 88], ['W3', 66], ['W4', 76]] },
  year:  { label: 'This Year',  total: 148600, jobs: 286, bars: [['Q1', 48], ['Q2', 72], ['Q3', 90], ['Q4', 64]] },
};
let earnPeriod = 'month';
let txnsExpanded = false;
function setEarnPeriod(p) {
  earnPeriod = p; const d = EARN_DATA[p] || EARN_DATA.month;
  if ($('earnTotal')) $('earnTotal').textContent = inr(d.total);
  if ($('earnJobs')) $('earnJobs').textContent = d.jobs;
  const btn = $('earnPeriodBtn'); if (btn) btn.innerHTML = d.label + ' ▾';
  document.querySelectorAll('[data-earnseg]').forEach((s) => s.classList.toggle('on', s.getAttribute('data-earnseg') === p));
  const bars = $('earnBars');
  if (bars) bars.innerHTML = d.bars.map(([l, h]) => `<div class="barcol"><div class="bv"></div><div class="bar" style="height:${h}%"></div><div class="bl">${l}</div></div>`).join('');
}
function renderEarnings() {
  setEarnPeriod(earnPeriod);
  renderTxns();
}
function renderTxns() {
  const el = $('txnList'); if (!el) return;
  const rows = txnsExpanded ? DEMO_TXN.concat(DEMO_TXN) : DEMO_TXN; // demo: "View All" shows more
  el.innerHTML = rows.map((x, i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 0;${i < rows.length - 1 ? 'border-bottom:1px solid var(--cardBorder)' : ''}">
      <div class="scirc ${catCls(x.cat)}" style="width:40px;height:40px;font-size:17px">${catIcon(x.cat)}</div>
      <div style="flex:1"><div style="font-weight:600;font-size:14px">${esc(x.t)}</div><div class="ter">${esc(x.d || txnDate(x.daysAgo))}</div></div>
      <div style="text-align:right"><div class="green-t">+ ${inr(x.amt)}</div><div class="ter">Completed</div></div>
    </div>`).join('');
}
function stars(n) { return '★★★★★☆☆☆☆☆'.slice(5 - n, 10 - n); }
function reviewCard(r) {
  const reply = r.provider_reply
    ? `<div class="panel grey" style="margin-top:8px;padding:10px 12px"><div class="ter" style="font-weight:700;color:var(--primary)">Your reply</div><div class="sec" style="font-size:13px;margin-top:2px">${esc(r.provider_reply)}</div></div>`
    : `<div style="margin-top:8px"><span class="link" data-reply="${esc(r.name)}">Reply</span></div>`;
  return `<div class="card" style="margin-bottom:12px"><div style="display:flex;gap:10px;align-items:center">
    <div class="avatar" style="width:38px;height:38px">${esc((r.name || '?')[0])}</div>
    <div style="flex:1"><div class="h3" style="font-size:15px">${esc(r.name)}</div><div style="color:var(--star);font-size:13px">${stars(r.rating)}</div></div>
    <span class="ter">${esc(r.ago || '')}</span></div>
    <div class="sec" style="margin-top:8px;font-size:13.5px">${esc(r.body)}</div>
    ${(r.tags || []).length ? `<div style="margin-top:6px">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    ${reply}</div>`;
}
async function renderReviews() {
  const list = $('reviewsList'); if (!list) return;
  let rows = DEMO_REVIEWS;
  let real = false;
  if (hasSupabase && myProvider) {
    try {
      const live = await api.getMyReviews();
      if (live && live.length) {
        rows = live.map((r) => ({ name: r.reviewer_name || 'Customer', rating: r.rating, body: r.body,
          ago: r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '',
          provider_reply: r.provider_reply, tags: [] }));
        real = true;
      }
    } catch (e) {}
  }
  if (real) paintReviewSummary(rows);   // real → recompute the summary; demo keeps its static numbers
  list.innerHTML = rows.map(reviewCard).join('');
}

// Rebuild the average / count / bars / chips from real review rows.
function paintReviewSummary(rows) {
  const n = rows.length;
  const avg = n ? rows.reduce((s, r) => s + (r.rating || 0), 0) / n : 0;
  const c = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  rows.forEach((r) => { const k = Math.max(1, Math.min(5, Math.round(r.rating || 0))); c[k]++; });
  setTxt('rvAvg', avg ? avg.toFixed(1) : '0.0');
  setTxt('rvCount', `${n} review${n === 1 ? '' : 's'}`);
  const bars = $('rvBars');
  if (bars) bars.innerHTML = [5, 4, 3, 2, 1].map((k) =>
    `<div class="rbar"><span>${k}★</span><div class="rtrack"><div class="rfill" style="width:${n ? Math.round(c[k] / n * 100) : 0}%"></div></div><span>${c[k]}</span></div>`).join('');
  const chips = $('rvChips');
  if (chips) chips.innerHTML = `<div class="chip on">All (${n})</div>` + [5, 4, 3].map((k) => `<div class="chip">${k}★ (${c[k]})</div>`).join('');
}
const NOTIF_ICON = { lead: { cls: 'c-clean', icon: '📅' }, booking: { cls: 'c-plumb', icon: '🧭' }, payment: { cls: 'c-elec', icon: '💳' }, review: { cls: 'c-paint', icon: '★' }, system: { cls: 'c-more', icon: '🔔' } };
let notifRows = [];
async function renderNotif() {
  const list = $('notifList'); if (!list) return;
  if (!(hasSupabase && session)) { list.innerHTML = `<div class="empty">Sign in to see your notifications.</div>`; return; }
  list.innerHTML = `<div class="empty">Loading…</div>`;
  try { notifRows = await api.getNotifications(); } catch (e) { notifRows = []; }
  if (!notifRows.length) { list.innerHTML = `<div class="empty">No notifications yet.<br>Job, payment and review updates will show here.</div>`; return; }
  list.innerHTML = notifRows.map((n, i) => {
    const ic = NOTIF_ICON[n.type] || NOTIF_ICON.system;
    const ago = n.created_at ? new Date(n.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const unread = !(n.is_read ?? n.read ?? false);
    return `<div class="card" style="display:flex;gap:12px;margin-bottom:10px;cursor:pointer" data-notif="${i}">
      <div class="scirc ${ic.cls}" style="width:42px;height:42px;font-size:18px">${ic.icon}</div>
      <div style="flex:1"><div style="display:flex;justify-content:space-between"><div class="h3" style="font-size:14.5px">${esc(n.title || 'Notification')}</div><span class="ter">${esc(ago)}</span></div>
        <div class="sec" style="font-size:12.5px;margin-top:2px">${esc(n.body || '')}</div></div>
      ${unread ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--primary);flex-shrink:0;margin-top:6px"></span>' : ''}
    </div>`;
  }).join('');
  // Opening the screen clears the unread bell badge.
  try { await api.markNotificationsRead(); const nb = $('notifBadge'); if (nb) nb.style.display = 'none'; } catch (e) {}
}
// Tapping a notification opens the thing it is about (job / payment / review),
// so the provider sees the full work behind it.
async function openNotification(i) {
  const n = notifRows[i]; if (!n) return;
  const t = String(n.type || '').toLowerCase();
  if (n.ref_id && (t === 'booking' || t === 'lead' || t === 'payment' || t === 'job')) {
    try { const b = await api.getBooking(n.ref_id); if (b) { currentJob = normalizeJob(b); show('jobdetail'); return; } } catch (e) {}
  }
  if (t === 'review') { show('reviews'); return; }
  if (t === 'payment') { show('earnings'); return; }
  if (t === 'booking' || t === 'lead' || t === 'job') { pendingJobTab = 'new'; show('jobs'); return; }
  showNotifDetail(n);   // system / other → show the full text
}
function showNotifDetail(n) {
  const ov = $('reqPopup'); if (!ov) { toast(n.body || n.title || ''); return; }
  reqPopData = null;
  if ($('reqPopTitle')) $('reqPopTitle').textContent = n.title || 'Notification';
  if ($('reqPopSub')) $('reqPopSub').textContent = n.created_at ? new Date(n.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  if ($('reqPopDesc')) $('reqPopDesc').textContent = n.body || '';
  const fill = $('reqPopFill'); if (fill) fill.style.width = '100%';
  const acc = $('reqPopAccept'); if (acc) acc.style.display = 'none';
  const rej = $('reqPopReject'); if (rej) rej.textContent = 'Close';
  ov.style.display = 'flex';
  clearTimeout(reqPopTimer);
}
/* ---------- schedule (clickable week + month calendar) ---------- */
let schedSel = new Date();          // selected date
let calMonth = new Date();          // month shown in the calendar
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
let schedRows = null;   // real bookings for the schedule (null = not loaded yet)
function renderSchedule() {
  schedRows = null;   // refetch fresh each time the Schedule screen opens
  renderWeekStrip();
  const cal = $('schedCal'); if (cal) cal.style.display = 'none';   // calendar closed on enter
  renderSchedList();
}
function renderWeekStrip() {
  const strip = $('weekStrip'); if (!strip) return;
  const dow = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  // Week (Mon-first) containing the selected date.
  const base = new Date(schedSel);
  const offset = (base.getDay() + 6) % 7;      // 0 = Monday
  const monday = new Date(base); monday.setDate(base.getDate() - offset);
  const today = new Date();
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const on = sameDay(d, schedSel);
    const isToday = sameDay(d, today);
    html += `<div data-schday="${iso(d)}" style="flex:0 0 46px;text-align:center;border:1px solid ${on ? 'var(--primary)' : 'var(--cardBorder)'};border-radius:14px;padding:10px 0;cursor:pointer;${on ? 'background:#EAF1FE' : ''}">
      <div style="font-size:12px;color:${on ? 'var(--primary)' : 'var(--tSecondary)'}">${dow[d.getDay()]}</div>
      <div style="font-size:15px;font-weight:700;margin-top:2px;${on ? 'color:var(--primary)' : isToday ? 'color:var(--success)' : ''}">${d.getDate()}</div>
    </div>`;
  }
  strip.innerHTML = html;
  if ($('schedDay')) $('schedDay').textContent = schedSel.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
function renderCalendar() {
  const cal = $('schedCal'); if (!cal) return;
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7;  // Monday-first
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  const dow = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  let cells = '';
  for (let i = 0; i < startOffset; i++) cells += `<div class="cal-cell muted"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const cls = ['cal-cell'];
    if (sameDay(date, schedSel)) cls.push('on');
    else if (sameDay(date, today)) cls.push('today');
    cells += `<div class="${cls.join(' ')}" data-schday="${iso(date)}">${d}</div>`;
  }
  cal.innerHTML = `<div class="cal">
    <div class="cal-head">
      <div class="cal-nav" data-calnav="-1">‹</div>
      <div style="font-weight:700;font-size:15px">${calMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
      <div class="cal-nav" data-calnav="1">›</div>
    </div>
    <div class="cal-grid">${dow.map((x) => `<div class="cal-dow">${x}</div>`).join('')}${cells}</div>
  </div>`;
}
function toggleCalendar() {
  const cal = $('schedCal'); if (!cal) return;
  const open = cal.style.display === 'none' || !cal.style.display;
  if (open) { calMonth = new Date(schedSel); renderCalendar(); cal.style.display = 'block'; }
  else cal.style.display = 'none';
}
function selectSchedDay(isoStr) {
  const [y, mo, d] = isoStr.split('-').map(Number);
  schedSel = new Date(y, mo - 1, d);
  renderWeekStrip();
  const cal = $('schedCal'); if (cal && cal.style.display === 'block') renderCalendar();
  renderSchedList();
}
async function renderSchedList() {
  const list = $('schedList'); if (!list) return;
  // Real scheduled bookings for the selected day.
  if (hasSupabase && myProvider) {
    if (schedRows === null) { list.innerHTML = `<div class="empty">Loading…</div>`; try { schedRows = await api.getMyBookings(); } catch (e) { schedRows = []; } }
  } else { schedRows = []; }
  const dayIso = iso(schedSel);
  const rows = (schedRows || []).filter((b) => b.scheduled_date === dayIso && jobBucket(b.status) !== 'cancelled');
  schedView = rows;   // remember so "See Job" opens the right booking
  if ($('schedCount')) $('schedCount').textContent = rows.length + (rows.length === 1 ? ' Job Scheduled' : ' Jobs Scheduled');
  if (!rows.length) { list.innerHTML = `<div class="empty">No jobs scheduled for this day.</div>`; return; }
  list.innerHTML = rows.map((b) => {
    const cat = b.category || catKeyFromLabel(b.service);
    const bucket = jobBucket(b.status);
    const pill = bucket === 'new' ? 'orange' : bucket === 'completed' ? 'green' : 'blue';
    const st = String(b.status || 'pending'); const label = bucket === 'new' ? 'New' : st[0].toUpperCase() + st.slice(1);
    return `<div class="card" style="margin-bottom:12px" data-go="jobdetail"><div style="display:flex;gap:10px">
      <div style="text-align:center;flex-shrink:0;min-width:40px"><div style="font-weight:700;font-size:12px">${esc(b.scheduled_time || '—')}</div></div>
      <div style="width:1px;background:var(--cardBorder)"></div>
      <div style="flex:1"><div style="display:flex;justify-content:space-between"><div style="display:flex;gap:8px;align-items:center"><div class="scirc ${catCls(cat)}" style="width:36px;height:36px;font-size:16px">${catIcon(cat)}</div><div class="h3" style="font-size:15px">${esc(b.service || 'Service')}</div></div><span class="pill ${pill}">${esc(label)}</span></div>
        <div class="meta"><span class="mi">👤</span>${esc(b.customer_name || 'Customer')} • ${esc(b.address || '—')}</div>
        ${b.note ? `<div class="sec" style="font-size:12.5px;margin-top:2px">${esc(b.note)}</div>` : ''}
        <div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-blue sm" data-go="jobdetail">See Job ›</button></div></div>
    </div></div>`;
  }).join('');
}
const setTxt = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const amountOf = (b) => Number(b.amount ?? b.price ?? b.total ?? b.total_amount ?? 0) || 0;
let myStats = null;

// Compute real stats (jobs done, rating, happy customers, earnings) from the
// provider's own bookings + reviews. Returns null when not signed in.
async function loadStats() {
  if (!(hasSupabase && myProvider)) return null;
  try {
    const bookings = (lastJobsRows && lastJobsRows.length) ? lastJobsRows : await api.getMyBookings().catch(() => []);
    const reviews = await api.getMyReviews().catch(() => []);
    const done = (bookings || []).filter((b) => String(b.status || '').toLowerCase() === 'completed');
    const earn = done.reduce((s, b) => s + amountOf(b), 0);
    const custs = new Set(done.map((b) => b.customer_id).filter(Boolean));
    const rc = Number(myProvider.rating_count ?? (reviews ? reviews.length : 0)) || 0;
    const ra = Number(myProvider.rating_avg) || (reviews && reviews.length
      ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length : 0);
    myStats = { jobs: done.length, rating: ra, ratingCount: rc, happy: custs.size || done.length, earn, reviews: reviews || [] };
  } catch (e) { myStats = null; }
  return myStats;
}

async function renderProfile() {
  if (myProvider) {
    if ($('profName')) $('profName').textContent = myProvider.name || 'Provider';
    if ($('profTrade')) $('profTrade').textContent = selectedCatLabel || myProvider.custom_category || 'Service Professional';
    if ($('profArea')) $('profArea').textContent = myProvider.service_area || myProvider.city || 'Ahmedabad, Gujarat';
    paintProvAvatar();
    const av = myProvider.available !== false;
    $('availToggle')?.classList.toggle('on', av);
    if ($('statusPill')) { $('statusPill').textContent = av ? '● Online' : '● Offline'; $('statusPill').className = 'pill ' + (av ? 'green' : 'grey'); }
    const s = await loadStats();
    const rt = s && s.rating ? s.rating.toFixed(1) : '0.0';
    setTxt('statJobs', s ? s.jobs : 0); setTxt('statRating', rt); setTxt('statHappy', s ? s.happy : 0);
    setTxt('statEarn', Number(s ? s.earn : 0).toLocaleString('en-IN'));
    setTxt('profRatingVal', rt); setTxt('profReviews', `(${s ? s.ratingCount : 0} review${(s ? s.ratingCount : 0) === 1 ? '' : 's'})`);
  } else {
    // Not signed in → show real zeros, never demo numbers.
    ['statJobs', 'statHappy'].forEach((k) => setTxt(k, 0));
    setTxt('statRating', '0.0'); setTxt('statEarn', '0');
    setTxt('profRatingVal', '0.0'); setTxt('profReviews', '(0 reviews)');
  }
  paintProvAvatar();
  updateBadges();
}

// Notification + leads tab badges from real counts (demo keeps its numbers).
async function updateBadges() {
  if (!(hasSupabase && session)) { updateNewBadge(0); const nb = $('notifBadge'); if (nb) nb.style.display = 'none'; return; }
  try {
    const notifs = await api.getNotifications().catch(() => []);
    const unread = (notifs || []).filter((n) => !(n.is_read ?? n.read ?? false)).length;
    const nb = $('notifBadge');
    if (nb) { if (unread > 0) { nb.textContent = unread > 9 ? '9+' : unread; nb.style.display = ''; } else nb.style.display = 'none'; }
  } catch (e) {}
  try {
    // The "New" badge reflects pending bookings (real new requests).
    const rows = (lastJobsRows && lastJobsRows.length) ? lastJobsRows : await api.getMyBookings().catch(() => []);
    const pending = (rows || []).filter((b) => jobBucket(b.status) === 'new').length;
    updateNewBadge(pending);
  } catch (e) {}
}

/* ---------- skills grid (registration) ---------- */
function renderSkillGrid() {
  const grid = $('skillGrid'); if (!grid) return;
  grid.innerHTML = CATS.map((c) => `
    <div class="stile" data-cat="${c.key}" data-label="${esc(c.label)}">
      <div class="scirc ${c.cls}" style="margin:0 auto;${selectedCatId === c.key ? 'box-shadow:0 0 0 3px var(--primary)' : ''}">${c.icon}</div>
      <div class="lb">${esc(c.label)}</div>
    </div>`).join('');
}

/* ---------- KYC document rows ---------- */
function slotBtn(slot, label, mode) {
  const done = kycUploaded[slot] || kycFiles[slot];
  if (mode === 'verify') return `<span class="pill ${done ? 'green' : 'grey'}" style="margin-left:6px">${esc(label)} ${done ? '✓' : '•'}</span>`;
  return done
    ? `<span class="pill green" style="margin-left:6px">${esc(label)} ✓</span>`
    : `<button class="btn btn-out-green sm" style="margin-left:6px;padding:0 10px" data-upload="${slot}">⬆ ${esc(label)}</button>`;
}
function docRow(d, mode) {
  // Multi-slot document (Aadhaar front + back)
  if (d.slots) {
    const btns = d.slots.map((s, i) => slotBtn(s, d.slotLabels[i], mode)).join('');
    return `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="ftile" style="background:${d.tile};color:${d.color}">${d.icon}</div>
        <div style="flex:1"><div class="h3" style="font-size:15px">${esc(d.title)}</div><div class="sec" style="font-size:13px">${esc(d.sub)}</div></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:2px;margin-top:10px">${btns}</div></div>`;
  }
  const done = kycUploaded[d.kind] || kycFiles[d.kind];
  const right = mode === 'verify'
    ? `<span class="pill ${done ? 'green' : 'grey'}">${done ? 'Verified' : 'Pending'}</span><span class="mc" style="margin-left:6px">›</span>`
    : (done ? '<span class="pill green">✓ Added</span>' : `<button class="btn btn-out-green sm" data-upload="${d.kind}">⬆ Upload</button>`);
  return `<div class="card" style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
    <div class="ftile" style="background:${d.tile};color:${d.color}">${d.icon}</div>
    <div style="flex:1"><div class="h3" style="font-size:15px">${esc(d.title)}</div><div class="sec" style="font-size:13px">${esc(d.sub)}</div></div>
    ${right}</div>`;
}
function renderDocList() { const el = $('docList'); if (el) el.innerHTML = DOCS.map((d) => docRow(d, 'upload')).join(''); }
function renderVerifyList() {
  const el = $('verifyList'); if (!el) return;
  el.innerHTML = DOCS.map((d) => docRow(d, 'verify')).join('') +
    `<div class="panel" style="display:flex;gap:12px;align-items:center;margin-top:2px"><span style="font-size:26px">🛡️</span><div><div style="font-weight:700;font-size:15px">Your Documents are Safe</div><div class="sec" style="font-size:13px">We keep your documents secure and private.</div></div></div>`;
}

/* ---------- job details ---------- */
function renderJobDetail() {
  const el = $('jobDetailBody'); if (!el) return;
  const j = currentJob || { cust: 'Customer', phone: '', service: 'Service', desc: '', addr: 'Ahmedabad', when: '', status: 'pending' };
  const addr = j.addr || 'Ahmedabad';
  const bucket = jobBucket(j.status);
  const pillCls = bucket === 'new' ? 'orange' : bucket === 'completed' ? 'green' : bucket === 'cancelled' ? 'grey' : 'blue';
  const st = String(j.status || 'pending');
  const pillTxt = bucket === 'new' ? 'New Request' : st[0].toUpperCase() + st.slice(1);
  el.innerHTML = `
    <div class="card">
      <div style="display:flex;gap:12px"><div class="scirc ${catCls(j.cat || catKeyFromLabel(j.service))}">${catIcon(j.cat || catKeyFromLabel(j.service))}</div>
        <div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:start"><div class="h2">${esc(j.service)}</div><span class="pill ${pillCls}">${esc(pillTxt)}</span></div>
          ${j.desc ? `<div class="sec" style="margin-top:2px">${esc(j.desc)}</div>` : ''}</div></div>
      <div class="divide" style="margin:12px 0"></div>
      <div class="meta"><span class="mi">👤</span>${esc(j.cust)}</div>
      ${j.phone ? `<div class="meta"><span class="mi">📞</span><a href="${telHref(j.phone)}" style="color:inherit;text-decoration:none">${esc(j.phone)}</a> <span style="color:var(--whatsapp)">💬</span></div>` : ''}
      <div class="meta"><span class="mi">📍</span>${esc(addr)}</div>
      ${j.when ? `<div class="meta"><span class="mi">🕐</span>${esc(j.when)}</div>` : ''}
    </div>
    ${j.desc ? `<div class="h3" style="margin:18px 0 8px">Service Description</div><div class="sec">${esc(j.desc)}</div>` : ''}
    <div class="h3" style="margin:18px 0 8px">Location</div>
    <div id="jobDetailMap"></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-out" data-maps="${esc(addr)}">🧭 Directions</button>
      <button class="btn btn-blue" data-go="progress">Start Job</button>
    </div>`;
  liveMap($('jobDetailMap'), addr);
}

/* ---------- chat ---------- */
function bubble(m) {
  const cls = m.me ? 'out' : '';
  const b = m.me ? 'bout' : 'bin';
  const av = m.me ? '' : `<div class="avatar" style="width:28px;height:28px;font-size:12px">${esc(((chatCustomer?.name || currentJob?.cust || 'Rahul Sharma'))[0])}</div>`;
  const tick = m.me ? ' ✓✓' : '';
  return `<div class="brow ${cls}">${av}<div><div class="bubl ${b}">${esc(m.body)}</div><div class="btime"${m.me ? ' style="text-align:right"' : ''}>${esc(m.time || '')}${tick}</div></div></div>`;
}
async function openChat() {
  const box = $('chatMsgs'); if (!box) return;
  if ($('chatName')) $('chatName').textContent = chatCustomer?.name || 'Rahul Sharma';
  // Hide the job-context card when the chat was opened from the inbox (no job).
  if ($('chatJobCard')) $('chatJobCard').style.display = chatFromInbox ? 'none' : '';
  chatFromInbox = false;
  let msgs = DEMO_CHAT;
  if (hasSupabase && myProvider && chatCustomer?.id) {
    try {
      const rows = await api.getMessages(chatCustomer.id);
      if (rows && rows.length) msgs = rows.map((r) => ({ me: r.sender_role === 'provider', body: r.body, time: new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }));
    } catch (e) {}
  }
  box.innerHTML = msgs.map(bubble).join('');
  const sc = $('chatScroll'); if (sc) sc.scrollTop = sc.scrollHeight;
  // realtime: show the customer's new messages live
  try { chatSub?.unsubscribe?.(); } catch (e) {}
  chatSub = null;
  if (hasSupabase && myProvider && chatCustomer?.id) {
    try {
      chatSub = await api.subscribeMessages(chatCustomer.id, (row) => {
        if (row.sender_role === 'provider') return;   // our own echo
        box.insertAdjacentHTML('beforeend', bubble({ me: false, body: row.body, time: new Date(row.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }));
        const s2 = $('chatScroll'); if (s2) s2.scrollTop = s2.scrollHeight;
      });
    } catch (e) {}
  }
}
let chatSub = null;
async function sendChat() {
  const inp = $('chatInput'); if (!inp) return;
  const text = inp.value.trim(); if (!text) return;
  inp.value = '';
  const box = $('chatMsgs');
  box.insertAdjacentHTML('beforeend', bubble({ me: true, body: text, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }));
  const sc = $('chatScroll'); if (sc) sc.scrollTop = sc.scrollHeight;
  if (hasSupabase && myProvider && chatCustomer?.id) {
    try { await api.sendMessage(chatCustomer.id, text); } catch (e) { toast('Message not sent'); }
  }
}

/* ---------- messages inbox ---------- */
const DEMO_THREADS = [
  { customerId: 'c1', name: 'Rahul Sharma', phone: '+91 98240 11223', last: 'Bhaiya kitne baje aaoge?', lastRole: 'customer', at: new Date(Date.now() - 5 * 60000).toISOString(), count: 2 },
  { customerId: 'c2', name: 'Priya Patel', phone: '+91 99250 78123', last: 'Thank you, kaam accha hua 🙏', lastRole: 'customer', at: new Date(Date.now() - 3 * 3600000).toISOString(), count: 1 },
];
let inboxSub = null, msgUnread = 0;
function timeAgo(iso) { const d = (Date.now() - new Date(iso).getTime()) / 1000; if (d < 60) return 'now'; if (d < 3600) return Math.floor(d / 60) + 'm'; if (d < 86400) return Math.floor(d / 3600) + 'h'; return Math.floor(d / 86400) + 'd'; }
function setMsgBadge(n) { msgUnread = Math.max(0, n); const b = $('msgBadge'); if (!b) return; if (msgUnread > 0) { b.textContent = msgUnread > 9 ? '9+' : String(msgUnread); b.style.display = 'flex'; } else b.style.display = 'none'; }
function markInboxRead() { try { localStorage.setItem('helpzo_inbox_seen', new Date().toISOString()); } catch (e) {} setMsgBadge(0); }
async function refreshInboxBadge() {
  if (!(hasSupabase && myProvider)) return;
  try {
    const t = await api.getMessageThreads();
    let seen = null; try { seen = localStorage.getItem('helpzo_inbox_seen'); } catch (e) {}
    setMsgBadge(t.filter((x) => x.lastRole !== 'provider' && (!seen || x.at > seen)).length);
    if (!inboxSub) { try { inboxSub = await api.subscribeInbox((row) => { if (row.sender_role !== 'provider') setMsgBadge(msgUnread + 1); }); } catch (e) {} }
  } catch (e) {}
}
async function renderMessages() {
  const el = $('msgThreads'); if (!el) return;
  let threads = [];
  if (hasSupabase && myProvider) {
    try { threads = await api.getMessageThreads(); } catch (e) { threads = []; }
  }
  if (!threads.length) {
    el.innerHTML = `<div style="text-align:center;color:var(--tSecondary);padding:48px 16px">
      <div style="font-size:34px">💬</div><div style="font-weight:700;margin-top:8px;color:var(--tPrimary)">No messages yet</div>
      <div style="font-size:12.5px;margin-top:4px">When a customer messages you, their chat shows up here.</div></div>`;
    markInboxRead(); return;
  }
  el.innerHTML = threads.map((t) => {
    const nm = t.name || 'Customer';
    const pre = t.lastRole === 'provider' ? 'You: ' : '';
    return `<div style="display:flex;gap:12px;align-items:center;padding:12px 4px;border-bottom:1px solid var(--cardBorder);cursor:pointer" data-thread="${esc(t.customerId)}" data-name="${esc(nm)}" data-phone="${esc(t.phone || '')}">
      <div class="avatar" style="width:48px;height:48px;flex-shrink:0">${esc((nm[0] || 'C').toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center"><div style="font-weight:700;flex:1;color:var(--tPrimary)">${esc(nm)}</div><span class="ter" style="font-size:11.5px">${timeAgo(t.at)}</span></div>
        <div style="color:var(--tSecondary);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${esc(pre + (t.last || ''))}</div>
      </div></div>`;
  }).join('');
  markInboxRead();
}
function openThread(id, name, phone) { chatCustomer = { id, name, phone }; show('chat'); }

/* ---------- job timer (in-progress screen) ---------- */
function startTimer() {
  stopTimer();
  let s = 28 * 60 + 15;
  const el = $('jobTimer');
  timerHandle = setInterval(() => {
    s++;
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    if (el) el.textContent = `${hh}:${mm}:${ss}`;
  }, 1000);
}
function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }

/* ---------- reusable signature pad (draw with finger, or upload an image) ---------- */
function createSigPad({ pad, img, hint }) {
  let inited = false, drawn = false, uploadedFile = null;
  const C = () => $(pad), I = () => $(img), H = () => $(hint);
  const fit = () => {
    const canvas = C(); if (!canvas) return;
    const r = canvas.getBoundingClientRect(); if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    // Preserve any existing drawing across a resize.
    const prev = (canvas.width && drawn) ? canvas.toDataURL() : null;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0F2547';
    if (prev) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, r.width, r.height); im.src = prev; }
  };
  const pos = (e) => { const r = C().getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  function bind() {
    const canvas = C(); let drawing = false, last = null;
    const start = (e) => { e.preventDefault(); uploadedFile = null; const im = I(); if (im) im.style.display = 'none'; canvas.style.display = 'block'; const h = H(); if (h) h.style.display = 'none'; drawing = true; drawn = true; last = pos(e); };
    const move = (e) => { if (!drawing) return; e.preventDefault(); const ctx = canvas.getContext('2d'); const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; };
    const end = () => { drawing = false; };
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end);
  }
  return {
    mount() { if (!C()) return; fit(); if (!inited) { inited = true; bind(); } },
    clear() { const canvas = C(); if (canvas) { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = 'block'; } const im = I(); if (im) { im.style.display = 'none'; im.removeAttribute('src'); } const h = H(); if (h) h.style.display = 'flex'; drawn = false; uploadedFile = null; toast('Signature cleared'); },
    upload() { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; uploadedFile = f; drawn = false; const im = I(), canvas = C(), h = H(); if (im) { im.src = URL.createObjectURL(f); im.style.display = 'block'; } if (canvas) canvas.style.display = 'none'; if (h) h.style.display = 'none'; toast('Signature added'); }; inp.click(); },
    hasContent() { return drawn || !!uploadedFile; },
    showUrl(url) { const im = I(), canvas = C(), h = H(); if (im) { im.src = url; im.style.display = 'block'; } if (canvas) canvas.style.display = 'none'; if (h) h.style.display = 'none'; drawn = false; uploadedFile = null; },
    // Returns a PNG Blob of the current signature (drawn or uploaded), or null.
    async toBlob() {
      if (uploadedFile) return uploadedFile;
      const canvas = C(); if (!canvas || !drawn) return null;
      return await new Promise((res) => canvas.toBlob(res, 'image/png'));
    },
  };
}
const sigJob = createSigPad({ pad: 'signPad', img: 'signImg', hint: 'signHint' });
const sigCert = createSigPad({ pad: 'certPad', img: 'certSignImg', hint: 'certSignHint' });
function initSignature() { sigJob.mount(); }

/* ---------- verification certificate ---------- */
function isVerified() {
  return !!(myProvider && (myProvider.verified === true || myProvider.kyc_status === 'verified'));
}
// Stable positive number derived from the provider id → unique per provider.
function certSerial(id) {
  const s = String(id || 'helpzo'); let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const pad5 = (n) => String(n % 100000).padStart(5, '0');
// Demo provider so the certificate previews even before a real listing exists.
const DEMO_CERT_PROVIDER = { id: 'HZDEMO001', name: 'Rajesh Patel', custom_category: 'Electrician', service_area: 'Satellite, Ahmedabad', experience_yrs: 8, aadhaar_no: '0000 0000 4821', verified: true, updated_at: Date.now() };
async function renderCertificate() {
  const pending = $('certPending'), cardEl = $('certCard');
  // Real provider → show pending until verified. No provider (demo) → preview.
  const prov = myProvider || DEMO_CERT_PROVIDER;
  const verified = myProvider ? isVerified() : true;
  if (!verified) { if (pending) pending.style.display = 'block'; if (cardEl) cardEl.style.display = 'none'; return; }
  if (pending) pending.style.display = 'none';
  if (cardEl) cardEl.style.display = 'block';
  const name = prov.name || 'Provider';
  const trade = (myProvider && selectedCatLabel) || prov.custom_category || 'Service Professional';
  const area = prov.service_area || prov.city || 'Ahmedabad';
  const exp = (prov.experience_yrs ? prov.experience_yrs + ' years of ' : '') + 'work experience';
  const d = new Date(prov.updated_at || Date.now());
  const serial = certSerial(prov.id);
  if ($('certName')) $('certName').textContent = name;
  if ($('certSignName')) $('certSignName').textContent = name;
  if ($('certTrade')) $('certTrade').textContent = trade;
  if ($('certDesc')) $('certDesc').innerHTML = `<span style="font-weight:700;color:#16264A">${esc(trade)}</span> with ${esc(exp)} in ${esc(area)}. Identity proof, mobile OTP and document verification completed by HelpZo. Recognised as a trusted, verified HelpZo provider.`;
  // Unique, stable per provider
  if ($('certNo')) $('certNo').textContent = `HZ-${d.getFullYear()}-${pad5(serial)}`;
  if ($('certId')) $('certId').textContent = `HZ-PRV-${pad5(serial * 7 + 13)}`;
  if ($('certAadhaar')) {
    const a = String(prov.aadhaar_no || '').replace(/\D/g, '');
    $('certAadhaar').textContent = '••••' + (a ? a.slice(-4) : pad5(serial * 3 + 7).slice(-4));
  }
  if ($('certDate')) $('certDate').textContent = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  sigCert.mount();
  // Load an already-saved signature, if any.
  if (hasSupabase && myProvider.signature_path) {
    try { const url = await api.getKycSignedUrl(myProvider.signature_path); if (url) sigCert.showUrl(url); } catch (e) {}
    if ($('certSaveBtn')) $('certSaveBtn').textContent = '✓ Update Signature';
  }
}
async function saveCertSignature() {
  const blob = await sigCert.toBlob();
  if (!blob) { toast('Please sign or upload first'); return; }
  const btn = $('certSaveBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    if (hasSupabase && myProvider) {
      const file = new File([blob], 'signature.png', { type: 'image/png' });
      const path = await api.uploadKyc(file, 'signature');
      await api.saveMyProvider({ signature_path: path });
      myProvider.signature_path = path;
    }
    toast('Certificate issued');
  } catch (e) { toast(e.message || 'Could not save'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '✓ Update Signature'; } }
}

/* ---------- auth ---------- */
async function doGetOtp() {
  const raw = ($('phone').value || '').replace(/\D/g, '');
  if (raw.length !== 10) { toast('Enter a valid 10-digit number'); return; }
  const btn = $('getOtpBtn'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    if (hasSupabase) { pendingPhone = await api.sendOtp(raw); }
    else { pendingPhone = '+91' + raw; }
    $('otpPhoneLabel').textContent = pendingPhone;
    $('loginPhoneStep').hidden = true;
    $('loginOtpStep').hidden = false;
    document.querySelectorAll('[data-otp]')[0]?.focus();
    startOtpAutofill();
  } catch (e) {
    toast(e.message || 'Could not send OTP');
  } finally { btn.disabled = false; btn.textContent = 'Get OTP'; }
}
async function doVerify() {
  const code = Array.from(document.querySelectorAll('[data-otp]')).map((i) => i.value).join('');
  if (code.length !== 6) { toast('Enter the 6-digit code'); return; }
  const btn = $('verifyOtpBtn'); btn.disabled = true; btn.textContent = 'Verifying…';
  try {
    if (hasSupabase) {
      await api.verifyOtp(pendingPhone, code);
      session = await api.getSession();
      myProvider = await api.getMyProvider().catch(() => null);
    }
    if ($('regPhone')) $('regPhone').value = pendingPhone || '';
    afterLogin();
  } catch (e) {
    toast(e.message || 'Invalid code');
  } finally { btn.disabled = false; btn.textContent = 'Verify & Continue'; }
}
/* ---------- edit profile (Option A: reuse reg2 as "Edit Profile") ---------- */
function openEditProfile() {
  editMode = true;
  prefillReg2();
  show('reg2');
}
function prefillReg2() {
  if (!myProvider) return;
  if ($('regName')) $('regName').value = myProvider.name || '';
  if ($('regEmail')) $('regEmail').value = myProvider.email || '';
  if ($('editName')) $('editName').value = myProvider.name || '';
  if ($('editEmail')) $('editEmail').value = myProvider.email || '';
  if ($('regArea')) $('regArea').value = myProvider.service_area || myProvider.city || '';
  if ($('regExp')) $('regExp').value = myProvider.experience_yrs ?? '';
  if ($('regBio')) { $('regBio').value = myProvider.about || ''; if ($('bioCount')) $('bioCount').textContent = ($('regBio').value || '').length; }
  // category from the saved listing
  if (myProvider.category_id) {
    const c = categories.find((x) => x.id === myProvider.category_id);
    if (c) { selectedCatId = c.key; selectedCatLabel = (c.translations && c.translations.en) || c.key; }
  } else if (myProvider.custom_category) {
    selectedCatId = 'other'; selectedCatLabel = myProvider.custom_category;
  }
  if ($('regCatLabel') && selectedCatLabel) $('regCatLabel').textContent = selectedCatLabel;
}
function applyReg2Mode() {
  const steps = $('reg2Steps'), title = $('reg2Title'), sub = $('reg2Sub'), nextBtn = $('reg2NextBtn');
  const personal = $('reg2Personal'), svcHead = $('reg2SvcHeading');
  if (editMode) {
    if (steps) steps.style.display = 'none';
    if (title) title.textContent = 'Edit Profile';
    if (sub) sub.textContent = 'Update your personal & service details';
    if (nextBtn) nextBtn.textContent = '✓ Save Changes';
    if (personal) personal.style.display = 'block';   // show Personal Information fields
    if (svcHead) svcHead.style.display = 'none';       // hide the duplicate heading
  } else {
    if (steps) steps.style.display = '';
    if (title) title.textContent = 'Register as Provider';
    if (sub) sub.textContent = 'Join HelpZo and get more work';
    if (nextBtn) nextBtn.textContent = 'Next';
    if (personal) personal.style.display = 'none';     // personal (name/email) comes from step 1
    if (svcHead) svcHead.style.display = '';
  }
}
async function saveProfileEdits() {
  const btn = $('reg2NextBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    if (hasSupabase && session) {
      const fields = {
        name: ($('editName')?.value || '').trim() || myProvider?.name || 'Provider',
        email: ($('editEmail')?.value || '').trim() || null,
        service_area: $('regArea').value.trim() || null,
        city: $('regArea').value.trim() || null,
        about: $('regBio').value.trim() || null,
        experience_yrs: Number($('regExp').value) || selectedExp || 0,
      };
      if (selectedCatId && selectedCatId !== 'other') {
        const c = categories.find((x) => x.key === selectedCatId);
        if (c) { fields.category_id = c.id; fields.custom_category = null; } else fields.custom_category = selectedCatLabel;
      } else if (selectedCatId === 'other') { fields.custom_category = selectedCatLabel || 'Other'; }
      if (!myProvider?.lat || !myProvider?.lng) {          // backfill coords so the listing is findable
        const loc = await providerCoords(); fields.lat = loc.lat; fields.lng = loc.lng;
      }
      await api.saveMyProvider(fields);
      myProvider = await api.getMyProvider().catch(() => myProvider);
    } else {
      // Demo / offline: reflect the edits locally so the profile actually updates.
      myProvider = Object.assign({}, myProvider, {
        name: ($('editName')?.value || '').trim() || myProvider?.name || 'Provider',
        email: ($('editEmail')?.value || '').trim() || myProvider?.email || null,
        service_area: $('regArea').value.trim() || myProvider?.service_area || null,
        about: $('regBio').value.trim() || myProvider?.about || null,
        experience_yrs: Number($('regExp').value) || myProvider?.experience_yrs || 0,
      });
    }
    editMode = false;
    toast('Profile updated');
    show('profile');
  } catch (e) { toast(e.message || 'Could not save'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '✓ Save Changes'; } }
}

function afterLogin() {
  stack = ['splash'];
  editMode = false;
  if (myProvider) { show('jobs'); }
  else { show('reg1'); }
}

/* ---------- registration submit ---------- */
async function submitRegistration() {
  const btn = $('submitRegBtn'); btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    if (hasSupabase && session) {
      const regPhone = ($('regPhone')?.value || '').trim() || (session?.user?.phone ? '+' + session.user.phone : (pendingPhone || ''));
      const fields = {
        name: $('regName').value.trim() || 'Provider',
        phone: regPhone,                                  // providers.phone is NOT NULL
        email: $('regEmail').value.trim() || null,
        service_area: $('regArea').value.trim() || null,
        city: $('regArea').value.trim() || null,
        about: $('regBio').value.trim() || null,          // column is "about", not "bio"
        experience_yrs: Number($('regExp').value) || selectedExp || 0,  // column is "experience_yrs"
      };
      const loc = await providerCoords();                 // so the listing is findable nearby
      fields.lat = loc.lat; fields.lng = loc.lng;
      if (selectedCatId && selectedCatId !== 'other') {
        const c = categories.find((x) => x.key === selectedCatId);
        if (c) fields.category_id = c.id; else fields.custom_category = selectedCatLabel;
      } else if (selectedCatId === 'other') {
        fields.custom_category = selectedCatLabel || 'Other';
      }
      await api.saveMyProvider(fields);
      myProvider = await api.getMyProvider().catch(() => null);
      // upload any selected KYC files and save their storage paths onto the
      // provider row so the admin panel can see the documents.
      const pathFields = {};
      for (const slot of Object.keys(kycFiles)) {
        try {
          const p = await api.uploadKyc(kycFiles[slot], slot);
          kycUploaded[slot] = p;
          if (KYC_COL[slot]) pathFields[KYC_COL[slot]] = p;
        } catch (e) {}
      }
      if (Object.keys(pathFields).length) { try { await api.saveMyProvider(pathFields); } catch (e) {} }
    }
    show('reg4');
  } catch (e) {
    toast(e.message || 'Could not submit');
  } finally { btn.disabled = false; btn.textContent = 'Submit for Verification'; }
}

/* ---------- availability toggle ---------- */
async function toggleAvail() {
  const t = $('availToggle'); const on = !t.classList.contains('on');
  // A provider can only go live once verified (certificate issued).
  if (on && hasSupabase && !isVerified()) {
    toast('Get verified first — your certificate must be issued to go live');
    show('certificate');
    return;
  }
  t.classList.toggle('on', on);
  if ($('statusPill')) { $('statusPill').textContent = on ? '● Online' : '● Offline'; $('statusPill').className = 'pill ' + (on ? 'green' : 'grey'); }
  if (hasSupabase && myProvider) { try { await api.setAvailable(on); } catch (e) {} }
  toast(on ? "You're Online — receiving leads" : "You're Offline");
}

/* ---------- global click handling (event delegation) ---------- */
/* ---------- legal / info pages ---------- */
function openDoc(key) {
  const d = INFO_PAGES[key]; if (!d) return;
  if ($('docTitle')) $('docTitle').textContent = d.title;
  if ($('docBody')) $('docBody').innerHTML = d.body;
  show('doc');
}
const DOC_UPDATED = 'Last updated: 9 October 2026';
const DH = (t) => `<h3 style="margin:18px 0 7px;font-size:15px;color:var(--tPrimary)">${t}</h3>`;
const DP = (t) => `<p style="margin:0 0 10px;font-size:13.5px;line-height:1.75;color:var(--tSecondary)">${t}</p>`;
const DUL = (arr) => `<ul style="margin:0 0 10px;padding-left:18px;font-size:13.5px;line-height:1.75;color:var(--tSecondary)">${arr.map((i) => `<li style="margin-bottom:4px">${i}</li>`).join('')}</ul>`;
const DMETA = (t) => `<p style="margin:0 0 14px;font-size:12px;color:var(--tTertiary)">${t}</p>`;
const INFO_PAGES = {
  terms: { title: 'Partner Terms & Conditions', body:
    DMETA(DOC_UPDATED) +
    DP('These Terms govern your use of the HelpZo Partner app as an independent service professional ("Partner"). By using the app you agree to them.') +
    DH('1. Independent Partner') +
    DP('You are an independent professional, not an employee of HelpZo. You decide which jobs to accept and how to perform your work, in line with these Terms and the law.') +
    DH('2. Onboarding & verification') +
    DUL(['You must complete KYC (Aadhaar, PAN, selfie, bank details) before taking jobs.', 'Information you provide must be true and current.', 'Only a verified account can receive the “Verified” badge and leads.']) +
    DH('3. Jobs & bills') +
    DUL(['Set fair prices using your price-list and the HelpZo rate card (capped per item).', 'Add parts/labour as line-items and send the bill for the customer to approve before payment.', 'Do not overcharge or add charges the customer did not agree to.']) +
    DH('4. Conduct') +
    DUL(['Arrive on time, be professional and courteous.', 'Carry valid ID; respect the customer’s home and privacy.', 'No harassment, no work outside your verified skills.']) +
    DH('5. Ratings & removal') +
    DP('Customers rate every job. Consistently low ratings, fraud, or safety violations can lead to suspension or removal from HelpZo.') +
    DH('6. Payouts') +
    DP('Approved earnings are paid to your registered bank account per the Earnings & Payouts policy.') +
    DH('7. Governing law') +
    DP('These Terms are governed by the laws of India, with jurisdiction in Ahmedabad, Gujarat. Questions: <b>partners@helpzo.app</b>.') },

  privacy: { title: 'Privacy Policy', body:
    DMETA(DOC_UPDATED) +
    DP('This policy explains what HelpZo collects from Partners and why.') +
    DH('What we collect') +
    DUL(['<b>Identity & KYC:</b> name, mobile, Aadhaar, PAN, selfie, bank details.', '<b>Work:</b> service category, area, experience, jobs and earnings.', '<b>Location:</b> to match you with nearby jobs and show customers your ETA.']) +
    DH('How we use it') +
    DUL(['To verify you and keep the platform trustworthy.', 'To send you relevant leads and job updates.', 'To process payouts and prevent fraud.']) +
    DH('Protection') +
    DP('KYC documents are stored in a private, secure bucket, visible only to you and authorised HelpZo staff. We never sell your data.') +
    DH('Your rights') +
    DP('You can view/update your profile, or request account deletion by emailing <b>privacy@helpzo.app</b>.') },

  payouts: { title: 'Earnings & Payouts', body:
    DMETA(DOC_UPDATED) +
    DH('How you earn') +
    DUL(['You earn the approved bill amount for each completed job.', 'Prices follow your price-list and the HelpZo rate card (max caps protect customers).']) +
    DH('Payouts') +
    DUL(['Earnings are credited to your available balance after the customer approves and pays.', 'Withdraw to your registered bank account from the Earnings screen.', 'Payouts are typically processed within 24–48 hours of a withdrawal request.']) +
    DH('Fees') +
    DP('HelpZo may deduct a small platform fee per job; the exact amount is shown transparently in your earnings breakdown.') +
    DH('Disputes') +
    DP('If a customer disputes a bill, the payout for that job is held until our team resolves it fairly based on job details and photos.') +
    DH('Help') +
    DP('Payout questions? Email <b>payments@helpzo.app</b>.') },

  verification: { title: 'Verification & Badge', body:
    DMETA(DOC_UPDATED) +
    DP('The green <b>✔ Verified</b> badge builds customer trust and gets you more jobs. Here is how to earn it.') +
    DH('Documents required') +
    DUL(['<b>Aadhaar</b> — front and back.', '<b>PAN card.</b>', '<b>Live selfie</b> — matched to your ID.', '<b>Bank details</b> — for payouts.']) +
    DH('Review') +
    DP('Our team reviews your documents, usually within 24–48 hours. You’ll get a notification once you’re verified, and a verification certificate appears in your profile.') +
    DH('Keep it active') +
    DP('Keep your documents valid and your profile accurate. Expired or mismatched documents may pause your verified status.') +
    DH('Help') +
    DP('Verification questions? Email <b>partners@helpzo.app</b>.') },

  conduct: { title: 'Code of Conduct & Safety', body:
    DMETA(DOC_UPDATED) +
    DH('Our promise to customers') +
    DUL(['Be punctual, polite and professional on every job.', 'Quote fairly and never add hidden charges.', 'Only take jobs within your verified skills.']) +
    DH('Safety') +
    DUL(['Carry valid ID and wear appropriate safety gear.', 'Follow safe practices for electrical, plumbing and other work.', 'Respect the customer’s home, family and privacy.']) +
    DH('Zero tolerance') +
    DP('Harassment, fraud, misrepresentation or unsafe behaviour leads to immediate removal from HelpZo and may be reported to authorities.') +
    DH('Report an issue') +
    DP('Facing a problem on a job? Contact <b>safety@helpzo.app</b> right away.') },

  about: { title: 'About HelpZo Partner', body:
    DMETA('HelpZo Partner · Version 1.0') +
    DP('<b>HelpZo — Your Problem · Our Priority.</b>') +
    DP('HelpZo Partner is the app for service professionals to get more work in their area — receive leads, manage jobs, bill customers and get paid, all in one place.') +
    DH('Why partner with HelpZo') +
    DUL(['<b>More work</b> — verified leads from nearby customers.', '<b>Fair pricing</b> — your rates, protected by rate-card caps.', '<b>Fast payouts</b> — withdraw earnings to your bank.', '<b>Trust</b> — a Verified badge that wins more bookings.']) +
    DH('Reach us') +
    DP('Ahmedabad, Gujarat, India<br>Email: <b>partners@helpzo.app</b>') },

  contact: { title: 'Partner Support', body:
    DMETA('We’re here to help, 7 days a week') +
    DH('Partner support') + DP('Email: <b>partners@helpzo.app</b>') +
    DH('Payout queries') + DP('Email: <b>payments@helpzo.app</b>') +
    DH('Safety concerns') + DP('Email: <b>safety@helpzo.app</b>') +
    DH('Office') + DP('HelpZo, Ahmedabad, Gujarat, India') }
};

document.addEventListener('click', (e) => {
  // Action buttons must win over a surrounding card's data-go navigation,
  // otherwise tapping Accept/Reject on a lead card just opens the card.
  const accTop = e.target.closest('[data-accept]');
  if (accTop) { acceptLead(accTop.getAttribute('data-accept'), accTop.closest('.card')); return; }
  const rejTop = e.target.closest('[data-reject]');
  if (rejTop) { rejectLead(rejTop.getAttribute('data-reject'), rejTop.closest('.card')); return; }
  // New job/booking: Accept/Reject must win over the card's tap-to-open.
  const aj = e.target.closest('[data-acceptjob]');
  if (aj) { const c = aj.closest('.card'); if (c) c.style.opacity = '.55'; toast('Job accepted — added to your jobs'); return; }
  const rj = e.target.closest('[data-rejectjob]');
  if (rj) { removeJobCard(rj.closest('.card')); toast('Job rejected'); return; }
  const ab = e.target.closest('[data-acceptbook]');
  if (ab) { acceptBooking(ab.getAttribute('data-acceptbook'), ab.closest('.card')); return; }
  const rb = e.target.closest('[data-rejectbook]');
  if (rb) { rejectBooking(rb.getAttribute('data-rejectbook'), rb.closest('.card')); return; }
  const nt = e.target.closest('[data-notif]');
  if (nt) { openNotification(Number(nt.getAttribute('data-notif'))); return; }
  const go = e.target.closest('[data-go]');
  if (go) {
    // Opening a job/lead into the flow → remember which job it is.
    const dest = go.getAttribute('data-go');
    if (['enroute', 'jobdetail', 'progress', 'completed'].includes(dest)) {
      const jcard = e.target.closest('#jobsList .card');
      const lcard = e.target.closest('#leadsList .card');
      const scard = e.target.closest('#schedList .card');
      if (jcard) { const i = [...jcard.parentElement.querySelectorAll('.card')].indexOf(jcard); if (jobsView[i]) currentJob = normalizeJob(jobsView[i]); }
      else if (lcard) { const i = [...lcard.parentElement.querySelectorAll('.card')].indexOf(lcard); if (leadsView[i]) currentJob = normalizeJob(leadsView[i]); }
      else if (scard) { const i = [...scard.parentElement.querySelectorAll('.card')].indexOf(scard); if (schedView[i]) currentJob = normalizeJob(schedView[i]); }
    }
    e.stopPropagation(); show(dest); return;
  }
  const bk = e.target.closest('[data-back]');
  if (bk) { back(); return; }
  const lng = e.target.closest('[data-lang]');
  if (lng) { setLang(lng.getAttribute('data-lang')); return; }
  const doc = e.target.closest('[data-doc]');
  if (doc) { openDoc(doc.getAttribute('data-doc')); return; }
  const tab = e.target.closest('[data-tab]');
  if (tab) { stack = [tab.getAttribute('data-tab')]; show(tab.getAttribute('data-tab'), false); return; }

  const stile = e.target.closest('[data-cat]');
  if (stile) {
    selectedCatId = stile.getAttribute('data-cat');
    selectedCatLabel = stile.getAttribute('data-label');
    renderSkillGrid();
    return;
  }
  const exp = e.target.closest('[data-exp]');
  if (exp) {
    document.querySelectorAll('#expPills [data-exp]').forEach((c) => c.classList.remove('on'));
    exp.classList.add('on'); selectedExp = Number(exp.getAttribute('data-exp'));
    return;
  }
  const up = e.target.closest('[data-upload]');
  if (up) { pickKyc(up.getAttribute('data-upload')); return; }
  const chk = e.target.closest('[data-check]');
  if (chk) { chk.querySelector('.cbox').classList.toggle('on'); const b = chk.querySelector('.cbox'); b.innerHTML = b.classList.contains('on') ? '✓' : ''; return; }
  const quick = e.target.closest('[data-quick]');
  if (quick) { $('chatInput').value = quick.getAttribute('data-quick'); sendChat(); return; }
  const rep = e.target.closest('[data-reply]');
  if (rep) { replyReview(rep.getAttribute('data-reply')); return; }
  const mapsBtn = e.target.closest('[data-maps]');
  if (mapsBtn) { openMaps(mapsBtn.getAttribute('data-maps')); return; }
  const bn = e.target.closest('[data-book-next]');
  if (bn) { advanceBooking(bn.getAttribute('data-book-next'), bn.getAttribute('data-book-status')); return; }
  const callEl = e.target.closest('[data-call]');
  if (callEl) { window.location.href = telHref(callEl.getAttribute('data-call')); return; }
  const photoEl = e.target.closest('[data-photo]');
  if (photoEl) { pickPhoto(); return; }
  const clr = e.target.closest('[data-clearsign]');
  if (clr) { sigJob.clear(); return; }
  const supl = e.target.closest('[data-signupload]');
  if (supl) { sigJob.upload(); return; }
  const ccl = e.target.closest('[data-certclear]');
  if (ccl) { sigCert.clear(); return; }
  const cup = e.target.closest('[data-certupload]');
  if (cup) { sigCert.upload(); return; }
  // Jobs status tabs
  const jt = e.target.closest('[data-jobtab]');
  if (jt) { document.querySelectorAll('[data-jobtab]').forEach((c) => c.classList.remove('on')); jt.classList.add('on'); jobTab = jt.getAttribute('data-jobtab'); paintJobs(); return; }
  // Leads status tabs
  const lt = e.target.closest('[data-ltab]');
  if (lt) { document.querySelectorAll('[data-ltab]').forEach((c) => c.classList.remove('on')); lt.classList.add('on'); leadTab = lt.getAttribute('data-ltab'); paintLeads(); return; }
  // Earnings period segment
  const es = e.target.closest('[data-earnseg]');
  if (es) { setEarnPeriod(es.getAttribute('data-earnseg')); return; }
  // Calendar month navigation
  const cn = e.target.closest('[data-calnav]');
  if (cn) { calMonth.setMonth(calMonth.getMonth() + Number(cn.getAttribute('data-calnav'))); renderCalendar(); return; }
  // Schedule day / calendar date pick
  const sd = e.target.closest('[data-schday]');
  if (sd) { selectSchedDay(sd.getAttribute('data-schday')); return; }
  // Edit profile (from profile page → reg2 in edit mode)
  if (e.target.closest('#themeRow') || e.target.closest('#themeToggle')) { toggleTheme(); return; }
  if (e.target.closest('#statJobsTile')) { pendingJobTab = 'completed'; show('jobs'); return; }
  if (e.target.closest('#statHappyTile')) { const n = $('statHappy')?.textContent || '0'; toast(`You've served ${n} happy customers so far 🎉`); return; }
  if (e.target.closest('#statEarnTile')) { earnPeriod = 'today'; show('earnings'); return; }
  const thr = e.target.closest('[data-thread]'); if (thr) { chatFromInbox = true; openThread(thr.getAttribute('data-thread'), thr.getAttribute('data-name'), thr.getAttribute('data-phone')); return; }
  if (e.target.closest('#profAvatar')) { $('profPhoto')?.click(); return; }
  const ep = e.target.closest('[data-editprofile]');
  if (ep) { openEditProfile(); return; }
  const bdel = e.target.closest('[data-billdel]');
  if (bdel) { removeBillItem(Number(bdel.getAttribute('data-billdel'))); return; }
  const tst = e.target.closest('[data-toast]');
  if (tst) { toast(tst.getAttribute('data-toast')); return; }
});

/* ---------- work photo picker (job in progress) ---------- */
function pickPhoto() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
  inp.onchange = () => { if (inp.files && inp.files[0]) toast('Photo added'); };
  inp.click();
}

/* ---------- lead + booking actions ---------- */
function refreshLeadViews() {
  if ($('leadsList')) renderLeads();        // legacy leads screen, if present
  renderJobs();                             // keep the Jobs list in sync
}
async function acceptLead(id, cardEl) {
  if (hasSupabase && id) { try { await api.markLeadContacted(id); toast('Request accepted'); refreshLeadViews(); return; } catch (e) { toast(e.message || 'Failed'); return; } }
  removeLeadCard(cardEl); toast('Request accepted — added to your jobs');
}
async function rejectLead(id, cardEl) {
  if (hasSupabase && id) { try { await api.setLeadStatus(id, 'cancelled'); toast('Request declined'); refreshLeadViews(); return; } catch (e) { toast(e.message || 'Failed'); return; } }
  removeLeadCard(cardEl); toast('Request declined');
}

/* ---------- incoming new-request popup (shows for a few seconds on the Jobs page) ---------- */
let reqPopData = null, reqPopTimer = null, demoPopShown = false;
function showRequestPopup(req) {
  const ov = $('reqPopup'); if (!ov || !req) return;
  reqPopData = req;
  const acc = $('reqPopAccept'); if (acc) acc.style.display = '';
  const rej = $('reqPopReject'); if (rej) rej.textContent = '✕ Cancel';
  const title = req.service || req.title || 'New service request';
  const sub = req.customer_name || req.name || '';
  const when = `${req.scheduled_date || ''} ${req.scheduled_time || ''}`.trim();
  const desc = [req.address || req.area, when].filter((x) => x && x.trim()).join(' • ') || req.note || 'A customer wants to book you. Accept to add it to your jobs.';
  if ($('reqPopTitle')) $('reqPopTitle').textContent = title;
  if ($('reqPopSub')) $('reqPopSub').textContent = sub;
  if ($('reqPopDesc')) $('reqPopDesc').textContent = desc;
  ov.style.display = 'flex';
  const fill = $('reqPopFill');
  if (fill) { fill.style.transition = 'none'; fill.style.width = '100%';
    requestAnimationFrame(() => { fill.style.transition = 'width 8s linear'; fill.style.width = '0%'; }); }
  clearTimeout(reqPopTimer);
  reqPopTimer = setTimeout(hideRequestPopup, 8000);   // auto-dismiss after a few seconds
}
function hideRequestPopup() { const ov = $('reqPopup'); if (ov) ov.style.display = 'none'; clearTimeout(reqPopTimer); reqPopData = null; }
function popupAccept() {
  const r = reqPopData; hideRequestPopup();
  if (r && r.id) { acceptBooking(r.id, null); }      // acceptBooking opens the Active tab
  if (stack[stack.length - 1] !== 'jobs') { pendingJobTab = 'active'; show('jobs'); }
}
function popupReject() { const r = reqPopData; hideRequestPopup(); if (r && r.id) rejectBooking(r.id, null); }
let bookingsSub = null;
async function watchIncomingRequests() {
  if (!(hasSupabase && myProvider) || bookingsSub) return;
  // Real-time: a new customer booking pops up instantly + refreshes the Jobs list.
  try { bookingsSub = await api.subscribeBookings((row) => { showRequestPopup(row); renderJobs(); updateBadges(); }); } catch (e) {}
}
// Demo feedback: drop the acted-on lead card, show empty state if none left.
function removeLeadCard(cardEl) {
  if (!cardEl) return;
  const list = cardEl.parentElement;
  cardEl.remove();
  if (list && !list.querySelector('.card')) list.innerHTML = `<div class="empty">No new leads right now.</div>`;
}
async function advanceBooking(id, cur) {
  const next = { pending: 'confirmed', confirmed: 'completed', completed: 'completed', cancelled: 'cancelled' }[cur] || 'confirmed';
  if (hasSupabase && id) { try { await api.setBookingStatus(id, next); toast('Marked ' + next); renderJobs(); return; } catch (e) { toast(e.message || 'Failed'); return; } }
  toast('Status updated');
}
function removeJobCard(cardEl) {
  if (!cardEl) return;
  const list = cardEl.parentElement;
  cardEl.remove();
  if (list && list.id === 'jobsList' && !list.querySelector('.card')) list.innerHTML = `<div class="empty">No ${jobTab} jobs.</div>`;
}
async function acceptBooking(id, cardEl) {
  if (hasSupabase && id) {
    try { await api.setBookingStatus(id, 'confirmed'); toast('Request accepted — moved to Active'); pendingJobTab = 'active'; renderJobs(); return; }
    catch (e) { toast(e.message || 'Could not accept'); return; }
  }
  if (cardEl) cardEl.style.opacity = '.55';
  toast('Request accepted');
}
async function rejectBooking(id, cardEl) {
  if (hasSupabase && id) { try { await api.setBookingStatus(id, 'cancelled'); toast('Request declined'); renderJobs(); return; } catch (e) { toast(e.message || 'Could not decline'); return; } }
  removeJobCard(cardEl);
  toast('Request declined');
}

/* ---------- KYC file picking ---------- */
function pickKyc(kind) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    if (inp.files && inp.files[0]) { kycFiles[kind] = inp.files[0]; renderDocList(); toast('Document added'); }
  };
  inp.click();
}

/* ---------- review reply ---------- */
async function replyReview(name) {
  const text = prompt('Reply to ' + name + ':');
  if (!text) return;
  toast('Reply posted');
  renderReviews();
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

/* ---------- boot ---------- */
async function boot() {
  buildTabBars();
  try { const l = localStorage.getItem('helpzo_lang'); if (l && LANGS[l]) curLang = l; } catch (e) {}
  try { applyTheme(localStorage.getItem('helpzo_theme') || 'light'); } catch (e) {}
  wireOtpInputs();
  // datalist: Ahmedabad service areas (dedupe)
  const dl = $('ahmAreas');
  if (dl) dl.innerHTML = [...new Set(AHMEDABAD_AREAS)].sort().map((c) => `<option value="${esc(c)}"></option>`).join('');

  // static button wiring
  $('getOtpBtn')?.addEventListener('click', doGetOtp);
  $('verifyOtpBtn')?.addEventListener('click', doVerify);
  $('resendBtn')?.addEventListener('click', doGetOtp);
  $('changeNumBtn')?.addEventListener('click', () => { $('loginOtpStep').hidden = true; $('loginPhoneStep').hidden = false; });
  $('phone')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doGetOtp(); });
  $('skillsDoneBtn')?.addEventListener('click', () => { if ($('regCatLabel') && selectedCatLabel) $('regCatLabel').textContent = selectedCatLabel; show('reg2'); });
  $('submitRegBtn')?.addEventListener('click', submitRegistration);
  $('reg2Back')?.addEventListener('click', () => { if (editMode) { editMode = false; show('profile'); } else show('reg1'); });
  $('reg2NextBtn')?.addEventListener('click', () => { if (editMode) saveProfileEdits(); else show('reg3'); });
  $('earnPeriodBtn')?.addEventListener('click', () => { const order = ['today', 'week', 'month', 'year']; setEarnPeriod(order[(order.indexOf(earnPeriod) + 1) % order.length]); });
  $('earnViewAll')?.addEventListener('click', () => { txnsExpanded = !txnsExpanded; renderTxns(); $('earnViewAll').textContent = txnsExpanded ? 'Show Less ‹' : 'View All ›'; });
  $('schedCalBtn')?.addEventListener('click', toggleCalendar);
  $('availToggle')?.addEventListener('click', toggleAvail);
  $('profPhoto')?.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      provPhoto = await fileToAvatarDataUrl(f);
      try { localStorage.setItem(PROV_PHOTO_KEY, provPhoto); } catch (er) {}
      paintProvAvatar();
      toast('Photo updated');
    } catch (err) { toast('Could not read image'); }
    e.target.value = '';
  });
  $('billAddBtn')?.addEventListener('click', addBillItem);
  $('billAmt')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBillItem(); });
  $('billLabel')?.addEventListener('input', () => {
    const rc = rateFor($('billLabel').value);
    if (rc && $('billAmt') && !$('billAmt').value) $('billAmt').value = rc.rate;
  });
  $('completeBtn')?.addEventListener('click', completeJob);
  $('certSaveBtn')?.addEventListener('click', saveCertSignature);
  $('logoutRow')?.addEventListener('click', logout);
  $('logoutBtn2')?.addEventListener('click', logout);
  $('chatSend')?.addEventListener('click', sendChat);
  $('chatInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  $('regBio')?.addEventListener('input', () => { if ($('bioCount')) $('bioCount').textContent = $('regBio').value.length; });
  $('reqPopAccept')?.addEventListener('click', popupAccept);
  $('reqPopReject')?.addEventListener('click', popupReject);

  // Restore session + categories before routing, but never hang the splash.
  const ready = (async () => {
    if (!hasSupabase) return;
    try { categories = await api.getCategories(); } catch (e) { categories = []; }
    try { session = await api.getSession(); } catch (e) {}
    if (session) { try { myProvider = await api.getMyProvider(); } catch (e) {} }
    if (myProvider) { refreshInboxBadge(); watchIncomingRequests(); }
  })();

  const route = () => {
    stack = ['splash'];
    if (session && myProvider) show('jobs');
    else if (session) { show('reg1'); if ($('regPhone')) $('regPhone').value = session?.user?.phone ? '+' + session.user.phone : ''; }
    else show('login');
  };
  Promise.race([ready, new Promise((r) => setTimeout(r, 2600))]).then(() => setTimeout(route, 400));
  setTimeout(() => { const s = document.querySelector('.screen.on'); if (!s || s.id === 's-splash') route(); }, 2900);
}

async function logout() {
  try { if (hasSupabase) await api.signOut(); } catch (e) {}
  myProvider = null; session = null; pendingPhone = null;
  $('loginOtpStep').hidden = true; $('loginPhoneStep').hidden = false;
  document.querySelectorAll('[data-otp]').forEach((i) => (i.value = ''));
  if ($('phone')) $('phone').value = '';
  stack = ['splash']; show('login');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
