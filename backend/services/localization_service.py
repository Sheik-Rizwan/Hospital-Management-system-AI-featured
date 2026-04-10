class LocalizationService:
    """Provides localized strings for the booking flow."""
    
    STRINGS = {
        'en': {
            'book_who': 'Who is this appointment for?',
            'btn_myself': 'Myself',
            'btn_someone_else': 'Someone Else',
            'ask_own_name': 'What is your *Full Name*?',
            'ask_patient_name': 'Please enter the *Patient\'s Full Name*:',
            'select_service': 'Select a Service:',
            'see_all_options': 'See all options',
            'all_services': 'All Services',
            'view_services': 'View Services',
            'select_doctor': 'Select a Doctor:',
            'all_doctors': 'All Doctors',
            'select': 'Select',
            'select_date': 'Select an available date:',
            'available_dates': 'Available Dates',
            'select_time': 'Select a time slot:',
            'time_slots': 'Time Slots',
            'confirm_title': 'Confirm Appointment',
            'confirm_prompt': 'Please check the details below:',
            'btn_confirm': 'Yes, Confirm',
            'btn_cancel': 'Cancel',
            'booking_success': 'SUCCESS. Booked for patient',
            'booking_failed': 'FAILED to book appointment. System error or slot conflict.',
            'invalid_selection': 'Invalid selection. Please tap or select a valid option from the list.',
            'no_services': 'No services available at the moment.',
            'no_doctors_service': 'No doctors available for this service. Please try another.',
            'doctor_not_found': 'Doctor not found. Please tap or select a valid option from the list.',
            'no_dates_doctor': 'No available dates for this doctor. Please try another doctor.',
            'invalid_date': 'Invalid date. Please select from the list or enter a valid date.',
            'no_slots_date': 'No available slots on this date. Try another date.',
            'all_slots_booked': 'All slots are booked on this date. Try another date.',
            'period_morning': 'Morning (5:00 AM – 11:59 AM)',
            'period_afternoon': 'Afternoon (12:00 PM – 4:59 PM)',
            'period_evening': 'Evening (5:00 PM – 8:59 PM)',
            'period_night': 'Night (9:00 PM – 4:59 AM)',
            'select_period': 'Select a time period:',
            'no_slots_period': 'No slots available in this period. Try another.',
            'lbl_patient': 'Patient',
            'lbl_service': 'Service',
            'lbl_doctor': 'Doctor',
            'lbl_date': 'Date',
            'lbl_time': 'Time',
            'lbl_status': 'Status',
            'status_pending': 'Pending Doctor Approval',
        },
        'hi': {
            'book_who': 'यह अपॉइंटमेंट किसके लिए है?',
            'btn_myself': 'मेरे लिए (Myself)',
            'btn_someone_else': 'किसी और के लिए',
            'ask_own_name': 'आपका *पूरा नाम* क्या है?',
            'ask_patient_name': 'कृपया *मरीज का पूरा नाम* दर्ज करें:',
            'select_service': 'एक सेवा चुनें (Select Service):',
            'see_all_options': 'सभी विकल्प देखें',
            'all_services': 'सभी सेवाएं',
            'view_services': 'सेवाएं देखें',
            'select_doctor': 'एक डॉक्टर चुनें:',
            'all_doctors': 'सभी डॉक्टर',
            'select': 'चुनें',
            'select_date': 'उपलब्ध तारीख चुनें:',
            'available_dates': 'उपलब्ध तारीखें',
            'select_time': 'समय स्लॉट चुनें:',
            'time_slots': 'समय',
            'confirm_title': 'अपॉइंटमेंट पक्का करें',
            'confirm_prompt': 'कृपया नीचे दिए गए विवरण जांचें:',
            'btn_confirm': 'हां, पक्का करें',
            'btn_cancel': 'रद्द करें (Cancel)',
            'booking_success': 'सफलतापूर्वक बुक हो गया। मरीज का नाम:',
            'booking_failed': 'बुकिंग विफल रही। कृपया दोबारा प्रयास करें।',
            'invalid_selection': 'अमान्य चयन। कृपया सूची से एक वैध विकल्प चुनें।',
            'no_services': 'अभी कोई सेवा उपलब्ध नहीं है।',
            'no_doctors_service': 'इस सेवा के लिए कोई डॉक्टर उपलब्ध नहीं हैं। कृपया दूसरी कोशिश करें।',
            'doctor_not_found': 'डॉक्टर नहीं मिले। कृपया सूची से एक वैध विकल्प चुनें।',
            'no_dates_doctor': 'इन डॉक्टर के लिए कोई तारीख उपलब्ध नहीं है। कृपया दूसरे डॉक्टर चुनें।',
            'invalid_date': 'अमान्य तारीख। कृपया सूची से चुनें या सही तारीख लिखें।',
            'no_slots_date': 'इस तारीख पर कोई समय उपलब्ध नहीं है। दूसरी तारीख चुनें।',
            'all_slots_booked': 'इस तारीख के सभी स्लॉट बुक हैं। दूसरी तारीख चुनें।',
            'period_morning': 'सुबह (5:00 AM – 11:59 AM)',
            'period_afternoon': 'दोपहर (12:00 PM – 4:59 PM)',
            'period_evening': 'शाम (5:00 PM – 8:59 PM)',
            'period_night': 'रात (9:00 PM – 4:59 AM)',
            'select_period': 'समय अवधि चुनें (Select period):',
            'no_slots_period': 'इस अवधि में कोई स्लॉट उपलब्ध नहीं है। कोई अन्य आज़माएँ।',
            'lbl_patient': 'मरीज़',
            'lbl_service': 'सेवा',
            'lbl_doctor': 'डॉक्टर',
            'lbl_date': 'तारीख',
            'lbl_time': 'समय',
            'lbl_status': 'स्थिति',
            'status_pending': 'डॉक्टर की मंज़ूरी बाकी',
        },
        'te': {
            'book_who': 'ఈ అపాయింట్‌మెంట్ ఎవరి కోసం?',
            'btn_myself': 'నా కోసం (Myself)',
            'btn_someone_else': 'ఇతరుల కోసం',
            'ask_own_name': 'మీ *పూర్తి పేరు* ఏమిటి?',
            'ask_patient_name': 'దయచేసి *రోగి పూర్తి పేరు* నమోదు చేయండి:',
            'select_service': 'సర్వీస్‌ని ఎంచుకోండి:',
            'see_all_options': 'అన్ని ఆప్షన్స్ చూడండి',
            'all_services': 'అన్ని సర్వీసెస్',
            'view_services': 'సర్వీసెస్ చూడండి',
            'select_doctor': 'డాక్టర్‌ని ఎంచుకోండి:',
            'all_doctors': 'అందరూ డాక్టర్లు',
            'select': 'ఎంచుకోండి (Select)',
            'select_date': 'అందుబాటులో ఉన్న తేదీని ఎంచుకోండి:',
            'available_dates': 'అందుబాటులో ఉన్న తేదీలు',
            'select_time': 'టైమ్ స్లాట్ ఎంచుకోండి:',
            'time_slots': 'టైమ్ స్లాట్స్',
            'confirm_title': 'అపాయింట్‌మెంట్‌ని నిర్ధారించండి',
            'confirm_prompt': 'దయచేసి క్రింది వివరాలను తనిఖీ చేయండి:',
            'btn_confirm': 'అవును, ఖరారు చేయండి',
            'btn_cancel': 'రద్దు చేయి (Cancel)',
            'booking_success': 'విజయవంతంగా బుక్ చేయబడింది. రోగి పేరు:',
            'booking_failed': 'బుకింగ్ విఫలమైంది. దయచేసి మళ్లీ ప్రయత్నించండి.',
            'invalid_selection': 'చెల్లని ఎంపిక. దయచేసి జాబితా నుండి సరైన ఎంపికను ఎంచుకోండి.',
            'no_services': 'ప్రస్తుతం ఎలాంటి సర్వీసులు అందుబాటులో లేవు.',
            'no_doctors_service': 'ఈ సర్వీస్‌కు డాక్టర్లు అందుబాటులో లేరు. దయచేసి మరొకటి ప్రయత్నించండి.',
            'doctor_not_found': 'డాక్టర్ దొరకలేదు. దయచేసి జాబితా నుండి సరైన ఎంపికను ఎంచుకోండి.',
            'no_dates_doctor': 'ఈ డాక్టర్‌కు అందుబాటులో తేదీలు లేవు. దయచేసి మరొక డాక్టర్‌ని ప్రయత్నించండి.',
            'invalid_date': 'చెల్లని తేదీ. దయచేసి జాబితా నుండి ఎంచుకోండి.',
            'no_slots_date': 'ఈ తేదీన స్లాట్‌లు అందుబాటులో లేవు. మరొక తేదీని ప్రయత్నించండి.',
            'all_slots_booked': 'ఈ తేదీన అన్ని స్లాట్‌లు బుక్ అయ్యాయి. మరొక తేదీని ప్రయత్నించండి.',
            'period_morning': 'ఉదయం (5:00 AM – 11:59 AM)',
            'period_afternoon': 'మధ్యాహ్నం (12:00 PM – 4:59 PM)',
            'period_evening': 'సాయంత్రం (5:00 PM – 8:59 PM)',
            'period_night': 'రాత్రి (9:00 PM – 4:59 AM)',
            'select_period': 'సమయ వ్యవధిని ఎంచుకోండి (Select period):',
            'no_slots_period': 'ఈ వ్యవధిలో స్లాట్‌లు లేవు. మరొకటి ప్రయత్నించండి.',
            'lbl_patient': 'రోగి',
            'lbl_service': 'సర్వీస్',
            'lbl_doctor': 'డాక్టర్',
            'lbl_date': 'తేదీ',
            'lbl_time': 'సమయం',
            'lbl_status': 'స్థితి',
            'status_pending': 'డాక్టర్ ఆమోదం పెండింగ్‌లో ఉంది',
        },
        'kn': {
            'book_who': 'ಈ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಯಾರಿಗಾಗಿ?',
            'btn_myself': 'ನನಗಾಗಿ (Myself)',
            'btn_someone_else': 'ಬೇರೆಯವರಿಗಾಗಿ',
            'ask_own_name': 'ನಿಮ್ಮ *ಪೂರ್ಣ ಹೆಸರು* ಏನು?',
            'ask_patient_name': 'ದಯವಿಟ್ಟು *ರೋಗಿಯ ಪೂರ್ಣ ಹೆಸರನ್ನು* ನಮೂದಿಸಿ:',
            'select_service': 'ಸೇವೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ:',
            'see_all_options': 'ಎಲ್ಲಾ ಆಯ್ಕೆಗಳನ್ನು ನೋಡಿ',
            'all_services': 'ಎಲ್ಲಾ ಸೇವೆಗಳು',
            'view_services': 'ಸೇವೆಗಳನ್ನು ನೋಡಿ',
            'select_doctor': 'ವೈದ್ಯರನ್ನು ಆಯ್ಕೆಮಾಡಿ:',
            'all_doctors': 'ಎಲ್ಲಾ ವೈದ್ಯರು',
            'select': 'ಆಯ್ಕೆಮಾಡಿ (Select)',
            'select_date': 'ಲಭ್ಯವಿರುವ ದಿನಾಂಕವನ್ನು ಆಯ್ಕೆಮಾಡಿ:',
            'available_dates': 'ಲಭ್ಯವಿರುವ ದಿನಾಂಕಗಳು',
            'select_time': 'ಸಮಯ ಸ್ಲಾಟ್ ಆಯ್ಕೆಮಾಡಿ:',
            'time_slots': 'ಸಮಯದ ಸ್ಲಾಟ್‌ಗಳು',
            'confirm_title': 'ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಖಚಿತಪಡಿಸಿ',
            'confirm_prompt': 'ದಯವಿಟ್ಟು ಕೆಳಗಿನ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ:',
            'btn_confirm': 'ಹೌದು, ಖಚಿತಪಡಿಸಿ',
            'btn_cancel': 'ರದ್ದುಮಾಡು (Cancel)',
            'booking_success': 'ಯಶಸ್ವಿಯಾಗಿ ಬುಕ್ ಮಾಡಲಾಗಿದೆ. ರೋಗಿಯ ಹೆಸರು:',
            'booking_failed': 'ಬುಕಿಂಗ್ ವಿಫಲವಾಗಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
            'invalid_selection': 'ಅಮಾನ್ಯ ಆಯ್ಕೆ. ಪಟ್ಟಿಯಿಂದ ಸರಿಯಾದ ಆಯ್ಕೆಯನ್ನು ಆರಿಸಿ.',
            'no_services': 'ಪ್ರಸ್ತುತ ಯಾವುದೇ ಸೇವೆಗಳು ಲಭ್ಯವಿಲ್ಲ.',
            'no_doctors_service': 'ಈ ಸೇವೆಗೆ ವೈದ್ಯರು ಲಭ್ಯವಿಲ್ಲ. ಬೇರೊಂದನ್ನು ಪ್ರಯತ್ನಿಸಿ.',
            'doctor_not_found': 'ವೈದ್ಯರು ಕಂಡುಬಂದಿಲ್ಲ. ಪಟ್ಟಿಯಿಂದ ಸರಿಯಾದ ಆಯ್ಕೆಯನ್ನು ಆರಿಸಿ.',
            'no_dates_doctor': 'ಈ ವೈದ್ಯರಿಗೆ ಯಾವುದೇ ದಿನಾಂಕಗಳು ಲಭ್ಯವಿಲ್ಲ. ಬೇರೊಬ್ಬ ವೈದ್ಯರನ್ನು ಪ್ರಯತ್ನಿಸಿ.',
            'invalid_date': 'ಅಮಾನ್ಯ ದಿನಾಂಕ. ದಯವಿಟ್ಟು ಪಟ್ಟಿಯಿಂದ ಆಯ್ಕೆಮಾಡಿ.',
            'no_slots_date': 'ಈ ದಿನಾಂಕದಂದು ಯಾವುದೇ ಸ್ಲಾಟ್‌ಗಳು ಲಭ್ಯವಿಲ್ಲ. ಬೇರೊಂದು ದಿನಾಂಕವನ್ನು ಪ್ರಯತ್ನಿಸಿ.',
            'all_slots_booked': 'ಈ ದಿನಾಂಕದ ಎಲ್ಲಾ ಸ್ಲಾಟ್‌ಗಳನ್ನು ಕಾಯ್ದಿರಿಸಲಾಗಿದೆ. ಬೇರೊಂದು ದಿನಾಂಕ ಪ್ರಯತ್ನಿಸಿ.',
            'period_morning': 'ಬೆಳಿಗ್ಗೆ (5:00 AM – 11:59 AM)',
            'period_afternoon': 'ಮಧ್ಯಾಹ್ನ (12:00 PM – 4:59 PM)',
            'period_evening': 'ಸಂಜೆ (5:00 PM – 8:59 PM)',
            'period_night': 'ರಾತ್ರಿ (9:00 PM – 4:59 AM)',
            'select_period': 'ಸಮಯದ ಅವಧಿಯನ್ನು ಆಯ್ಕೆಮಾಡಿ (Select period):',
            'no_slots_period': 'ಈ ಅವಧಿಯಲ್ಲಿ ಸ್ಲಾಟ್‌ಗಳಿಲ್ಲ. ಬೇರೊಂದನ್ನು ಪ್ರಯತ್ನಿಸಿ.',
            'lbl_patient': 'ರೋಗಿ',
            'lbl_service': 'ಸೇವೆ',
            'lbl_doctor': 'ವೈದ್ಯರು',
            'lbl_date': 'ದಿನಾಂಕ',
            'lbl_time': 'ಸಮಯ',
            'lbl_status': 'ಸ್ಥಿತಿ',
            'status_pending': 'ವೈದ್ಯರ ಅನುಮೋದನೆ ಬಾಕಿ',
        },
        'ta': {
            'book_who': 'இந்த அப்பாய்ன்மெண்ட் யாருக்காக?',
            'btn_myself': 'எனக்காக (Myself)',
            'btn_someone_else': 'மற்றவருக்காக',
            'ask_own_name': 'உங்கள் *முழு பெயர்* என்ன?',
            'ask_patient_name': 'தயவுசெய்து *நோயாளியின் முழு பெயரை* உள்ளிடவும்:',
            'select_service': 'சேவையைத் தேர்ந்தெடுக்கவும்:',
            'see_all_options': 'அனைத்து விருப்பங்களையும் காண்க',
            'all_services': 'அனைத்து சேவைகள்',
            'view_services': 'சேவைகளை காண்க',
            'select_doctor': 'மருத்துவரைத் தேர்ந்தெடுக்கவும்:',
            'all_doctors': 'அனைத்து மருத்துவர்கள்',
            'select': 'தேர்ந்தெடு (Select)',
            'select_date': 'கிடைக்கக்கூடிய தேதியைத் தேர்ந்தெடுக்கவும்:',
            'available_dates': 'கிடைக்கக்கூடிய தேதிகள்',
            'select_time': 'நேர ஸ்லாட்டைத் தேர்ந்தெடுக்கவும்:',
            'time_slots': 'நேர இடங்கள் (Time Slots)',
            'confirm_title': 'நிச்சயப் படுத்துக',
            'confirm_prompt': 'கீழே உள்ள விவரங்களைச் சரிபார்க்கவும்:',
            'btn_confirm': 'ஆம், உறுதிப்படுத்துக',
            'btn_cancel': 'ரத்து செய் (Cancel)',
            'booking_success': 'வெற்றிகரமாக பதிவு செய்யப்பட்டது. நோயாளியின் பெயர்:',
            'booking_failed': 'பதிவு தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்.',
            'invalid_selection': 'தவறான தேர்வு. பட்டியலிலிருந்து சரியான விருப்பத்தைத் தேர்ந்தெடுக்கவும்.',
            'no_services': 'தற்போது எந்த சேவைகளும் இல்லை.',
            'no_doctors_service': 'இந்த சேவைக்கு மருத்துவர்கள் யாரும் இல்லை. வேறொன்றை முயற்சிக்கவும்.',
            'doctor_not_found': 'மருத்துவர் கிடைக்கவில்லை. பட்டியலிலிருந்து சரியான விருப்பத்தைத் தேர்ந்தெடுக்கவும்.',
            'no_dates_doctor': 'இந்த மருத்துவருக்கு எந்த தேதியும் இல்லை. வேறொரு மருத்துவரை முயற்சிக்கவும்.',
            'invalid_date': 'தவறான தேதி. தயவுசெய்து பட்டியலிலிருந்து தேர்ந்தெடுக்கவும்.',
            'no_slots_date': 'இந்த தேதியில் இடமில்லை. வேறொரு தேதியை முயற்சிக்கவும்.',
            'all_slots_booked': 'இந்த தேதியில் அனைத்து இடங்களும் பதிவு செய்யப்பட்டுள்ளன. வேறொரு தேதியை முயற்சிக்கவும்.',
            'period_morning': 'காலை (5:00 AM – 11:59 AM)',
            'period_afternoon': 'மதியம் (12:00 PM – 4:59 PM)',
            'period_evening': 'மாலை (5:00 PM – 8:59 PM)',
            'period_night': 'இரவு (9:00 PM – 4:59 AM)',
            'select_period': 'நேர காலத்தை தேர்ந்தெடுக்கவும் (Select period):',
            'no_slots_period': 'இந்த காலத்தில் இடமில்லை. வேறொன்றை முயற்சிக்கவும்.',
            'lbl_patient': 'நோயாளி',
            'lbl_service': 'சேவை',
            'lbl_doctor': 'மருத்துவர்',
            'lbl_date': 'தேதி',
            'lbl_time': 'நேரம்',
            'lbl_status': 'நிலை',
            'status_pending': 'மருத்துவர் ஒப்புதல் நிலுவையில்',
        }
    }

    @classmethod
    def get(cls, key: str, lang_code: str = 'en') -> str:
        """Get a localized string by key and language code. Defaults to English."""
        # Fallback to English if lang_code is completely unknown
        if lang_code not in cls.STRINGS:
            lang_code = 'en'
            
        lang_strings = cls.STRINGS[lang_code]
        
        # Fallback to English if the specific key is missing in the chosen language
        if key not in lang_strings:
            return cls.STRINGS['en'].get(key, f"[{key}]")
            
        return lang_strings[key]

    @classmethod
    def get_with_vars(cls, key: str, lang_code: str = 'en', **kwargs) -> str:
        """Get localized string and format with variables."""
        text = cls.get(key, lang_code)
        try:
            return text.format(**kwargs)
        except Exception:
            return text

    # ── Localized Calendar Data ──────────────────────
    DAY_NAMES = {
        'en': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        'hi': ['सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार', 'रविवार'],
        'te': ['సోమవారం', 'మంగళవారం', 'బుధవారం', 'గురువారం', 'శుక్రవారం', 'శనివారం', 'ఆదివారం'],
        'kn': ['ಸೋಮವಾರ', 'ಮಂಗಳವಾರ', 'ಬುಧವಾರ', 'ಗುರುವಾರ', 'ಶುಕ್ರವಾರ', 'ಶನಿವಾರ', 'ಭಾನುವಾರ'],
        'ta': ['திங்கள்', 'செவ்வாய்', 'புதன்', 'வியாழன்', 'வெள்ளி', 'சனி', 'ஞாயிறு'],
    }
    MONTH_NAMES = {
        'en': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        'hi': ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
        'te': ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జులై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్'],
        'kn': ['ಜನವರಿ', 'ಫೆಬ್ರವರಿ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿಲ್', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗಸ್ಟ್', 'ಸೆಪ್ಟೆಂಬರ್', 'ಅಕ್ಟೋಬರ್', 'ನವೆಂಬರ್', 'ಡಿಸೆಂಬರ್'],
        'ta': ['ஜனவரி', 'பிப்ரவரி', 'மார்ச்', 'ஏப்ரல்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆகஸ்ட்', 'செப்டம்பர்', 'அக்டோபர்', 'நவம்பர்', 'டிசம்பர்'],
    }

    @classmethod
    def format_date_localized(cls, date_str: str, lang_code: str = 'en') -> str:
        """
        Converts 'YYYY-MM-DD' to 'DayName, MonthName DD' in the selected language.
        Example (te): '2026-04-10' → 'శుక్రవారం, ఏప్రిల్ 10'
        """
        from datetime import datetime
        try:
            dt = datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError:
            return date_str
        day_names = cls.DAY_NAMES.get(lang_code, cls.DAY_NAMES['en'])
        month_names = cls.MONTH_NAMES.get(lang_code, cls.MONTH_NAMES['en'])
        day_name = day_names[dt.weekday()]
        month_name = month_names[dt.month - 1]
        return f"{day_name}, {month_name} {dt.day}"

    @classmethod
    def format_date_ddmmyyyy(cls, date_str: str) -> str:
        """Converts 'YYYY-MM-DD' to 'DD-MM-YYYY'."""
        from datetime import datetime
        try:
            dt = datetime.strptime(date_str, '%Y-%m-%d')
            return dt.strftime('%d-%m-%Y')
        except ValueError:
            return date_str

    TRANSLITERATIONS = {
        'hi': {
            'cardiology': 'कार्डियोलॉजी', 'orthopedics': 'ऑर्थोपेडिक्स', 'dermatology': 'डर्मेटोलॉजी',
            'neurology': 'न्यूरोलॉजी', 'pediatrics': 'पीडियाट्रिक्स', 'ent': 'ईएनटी', 'dentistry': 'डेंटिस्ट्री',
            'general': 'जनरल', 'physician': 'फिजिशियन',
            'consultation': 'परामर्श', 'general consultation': 'सामान्य परामर्श',
            'dental general consultation': 'डेंटल सामान्य परामर्श',
            'dr. ashwaq': 'डॉ. अशवाक', 'dr. rizwan': 'डॉ. रिज़वान', 'dr. sridhar': 'डॉ. श्रीधर',
            'dr. chaman': 'डॉ. चमन'
        },
        'te': {
            'cardiology': 'కార్డియాలజీ', 'orthopedics': 'ఆర్థోపెడిక్స్', 'dermatology': 'డెర్మటాలజీ',
            'neurology': 'న్యూరాలజీ', 'pediatrics': 'పీడియాట్రిక్స్', 'ent': 'ఈఎన్‌టీ', 'dentistry': 'డెంటిస్ట్రీ',
            'general': 'జనరల్', 'physician': 'ఫిజీషియన్',
            'consultation': 'సంప్రదింపు', 'general consultation': 'సాధారణ సంప్రదింపు',
            'dental general consultation': 'డెంటల్ సాధారణ సంప్రదింపు',
            'dr. ashwaq': 'డాక్టర్ అష్వాక్', 'dr. rizwan': 'డాక్టర్ రిజ్వాన్', 'dr. sridhar': 'డాక్టర్ శ్రీధర్',
            'dr. chaman': 'డాక్టర్ చమన్'
        },
        'kn': {
            'cardiology': 'ಕಾರ್ಡಿಯಾಲಜಿ', 'orthopedics': 'ಆರ್ಥೋಪೆಡಿಕ್ಸ್', 'dermatology': 'ಡರ್ಮಟಾಲಜಿ',
            'neurology': 'ನ್ಯೂರಾಲಜಿ', 'pediatrics': 'ಪೀಡಿಯಾಟ್ರಿಕ್ಸ್', 'ent': 'ಇಎನ್ಟಿ', 'dentistry': 'ಡೆಂಟಿಸ್ಟ್ರಿ',
            'general': 'ಜನರಲ್', 'physician': 'ಫಿಸಿಶಿಯನ್',
            'consultation': 'ಸಮಾಲೋಚನೆ', 'general consultation': 'ಸಾಮಾನ್ಯ ಸಮಾಲೋಚನೆ',
            'dental general consultation': 'ಡೆಂಟಲ್ ಸಾಮಾನ್ಯ ಸಮಾಲೋಚನೆ',
            'dr. ashwaq': 'ಡಾ. ಅಶ್ವಾಕ್', 'dr. rizwan': 'ಡಾ. ರಿಜ್ವಾನ್', 'dr. sridhar': 'ಡಾ. ಶ್ರೀಧರ್',
            'dr. chaman': 'ಡಾ. ಚಮನ್'
        },
        'ta': {
            'cardiology': 'கார்டியாலஜி', 'orthopedics': 'ஆர்த்தோபெடிக்ஸ்', 'dermatology': 'டெர்மடாலஜி',
            'neurology': 'நியூராலஜி', 'pediatrics': 'பீடியாட்ரிக்ஸ்', 'ent': 'இஎன்டி', 'dentistry': 'டென்டிஸ்ட்ரி',
            'general': 'ஜெனரல்', 'physician': 'பிசிஷியன்',
            'consultation': 'ஆலோசனை', 'general consultation': 'பொது ஆலோசனை',
            'dental general consultation': 'டென்டல் பொது ஆலோசனை',
            'dr. ashwaq': 'டாக்டர் அஷ்வாக்', 'dr. rizwan': 'டாக்டர் ரிஸ்வான்', 'dr. sridhar': 'டாக்டர் ஸ்ரீதர்',
            'dr. chaman': 'டாக்டர் சமன்'
        }
    }

    @classmethod
    def get_bilingual_name(cls, name: str, lang_code: str = 'en') -> str:
        """Returns Localized Name if translation is available and lang_code != 'en', else English Name."""
        if lang_code == 'en' or not name:
            return name
            
        lang_trans = cls.TRANSLITERATIONS.get(lang_code, {})
        # Case insensitive lookup
        cleaned_name = name.strip()
        lower_name = cleaned_name.lower()
        
        # Check direct match
        if lower_name in lang_trans:
            return lang_trans[lower_name]
            
        # Try to find 'Dr. ' prefix dynamically
        if lower_name.startswith('dr. '):
            doc_name = lower_name.replace('dr. ', '')
            for k, v in lang_trans.items():
                if k.endswith(doc_name) and k.startswith('dr.'):
                    return v
                    
        return cleaned_name

    @classmethod
    def get_bilingual_display(cls, name: str, lang_code: str = 'en') -> str:
        """Returns 'Localized (English)' format if translation exists, else 'English'."""
        if lang_code == 'en' or not name:
            return name

        translated = cls.get_bilingual_name(name, lang_code)
        if translated and translated != name:
            return f"{translated} ({name})"

        return name
