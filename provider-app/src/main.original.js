
/* ==================== LANGUAGES ==================== */
const LANGS = [
  {code:'en', native:'English',  en:'English'},
  {code:'hi', native:'हिन्दी',    en:'Hindi'},
  {code:'gu', native:'ગુજરાતી',   en:'Gujarati'},
  {code:'mr', native:'मराठी',     en:'Marathi'},
  {code:'te', native:'తెలుగు',    en:'Telugu'},
];

const I18N = {
en:{
  splashTitle:"List your work",
  splashSub:"Whatever your skill — plumber, tailor, driver, cook — let customers find you directly.",
  start:"Get started",
  loginTitle:"Enter your number", loginSub:"We'll send an OTP to verify.",
  mobileNumber:"Mobile number", phonePlaceholder:"10-digit number",
  phoneError:"Enter a valid 10-digit number.", sendOtp:"Send OTP",
  verifyTitle:"Verify", otpSub:"Enter the 4-digit code sent to +91 {phone}",
  verifyNext:"Verify & continue", noCode:"Didn't get the code?", resend:"Resend",
  resendToast:"OTP sent again (demo)", otpIncomplete:"Enter the full 4-digit code",
  notifications:"Notifications", back:"Back",
  greeting:"Hello, {name} \u{1F44B}",
  leadsThisWeek:"Leads this week", ratingLbl:"Rating ({n} reviews)",
  responseRate:"Response rate", earnedThisMonth:"Earned this month",
  recentLeads:"Recent leads", viewAll:"View all", allLeads:"All leads",
  leadDetail:"Lead detail", status:"Status", request:"Request", contact:"Contact",
  customerNumber:"Customer number", markContacted:"Mark as contacted",
  alreadyContacted:"Already contacted", callCustomer:"Call customer",
  badgeNew:"New", badgeContacted:"Contacted", call:"Call",
  contactedToast:"{name} marked as contacted", noLeads:"No leads yet.<br>Keep your listing updated so customers can find you.",
  editListing:"Edit listing",
  listingNote:"No shop registration needed — any individual can list their work. This form is a UI demo; saving does not store data anywhere.",
  yourName:"Your name", yourSkill:"Your skill / trade",
  phoneShownLabel:"Mobile number (shown to customers)", serviceArea:"Service area",
  startingPrice:"Starting price (\u20B9)", aboutYou:"About",
  aboutDefault:"10+ years of experience — tap repair, pipeline fitting, bathroom installation.",
  saveChanges:"Save changes", listingSaved:"Listing updated (demo)", priceError:"Enter a valid starting price",
  reviewsReceived:"Reviews received", earnings:"Earnings", recentJobs:"Recent jobs",
  earnTotalLbl:"Total of {n} jobs",
  profileTitle:"Profile", helpSupport:"Help and support", supportToast:"Support chat — demo",
  settings:"Settings", logout:"Log out",
  pnotif1:"New lead — Priya Shah", pnotif2:"You got a new 5-star review", pnotif3:"{amt} payment received",
  languageRow:"Language", leadAlerts:"New lead alerts", availableForWork:"Available for work",
  payoutDetails:"Payout details", payoutToast:"Payout settings — demo",
  about:"About", aboutToast:"About Helpzo — demo",
  navDashboard:"Dashboard", navLeads:"Leads", navListing:"Listing", navProfile:"Profile",
  footer:"The whole provider app is clickable — onboarding, login/OTP, dashboard, leads, lead detail, listing edit, reviews, earnings, profile, notifications and settings all work. No real signup or payment.",
  langSelect:"Select language", langSet:"Switched to {lang}",
  hoursAgo:"{n}h ago", daysAgo:"{n}d ago", dayAgo:"1d ago",
  cPlumber:"Plumber", cElectrician:"Electrician", cCarpenter:"Carpenter", cAcRepair:"AC repair",
  cPainter:"Painter", cTailor:"Tailor", cDriver:"Driver", cCook:"Cook", cGardener:"Gardener", cOther:"Other",
  l1:"Leaking tap in Satellite — needs a visit today",
  l2:"New bathroom fitting, wants a quote",
  l3:"Pipeline leak in the kitchen",
  l4:"Drain cleaning needed in the bathroom",
  j1:"tap repair", j2:"bathroom fitting", j3:"pipeline fix", j4:"drain cleaning",
  pr1:"Fast response, fixed my leaking tap in 20 mins.",
  pr2:"Fair pricing, will call again.",
  pr3:"Good work, arrived a bit late.",
},
hi:{
  splashTitle:"अपना काम लिस्ट करें",
  splashSub:"कोई भी स्किल हो — प्लंबर, दर्जी, ड्राइवर, रसोइया — ग्राहक सीधे आपको ढूँढ सकें।",
  start:"शुरू करें",
  loginTitle:"अपना नंबर डालें", loginSub:"हम वेरिफाई करने के लिए OTP भेजेंगे।",
  mobileNumber:"मोबाइल नंबर", phonePlaceholder:"10 अंकों का नंबर",
  phoneError:"मान्य 10 अंकों का नंबर डालें।", sendOtp:"OTP भेजें",
  verifyTitle:"वेरिफाई करें", otpSub:"+91 {phone} पर भेजा गया 4 अंकों का कोड डालें",
  verifyNext:"वेरिफाई करें और आगे बढ़ें", noCode:"कोड नहीं मिला?", resend:"दोबारा भेजें",
  resendToast:"OTP दोबारा भेजा गया (डेमो)", otpIncomplete:"पूरा 4 अंकों का कोड डालें",
  notifications:"सूचनाएँ", back:"वापस",
  greeting:"नमस्ते, {name} \u{1F44B}",
  leadsThisWeek:"इस हफ़्ते के लीड", ratingLbl:"रेटिंग ({n} रिव्यू)",
  responseRate:"रिस्पॉन्स रेट", earnedThisMonth:"इस महीने की कमाई",
  recentLeads:"हाल के लीड", viewAll:"सभी देखें", allLeads:"सभी लीड",
  leadDetail:"लीड की जानकारी", status:"स्थिति", request:"अनुरोध", contact:"संपर्क",
  customerNumber:"ग्राहक का नंबर", markContacted:"संपर्क किया मार्क करें",
  alreadyContacted:"संपर्क हो चुका है", callCustomer:"ग्राहक को कॉल करें",
  badgeNew:"नया", badgeContacted:"संपर्क हुआ", call:"कॉल करें",
  contactedToast:"{name} को संपर्क किया मार्क कर दिया", noLeads:"अभी कोई लीड नहीं।<br>अपनी लिस्टिंग अपडेट रखें ताकि ग्राहक आपको ढूँढ सकें।",
  editListing:"लिस्टिंग एडिट करें",
  listingNote:"कोई दुकान रजिस्ट्रेशन नहीं चाहिए — कोई भी व्यक्ति अपना काम लिस्ट कर सकता है। यह फ़ॉर्म सिर्फ़ UI डेमो है, सेव करने पर डेटा कहीं स्टोर नहीं होता।",
  yourName:"आपका नाम", yourSkill:"आपकी स्किल / काम",
  phoneShownLabel:"मोबाइल नंबर (ग्राहक को दिखेगा)", serviceArea:"सर्विस एरिया",
  startingPrice:"शुरुआती दाम (\u20B9)", aboutYou:"आपके बारे में",
  aboutDefault:"10+ साल का अनुभव — नल की मरम्मत, पाइपलाइन फिटिंग, बाथरूम इंस्टॉलेशन।",
  saveChanges:"बदलाव सेव करें", listingSaved:"लिस्टिंग अपडेट हो गई (डेमो)", priceError:"सही शुरुआती दाम डालें",
  reviewsReceived:"मिले हुए रिव्यू", earnings:"कमाई", recentJobs:"हाल के काम",
  earnTotalLbl:"इन {n} कामों का कुल",
  profileTitle:"प्रोफ़ाइल", helpSupport:"मदद और सपोर्ट", supportToast:"सपोर्ट चैट — डेमो",
  settings:"सेटिंग्स", logout:"लॉग आउट",
  pnotif1:"नया लीड — प्रिया शाह", pnotif2:"आपको नया 5-स्टार रिव्यू मिला", pnotif3:"{amt} पेमेंट मिला",
  languageRow:"भाषा", leadAlerts:"नए लीड के अलर्ट", availableForWork:"काम के लिए उपलब्ध",
  payoutDetails:"पेआउट की जानकारी", payoutToast:"पेआउट सेटिंग्स — डेमो",
  about:"ऐप के बारे में", aboutToast:"Helpzo के बारे में — डेमो",
  navDashboard:"डैशबोर्ड", navLeads:"लीड", navListing:"लिस्टिंग", navProfile:"प्रोफ़ाइल",
  footer:"पूरी प्रोवाइडर ऐप क्लिक करने लायक है — ऑनबोर्डिंग, लॉगिन/OTP, डैशबोर्ड, लीड, लीड डिटेल, लिस्टिंग एडिट, रिव्यू, कमाई, प्रोफ़ाइल, सूचनाएँ और सेटिंग्स सब काम करते हैं। कोई असली साइनअप या पेमेंट नहीं है।",
  langSelect:"भाषा चुनें", langSet:"{lang} में बदल गया",
  hoursAgo:"{n} घंटे पहले", daysAgo:"{n} दिन पहले", dayAgo:"1 दिन पहले",
  cPlumber:"प्लंबर", cElectrician:"इलेक्ट्रीशियन", cCarpenter:"बढ़ई", cAcRepair:"AC रिपेयर",
  cPainter:"पेंटर", cTailor:"दर्जी", cDriver:"ड्राइवर", cCook:"रसोइया", cGardener:"माली", cOther:"अन्य",
  l1:"सैटेलाइट में नल टपक रहा है — आज विज़िट चाहिए",
  l2:"नया बाथरूम फिटिंग, कोटेशन चाहिए",
  l3:"रसोई में पाइपलाइन लीक",
  l4:"बाथरूम में नाली की सफ़ाई चाहिए",
  j1:"नल की मरम्मत", j2:"बाथरूम फिटिंग", j3:"पाइपलाइन ठीक करना", j4:"नाली की सफ़ाई",
  pr1:"तेज़ रिस्पॉन्स, 20 मिनट में टपकता नल ठीक कर दिया।",
  pr2:"दाम सही हैं, दोबारा बुलाऊँगा।",
  pr3:"काम अच्छा, थोड़ा देर से आए।",
},
gu:{
  splashTitle:"તમારું કામ લિસ્ટ કરો",
  splashSub:"કોઈપણ સ્કિલ હોય — પ્લમ્બર, દરજી, ડ્રાઇવર, રસોઇયો — ગ્રાહકો સીધા તમને શોધી શકે.",
  start:"શરૂ કરો",
  loginTitle:"તમારો નંબર દાખલ કરો", loginSub:"અમે ચકાસવા માટે OTP મોકલીશું.",
  mobileNumber:"મોબાઇલ નંબર", phonePlaceholder:"10 અંકનો નંબર",
  phoneError:"માન્ય 10 અંકનો નંબર દાખલ કરો.", sendOtp:"OTP મોકલો",
  verifyTitle:"ચકાસો", otpSub:"+91 {phone} પર મોકલેલો 4 અંકનો કોડ દાખલ કરો",
  verifyNext:"ચકાસો અને આગળ વધો", noCode:"કોડ મળ્યો નથી?", resend:"ફરી મોકલો",
  resendToast:"OTP ફરી મોકલ્યો (ડેમો)", otpIncomplete:"પૂરો 4 અંકનો કોડ દાખલ કરો",
  notifications:"સૂચનાઓ", back:"પાછળ",
  greeting:"નમસ્તે, {name} \u{1F44B}",
  leadsThisWeek:"આ અઠવાડિયાના લીડ", ratingLbl:"રેટિંગ ({n} રિવ્યુ)",
  responseRate:"પ્રતિસાદ દર", earnedThisMonth:"આ મહિનાની કમાણી",
  recentLeads:"તાજેતરના લીડ", viewAll:"બધા જુઓ", allLeads:"બધા લીડ",
  leadDetail:"લીડની વિગત", status:"સ્થિતિ", request:"વિનંતી", contact:"સંપર્ક",
  customerNumber:"ગ્રાહકનો નંબર", markContacted:"સંપર્ક કર્યો માર્ક કરો",
  alreadyContacted:"સંપર્ક થઈ ગયો છે", callCustomer:"ગ્રાહકને કૉલ કરો",
  badgeNew:"નવો", badgeContacted:"સંપર્ક થયો", call:"કૉલ કરો",
  contactedToast:"{name} ને સંપર્ક કર્યો માર્ક કર્યું", noLeads:"હજી કોઈ લીડ નથી.<br>તમારી લિસ્ટિંગ અપડેટ રાખો જેથી ગ્રાહકો તમને શોધી શકે.",
  editListing:"લિસ્ટિંગ એડિટ કરો",
  listingNote:"કોઈ દુકાન રજિસ્ટ્રેશન જરૂરી નથી — કોઈપણ વ્યક્તિ પોતાનું કામ લિસ્ટ કરી શકે છે. આ ફોર્મ માત્ર UI ડેમો છે, સેવ કરવાથી ડેટા ક્યાંય સ્ટોર થતો નથી.",
  yourName:"તમારું નામ", yourSkill:"તમારી સ્કિલ / કામ",
  phoneShownLabel:"મોબાઇલ નંબર (ગ્રાહકને દેખાશે)", serviceArea:"સર્વિસ વિસ્તાર",
  startingPrice:"શરૂઆતનો ભાવ (\u20B9)", aboutYou:"તમારા વિશે",
  aboutDefault:"10+ વર્ષનો અનુભવ — નળ રિપેર, પાઇપલાઇન ફિટિંગ, બાથરૂમ ઇન્સ્ટોલેશન.",
  saveChanges:"ફેરફારો સેવ કરો", listingSaved:"લિસ્ટિંગ અપડેટ થઈ (ડેમો)", priceError:"માન્ય શરૂઆતનો ભાવ દાખલ કરો",
  reviewsReceived:"મળેલા રિવ્યુ", earnings:"કમાણી", recentJobs:"તાજેતરના કામ",
  earnTotalLbl:"આ {n} કામોનો કુલ",
  profileTitle:"પ્રોફાઇલ", helpSupport:"મદદ અને સપોર્ટ", supportToast:"સપોર્ટ ચેટ — ડેમો",
  settings:"સેટિંગ્સ", logout:"લૉગ આઉટ",
  pnotif1:"નવો લીડ — પ્રિયા શાહ", pnotif2:"તમને નવો 5-સ્ટાર રિવ્યુ મળ્યો", pnotif3:"{amt} પેમેન્ટ મળ્યું",
  languageRow:"ભાષા", leadAlerts:"નવા લીડના અલર્ટ", availableForWork:"કામ માટે ઉપલબ્ધ",
  payoutDetails:"પેઆઉટ વિગત", payoutToast:"પેઆઉટ સેટિંગ્સ — ડેમો",
  about:"એપ વિશે", aboutToast:"Helpzo વિશે — ડેમો",
  navDashboard:"ડેશબોર્ડ", navLeads:"લીડ", navListing:"લિસ્ટિંગ", navProfile:"પ્રોફાઇલ",
  footer:"આખી પ્રોવાઇડર એપ ક્લિક કરી શકાય એવી છે — ઓનબોર્ડિંગ, લૉગિન/OTP, ડેશબોર્ડ, લીડ, લીડ વિગત, લિસ્ટિંગ એડિટ, રિવ્યુ, કમાણી, પ્રોફાઇલ, સૂચનાઓ અને સેટિંગ્સ બધું કામ કરે છે. કોઈ સાચું સાઇનઅપ કે પેમેન્ટ નથી.",
  langSelect:"ભાષા પસંદ કરો", langSet:"{lang} માં બદલાયું",
  hoursAgo:"{n} કલાક પહેલાં", daysAgo:"{n} દિવસ પહેલાં", dayAgo:"1 દિવસ પહેલાં",
  cPlumber:"પ્લમ્બર", cElectrician:"ઇલેક્ટ્રિશિયન", cCarpenter:"સુથાર", cAcRepair:"AC રિપેર",
  cPainter:"પેઇન્ટર", cTailor:"દરજી", cDriver:"ડ્રાઇવર", cCook:"રસોઇયો", cGardener:"માળી", cOther:"અન્ય",
  l1:"સેટેલાઇટમાં નળ ટપકે છે — આજે વિઝિટ જોઈએ",
  l2:"નવું બાથરૂમ ફિટિંગ, ભાવ જોઈએ",
  l3:"રસોડામાં પાઇપલાઇન લીકેજ",
  l4:"બાથરૂમમાં ગટર સફાઈ જોઈએ",
  j1:"નળ રિપેર", j2:"બાથરૂમ ફિટિંગ", j3:"પાઇપલાઇન રિપેર", j4:"ગટર સફાઈ",
  pr1:"ઝડપી પ્રતિસાદ, 20 મિનિટમાં ટપકતો નળ ઠીક કરી દીધો.",
  pr2:"ભાવ વાજબી, ફરી બોલાવીશ.",
  pr3:"કામ સારું, થોડા મોડા આવ્યા.",
},
mr:{
  splashTitle:"तुमचे काम लिस्ट करा",
  splashSub:"कोणतेही कौशल्य असो — प्लंबर, शिंपी, ड्रायव्हर, स्वयंपाकी — ग्राहक थेट तुम्हाला शोधू शकतील.",
  start:"सुरू करा",
  loginTitle:"तुमचा नंबर टाका", loginSub:"पडताळणीसाठी आम्ही OTP पाठवू.",
  mobileNumber:"मोबाइल नंबर", phonePlaceholder:"10 अंकी नंबर",
  phoneError:"वैध 10 अंकी नंबर टाका.", sendOtp:"OTP पाठवा",
  verifyTitle:"पडताळा", otpSub:"+91 {phone} वर पाठवलेला 4 अंकी कोड टाका",
  verifyNext:"पडताळा आणि पुढे जा", noCode:"कोड मिळाला नाही?", resend:"पुन्हा पाठवा",
  resendToast:"OTP पुन्हा पाठवला (डेमो)", otpIncomplete:"पूर्ण 4 अंकी कोड टाका",
  notifications:"सूचना", back:"मागे",
  greeting:"नमस्कार, {name} \u{1F44B}",
  leadsThisWeek:"या आठवड्यातील लीड", ratingLbl:"रेटिंग ({n} पुनरावलोकने)",
  responseRate:"प्रतिसाद दर", earnedThisMonth:"या महिन्याची कमाई",
  recentLeads:"अलीकडील लीड", viewAll:"सर्व पहा", allLeads:"सर्व लीड",
  leadDetail:"लीड तपशील", status:"स्थिती", request:"विनंती", contact:"संपर्क",
  customerNumber:"ग्राहकाचा नंबर", markContacted:"संपर्क केला म्हणून चिन्हांकित करा",
  alreadyContacted:"संपर्क झाला आहे", callCustomer:"ग्राहकाला कॉल करा",
  badgeNew:"नवीन", badgeContacted:"संपर्क झाला", call:"कॉल करा",
  contactedToast:"{name} ला संपर्क केला म्हणून चिन्हांकित केले", noLeads:"अजून कोणतेही लीड नाहीत.<br>तुमची लिस्टिंग अपडेट ठेवा जेणेकरून ग्राहक तुम्हाला शोधू शकतील.",
  editListing:"लिस्टिंग संपादित करा",
  listingNote:"दुकान नोंदणीची गरज नाही — कोणतीही व्यक्ती स्वतःचे काम लिस्ट करू शकते. हा फॉर्म फक्त UI डेमो आहे, जतन केल्यावर डेटा कुठेही साठवला जात नाही.",
  yourName:"तुमचे नाव", yourSkill:"तुमचे कौशल्य / काम",
  phoneShownLabel:"मोबाइल नंबर (ग्राहकाला दिसेल)", serviceArea:"सेवा परिसर",
  startingPrice:"सुरुवातीचा दर (\u20B9)", aboutYou:"तुमच्याबद्दल",
  aboutDefault:"10+ वर्षांचा अनुभव — नळ दुरुस्ती, पाइपलाइन फिटिंग, बाथरूम बसवणे.",
  saveChanges:"बदल जतन करा", listingSaved:"लिस्टिंग अपडेट झाली (डेमो)", priceError:"वैध सुरुवातीचा दर टाका",
  reviewsReceived:"मिळालेली पुनरावलोकने", earnings:"कमाई", recentJobs:"अलीकडील कामे",
  earnTotalLbl:"या {n} कामांची एकूण",
  profileTitle:"प्रोफाइल", helpSupport:"मदत आणि सपोर्ट", supportToast:"सपोर्ट चॅट — डेमो",
  settings:"सेटिंग्ज", logout:"लॉग आउट",
  pnotif1:"नवीन लीड — प्रिया शाह", pnotif2:"तुम्हाला नवीन 5-स्टार पुनरावलोकन मिळाले", pnotif3:"{amt} पेमेंट मिळाले",
  languageRow:"भाषा", leadAlerts:"नवीन लीड सूचना", availableForWork:"कामासाठी उपलब्ध",
  payoutDetails:"पेआउट तपशील", payoutToast:"पेआउट सेटिंग्ज — डेमो",
  about:"अ‍ॅपबद्दल", aboutToast:"Helpzo बद्दल — डेमो",
  navDashboard:"डॅशबोर्ड", navLeads:"लीड", navListing:"लिस्टिंग", navProfile:"प्रोफाइल",
  footer:"संपूर्ण प्रोव्हायडर अ‍ॅप क्लिक करण्यायोग्य आहे — ऑनबोर्डिंग, लॉगिन/OTP, डॅशबोर्ड, लीड, लीड तपशील, लिस्टिंग संपादन, पुनरावलोकने, कमाई, प्रोफाइल, सूचना आणि सेटिंग्ज सर्व काम करतात. खरी नोंदणी किंवा पेमेंट नाही.",
  langSelect:"भाषा निवडा", langSet:"{lang} मध्ये बदलले",
  hoursAgo:"{n} तासांपूर्वी", daysAgo:"{n} दिवसांपूर्वी", dayAgo:"1 दिवसापूर्वी",
  cPlumber:"प्लंबर", cElectrician:"इलेक्ट्रिशियन", cCarpenter:"सुतार", cAcRepair:"AC दुरुस्ती",
  cPainter:"पेंटर", cTailor:"शिंपी", cDriver:"ड्रायव्हर", cCook:"स्वयंपाकी", cGardener:"माळी", cOther:"इतर",
  l1:"सॅटेलाइटमध्ये नळ गळतोय — आज भेट हवी",
  l2:"नवीन बाथरूम फिटिंग, दर हवा",
  l3:"स्वयंपाकघरात पाइपलाइन गळती",
  l4:"बाथरूममध्ये नाली साफसफाई हवी",
  j1:"नळ दुरुस्ती", j2:"बाथरूम फिटिंग", j3:"पाइपलाइन दुरुस्ती", j4:"नाली साफसफाई",
  pr1:"जलद प्रतिसाद, 20 मिनिटांत गळणारा नळ दुरुस्त केला.",
  pr2:"दर योग्य, पुन्हा बोलावेन.",
  pr3:"काम चांगले, थोडे उशिरा आले.",
},
te:{
  splashTitle:"మీ పనిని జాబితా చేయండి",
  splashSub:"ఏ నైపుణ్యం అయినా — ప్లంబర్, టైలర్, డ్రైవర్, వంటవాడు — కస్టమర్లు నేరుగా మిమ్మల్ని కనుగొనగలరు.",
  start:"ప్రారంభించండి",
  loginTitle:"మీ నంబర్ నమోదు చేయండి", loginSub:"ధృవీకరణ కోసం OTP పంపుతాం.",
  mobileNumber:"మొబైల్ నంబర్", phonePlaceholder:"10 అంకెల నంబర్",
  phoneError:"సరైన 10 అంకెల నంబర్ నమోదు చేయండి.", sendOtp:"OTP పంపండి",
  verifyTitle:"ధృవీకరించండి", otpSub:"+91 {phone} కు పంపిన 4 అంకెల కోడ్‌ను నమోదు చేయండి",
  verifyNext:"ధృవీకరించి కొనసాగండి", noCode:"కోడ్ రాలేదా?", resend:"మళ్లీ పంపండి",
  resendToast:"OTP మళ్లీ పంపబడింది (డెమో)", otpIncomplete:"పూర్తి 4 అంకెల కోడ్ నమోదు చేయండి",
  notifications:"నోటిఫికేషన్లు", back:"వెనుకకు",
  greeting:"నమస్తే, {name} \u{1F44B}",
  leadsThisWeek:"ఈ వారం లీడ్‌లు", ratingLbl:"రేటింగ్ ({n} రివ్యూలు)",
  responseRate:"స్పందన రేటు", earnedThisMonth:"ఈ నెల సంపాదన",
  recentLeads:"ఇటీవలి లీడ్‌లు", viewAll:"అన్నీ చూడండి", allLeads:"అన్ని లీడ్‌లు",
  leadDetail:"లీడ్ వివరాలు", status:"స్థితి", request:"అభ్యర్థన", contact:"సంప్రదింపు",
  customerNumber:"కస్టమర్ నంబర్", markContacted:"సంప్రదించినట్లు గుర్తించండి",
  alreadyContacted:"ఇప్పటికే సంప్రదించారు", callCustomer:"కస్టమర్‌కు కాల్ చేయండి",
  badgeNew:"కొత్తది", badgeContacted:"సంప్రదించారు", call:"కాల్ చేయండి",
  contactedToast:"{name} సంప్రదించినట్లు గుర్తించబడింది", noLeads:"ఇంకా లీడ్‌లు లేవు.<br>కస్టమర్లు మిమ్మల్ని కనుగొనేలా మీ లిస్టింగ్‌ను నవీకరించి ఉంచండి.",
  editListing:"లిస్టింగ్ ఎడిట్ చేయండి",
  listingNote:"షాప్ రిజిస్ట్రేషన్ అవసరం లేదు — ఎవరైనా వ్యక్తి తమ పనిని జాబితా చేయవచ్చు. ఈ ఫారం కేవలం UI డెమో; సేవ్ చేసినా డేటా ఎక్కడా నిల్వ కాదు.",
  yourName:"మీ పేరు", yourSkill:"మీ నైపుణ్యం / పని",
  phoneShownLabel:"మొబైల్ నంబర్ (కస్టమర్లకు కనిపిస్తుంది)", serviceArea:"సేవా ప్రాంతం",
  startingPrice:"ప్రారంభ ధర (\u20B9)", aboutYou:"మీ గురించి",
  aboutDefault:"10+ సంవత్సరాల అనుభవం — ట్యాప్ రిపేర్, పైప్‌లైన్ ఫిట్టింగ్, బాత్రూమ్ ఇన్‌స్టాలేషన్.",
  saveChanges:"మార్పులను సేవ్ చేయండి", listingSaved:"లిస్టింగ్ నవీకరించబడింది (డెమో)", priceError:"సరైన ప్రారంభ ధరను నమోదు చేయండి",
  reviewsReceived:"అందిన రివ్యూలు", earnings:"సంపాదన", recentJobs:"ఇటీవలి పనులు",
  earnTotalLbl:"ఈ {n} పనుల మొత్తం",
  profileTitle:"ప్రొఫైల్", helpSupport:"సహాయం మరియు మద్దతు", supportToast:"సపోర్ట్ చాట్ — డెమో",
  settings:"సెట్టింగ్‌లు", logout:"లాగ్ అవుట్",
  pnotif1:"కొత్త లీడ్ — ప్రియా షా", pnotif2:"మీకు కొత్త 5-స్టార్ రివ్యూ వచ్చింది", pnotif3:"{amt} చెల్లింపు అందింది",
  languageRow:"భాష", leadAlerts:"కొత్త లీడ్ హెచ్చరికలు", availableForWork:"పనికి అందుబాటులో",
  payoutDetails:"పేఅవుట్ వివరాలు", payoutToast:"పేఅవుట్ సెట్టింగ్‌లు — డెమో",
  about:"యాప్ గురించి", aboutToast:"Helpzo గురించి — డెమో",
  navDashboard:"డాష్‌బోర్డ్", navLeads:"లీడ్‌లు", navListing:"లిస్టింగ్", navProfile:"ప్రొఫైల్",
  footer:"మొత్తం ప్రొవైడర్ యాప్ క్లిక్ చేయదగినది — ఆన్‌బోర్డింగ్, లాగిన్/OTP, డాష్‌బోర్డ్, లీడ్‌లు, లీడ్ వివరాలు, లిస్టింగ్ ఎడిట్, రివ్యూలు, సంపాదన, ప్రొఫైల్, నోటిఫికేషన్లు మరియు సెట్టింగ్‌లు అన్నీ పనిచేస్తాయి. నిజమైన సైన్అప్ లేదా చెల్లింపు లేదు.",
  langSelect:"భాషను ఎంచుకోండి", langSet:"{lang} కు మార్చబడింది",
  hoursAgo:"{n} గం. క్రితం", daysAgo:"{n} రోజుల క్రితం", dayAgo:"1 రోజు క్రితం",
  cPlumber:"ప్లంబర్", cElectrician:"ఎలక్ట్రీషియన్", cCarpenter:"వడ్రంగి", cAcRepair:"AC రిపేర్",
  cPainter:"పెయింటర్", cTailor:"టైలర్", cDriver:"డ్రైవర్", cCook:"వంటవాడు", cGardener:"తోటమాలి", cOther:"ఇతర",
  l1:"శాటిలైట్‌లో ట్యాప్ లీక్ — ఈరోజే సందర్శన కావాలి",
  l2:"కొత్త బాత్రూమ్ ఫిట్టింగ్, ధర కావాలి",
  l3:"వంటగదిలో పైప్‌లైన్ లీక్",
  l4:"బాత్రూమ్‌లో డ్రెయిన్ క్లీనింగ్ కావాలి",
  j1:"ట్యాప్ రిపేర్", j2:"బాత్రూమ్ ఫిట్టింగ్", j3:"పైప్‌లైన్ రిపేర్", j4:"డ్రెయిన్ క్లీనింగ్",
  pr1:"వేగవంతమైన స్పందన, 20 నిమిషాల్లో లీక్ అవుతున్న ట్యాప్ బాగుచేశారు.",
  pr2:"ధర సరైనది, మళ్లీ పిలుస్తాను.",
  pr3:"పని బాగుంది, కొంచెం ఆలస్యంగా వచ్చారు.",
},
};

let lang = 'en';
const t = (k) => (I18N[lang] && I18N[lang][k] != null) ? I18N[lang][k] : I18N.en[k];
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => o[k]);

/* ==================== DATA ==================== */
const leads = [
  {id:1, name:"Priya Shah",   ago:{n:2, u:'h'}, noteKey:"l1", phone:"+91 90876 54321", status:"new"},
  {id:2, name:"Amit Patel",   ago:{n:5, u:'h'}, noteKey:"l2", phone:"+91 89012 34567", status:"new"},
  {id:3, name:"Farah Ansari", ago:{n:1, u:'d'}, noteKey:"l3", phone:"+91 87654 90123", status:"contacted"},
  {id:4, name:"Rina Shah",    ago:{n:2, u:'d'}, noteKey:"l4", phone:"+91 86543 21098", status:"contacted"},
];

const recentJobs = [
  {who:"Priya Shah",   whatKey:"j1", amount:150},
  {who:"Amit Patel",   whatKey:"j2", amount:2500},
  {who:"Farah Ansari", whatKey:"j3", amount:400},
  {who:"Rina Shah",    whatKey:"j4", amount:350},
];

const myReviews = [
  {who:"Priya S.", stars:5, key:"pr1"},
  {who:"Amit P.",  stars:4, key:"pr2"},
  {who:"Neha K.",  stars:4, key:"pr3"},
];

const SKILLS = ["cPlumber","cElectrician","cCarpenter","cAcRepair","cPainter","cTailor","cDriver","cCook","cGardener","cOther"];
const NAV_SCREENS = ['dashboard', 'leads', 'edit', 'profile'];
const MONTH_EARNINGS = 18400;
const REVIEW_COUNT = 120;

let stack = ['splash'];
let selectedLeadId = null;
let toastTimer = null;
let myName = "Rajesh Kumar";
let mySkillKey = "cPlumber";
let myPhone = "+91 98765 43210";
let myArea = "Satellite, Ahmedabad";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const telHref = p => 'tel:' + p.replace(/[^\d+]/g, '');
const inr = n => '₹' + n.toLocaleString('en-IN');
const currentScreen = () => stack[stack.length - 1];
const agoText = a => a.u === 'h' ? fill(t('hoursAgo'), {n:a.n})
  : (a.n === 1 ? t('dayAgo') : fill(t('daysAgo'), {n:a.n}));

/* ==================== LANGUAGE SWITCHER ==================== */
function renderLangPop(){
  $('langPop').innerHTML =
    `<div class="head">${esc(t('languageRow'))}</div>` +
    LANGS.map(l => `<button class="langopt ${l.code === lang ? 'active' : ''}" role="menuitem"
      onclick="event.stopPropagation(); setLang('${l.code}')">
      <span class="native">${esc(l.native)}</span><span class="en">${esc(l.en)}</span></button>`).join('');
}

function toggleLangPop(){
  const pop = $('langPop');
  if(pop.hidden){ renderLangPop(); pop.hidden = false; $('langFab').setAttribute('aria-expanded', 'true'); }
  else closeLangPop();
}
function closeLangPop(){
  $('langPop').hidden = true;
  $('langFab').setAttribute('aria-expanded', 'false');
}

function setLang(code){
  if(!I18N[code]) return;
  lang = code;
  applyLang();
  closeLangPop();
  toast(fill(t('langSet'), {lang: LANGS.find(l => l.code === code).native}));
}

/* one click retranslates the whole app */
function applyLang(){
  document.documentElement.lang = lang;
  document.title = 'Helpzo Provider — ' + t('splashTitle');

  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });

  $('langCode').textContent = lang.toUpperCase();
  $('langRowValue').textContent = LANGS.find(l => l.code === lang).native;
  $('otpSub').textContent = fill(t('otpSub'), {phone: $('loginPhone').value.trim() || '98765 43210'});

  /* skill dropdown keeps its selection while relabelling */
  const sel = $('edSkill');
  sel.innerHTML = SKILLS.map(k => `<option value="${k}">${esc(t(k))}</option>`).join('');
  sel.value = mySkillKey;

  $('ratingLbl').textContent = fill(t('ratingLbl'), {n: REVIEW_COUNT});
  $('statEarned').textContent = inr(MONTH_EARNINGS);
  $('earnMonth').textContent = inr(MONTH_EARNINGS);
  $('earnTotalLbl').textContent = fill(t('earnTotalLbl'), {n: recentJobs.length});
  $('pnotif3').textContent = fill(t('pnotif3'), {amt: inr(2500)});

  syncProfileTexts();
  refreshLeadLists();
  renderEarnings();
  renderReviews();
  if(selectedLeadId) syncLeadDetail();
  if(!$('langPop').hidden) renderLangPop();
}

document.addEventListener('click', closeLangPop);
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeLangPop(); });
$('langPop').addEventListener('click', e => e.stopPropagation());

/* ==================== NAVIGATION ==================== */
function showScreen(key){
  const target = $('screen-' + key);
  if(!target){ console.warn('Screen missing:', key); return false; }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  target.classList.add('active');
  target.scrollTop = 0;
  closeLangPop();

  const hasNav = NAV_SCREENS.includes(key);
  $('bottomNav').classList.toggle('hidden', !hasNav);
  $('toastEl').classList.toggle('low', !hasNav);
  $('langFab').classList.toggle('low', !hasNav);
  $('langPop').classList.toggle('low', !hasNav);
  document.querySelectorAll('.navitem[data-nav]').forEach(b =>
    b.classList.toggle('active', b.dataset.nav === key));

  if(key === 'dashboard') renderLeads($('leadsListPreview'), leads.slice(0, 2));
  if(key === 'leads') renderLeads($('leadsListFull'), leads);
  if(key === 'earnings') renderEarnings();
  if(key === 'reviews') renderReviews();
  if(key === 'otp') $('otpSub').textContent = fill(t('otpSub'), {phone: $('loginPhone').value.trim() || '98765 43210'});
  return true;
}

function goTo(key){
  if(!showScreen(key)) return;
  if(NAV_SCREENS.includes(key)) stack = [key];
  else if(currentScreen() !== key) stack.push(key);
}

/* real back — return where you came from, not always dashboard */
function goBack(){
  if(stack.length > 1) stack.pop();
  showScreen(currentScreen() || 'dashboard');
}

function openNotifications(){
  $('notifDot').classList.add('hidden');
  goTo('notifications');
}

function logout(){
  stack = ['splash'];
  showScreen('splash');
  selectedLeadId = null;
}

/* ==================== AUTH ==================== */
function phoneDigits(){ return $('loginPhone').value.replace(/\D/g, ''); }
function validatePhone(){
  const digits = phoneDigits();
  const ok = digits.length === 10;
  $('loginPhoneErr').classList.toggle('show', !ok && digits.length > 0);
  $('sendOtpBtn').disabled = !ok;
  return ok;
}
function sendOtp(){
  if(!validatePhone()){ $('loginPhoneErr').classList.add('show'); return; }
  goTo('otp');
  const boxes = [...$('otpRow').querySelectorAll('.otp-box')];
  boxes.forEach(b => b.value = '');
  boxes[0].focus();
}
function verifyOtp(){
  const boxes = [...$('otpRow').querySelectorAll('.otp-box')];
  if(boxes.some(b => !b.value.trim())){ toast(t('otpIncomplete')); return; }
  goTo('dashboard');
}

$('otpRow').addEventListener('input', e => {
  const el = e.target;
  el.value = el.value.replace(/\D/g, '').slice(0, 1);
  if(el.value && el.nextElementSibling) el.nextElementSibling.focus();
});
$('otpRow').addEventListener('keydown', e => {
  if(e.key === 'Backspace' && !e.target.value && e.target.previousElementSibling){
    e.target.previousElementSibling.focus();
  }
});

/* ==================== LEADS ==================== */
function renderLeads(container, data){
  if(!container) return;
  container.innerHTML = data.length === 0
    ? `<div class="empty">${t('noLeads')}</div>`
    : data.map(l => {
    const done = l.status === 'contacted';
    return `
    <div class="lead-card" tabindex="0" role="button" onclick="openLead(${l.id})" onkeydown="if(event.key==='Enter'){event.preventDefault();openLead(${l.id});}">
      <div class="lead-top">${esc(l.name)}<span class="lead-time">${esc(agoText(l.ago))}</span></div>
      <p class="lead-note">${esc(t(l.noteKey))}</p>
      <div style="margin-bottom:8px"><span class="badge ${l.status}">${esc(done ? t('badgeContacted') : t('badgeNew'))}</span></div>
      <div class="lead-actions">
        <button class="btn" ${done ? 'disabled' : ''} onclick="event.stopPropagation(); markContacted(${l.id})">
          ${esc(done ? t('badgeContacted') : t('markContacted'))}
        </button>
        <a class="btn btn-primary" style="text-decoration:none"
           href="${telHref(l.phone)}" onclick="event.stopPropagation(); markContacted(${l.id}, true)">${esc(t('call'))}</a>
      </div>
    </div>`;
  }).join('');
}

function refreshLeadLists(){
  renderLeads($('leadsListPreview'), leads.slice(0, 2));
  renderLeads($('leadsListFull'), leads);
}

/* "Mark contacted" actually changes the status, not just a toast */
function markContacted(id, silent){
  const l = leads.find(x => x.id === id);
  if(!l || l.status === 'contacted'){ return; }
  l.status = 'contacted';
  refreshLeadLists();
  if(selectedLeadId === id) syncLeadDetail();
  if(!silent) toast(fill(t('contactedToast'), {name: l.name}));
}
function markContactedCurrent(){ if(selectedLeadId) markContacted(selectedLeadId); }

function openLead(id){
  const l = leads.find(x => x.id === id);
  if(!l) return;
  selectedLeadId = id;
  syncLeadDetail();
  goTo('leaddetail');
}

function syncLeadDetail(){
  const l = leads.find(x => x.id === selectedLeadId);
  if(!l) return;
  $('leadAvatar').textContent = l.name[0];
  $('leadName').textContent = l.name;
  $('leadTime').textContent = agoText(l.ago);
  $('leadNoteFull').textContent = t(l.noteKey);
  $('leadPhone').value = l.phone;
  $('leadCallBtn').href = telHref(l.phone);
  $('leadCallBtn').textContent = t('callCustomer');

  const done = l.status === 'contacted';
  const badge = $('leadBadge');
  badge.className = 'badge ' + l.status;
  badge.textContent = done ? t('badgeContacted') : t('badgeNew');
  const btn = $('leadMarkBtn');
  btn.disabled = done;
  btn.textContent = done ? t('alreadyContacted') : t('markContacted');
}

/* ==================== REVIEWS / EARNINGS ==================== */
function renderReviews(){
  $('reviewsList').innerHTML = myReviews.map(r =>
    `<div class="review"><div class="review-top"><span>${esc(r.who)}</span><span class="star">${'&#9733;'.repeat(r.stars)}</span></div><div class="review-body">${esc(t(r.key))}</div></div>`
  ).join('');
}

function renderEarnings(){
  $('earnList').innerHTML = recentJobs.map(j =>
    `<div class="earn-row"><span>${esc(j.who)} — ${esc(t(j.whatKey))}</span><span>${inr(j.amount)}</span></div>`).join('');
  $('earnTotal').textContent = inr(recentJobs.reduce((s, j) => s + j.amount, 0));
}

/* ==================== PROFILE / LISTING ==================== */
function syncProfileTexts(){
  $('greeting').textContent = fill(t('greeting'), {name: myName});
  $('greetingSub').textContent = t(mySkillKey) + ' · ' + myArea;
  $('profileName').textContent = myName;
  $('profileMeta').textContent = t(mySkillKey) + ' · ' + myPhone;
}

function saveListing(){
  const price = Number($('edPrice').value);
  if(!Number.isFinite(price) || price < 0){ toast(t('priceError')); return; }
  myName = $('edName').value.trim() || 'Rajesh Kumar';
  mySkillKey = $('edSkill').value;
  myPhone = $('edPhone').value.trim();
  myArea = $('edArea').value.split(',')[0].trim() || 'Ahmedabad';
  syncProfileTexts();
  toast(t('listingSaved'));
}

function toggleSwitch(el){
  const on = el.classList.toggle('on');
  el.setAttribute('aria-checked', String(on));
}

function toast(msg){
  const el = $('toastEl');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ==================== BOOT ==================== */
validatePhone();
applyLang();
$('langFab').classList.add('low');
$('langPop').classList.add('low');
