# booking_utils.py — Shared date/time parsing and validation for Voice + WhatsApp booking
# Consolidates logic from whatsapp_service._parse_natural_date / _parse_natural_time

import re
import logging
from datetime import datetime, date, timedelta

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════
#  DATE RESOLUTION
# ═══════════════════════════════════════════

MONTH_MAP = {
    'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
    'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6, 'jul': 7, 'july': 7,
    'aug': 8, 'august': 8, 'sep': 9, 'september': 9, 'oct': 10, 'october': 10,
    'nov': 11, 'november': 11, 'dec': 12, 'december': 12
}

DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

# Multilingual day name mappings (map to 0=Monday ... 6=Sunday)
MULTILINGUAL_DAY_NAMES = {
    # Hindi (Romanized)
    'somvaar': 0, 'somvar': 0, 'mangalvaar': 1, 'mangalvar': 1,
    'budhvaar': 2, 'budhvar': 2, 'guruvaar': 3, 'guruvar': 3,
    'shukravaar': 4, 'shukravar': 4, 'shanivaar': 5, 'shanivar': 5,
    'ravivaar': 6, 'ravivar': 6, 'itvaar': 6, 'itvar': 6,
    # Hindi (Devanagari)
    'सोमवार': 0, 'मंगलवार': 1, 'बुधवार': 2, 'गुरुवार': 3,
    'शुक्रवार': 4, 'शनिवार': 5, 'रविवार': 6, 'इतवार': 6,
    # Telugu
    'సోమవారం': 0, 'మంగళవారం': 1, 'బుధవారం': 2, 'గురువారం': 3,
    'శుక్రవారం': 4, 'శనివారం': 5, 'ఆదివారం': 6,
    # Kannada
    'ಸೋಮವಾರ': 0, 'ಮಂಗಳವಾರ': 1, 'ಬುಧವಾರ': 2, 'ಗುರುವಾರ': 3,
    'ಶುಕ್ರವಾರ': 4, 'ಶನಿವಾರ': 5, 'ಭಾನುವಾರ': 6,
    # Urdu
    'پیر': 0, 'منگل': 1, 'بدھ': 2, 'جمعرات': 3,
    'جمعہ': 4, 'ہفتہ': 5, 'اتوار': 6,
}

# Hindi/Urdu/Kannada/Telugu relative words — expanded multilingual
TODAY_WORDS = [
    'today', 'aaj',
    # Hindi (Devanagari)
    'आज',
    # Telugu
    'ఈ రోజు', 'ఈరోజు', 'నేడు',
    # Kannada
    'ಇಂದು', 'ಈ ದಿನ',
    # Urdu
    'آج',
]
TOMORROW_WORDS = [
    'tomorrow', 'kal', 'kl',
    # Hindi (Devanagari)
    'कल',
    # Telugu
    'రేపు',
    # Kannada
    'ನಾಳೆ',
    # Urdu
    'کل',
]
DAY_AFTER_WORDS = [
    'day after tomorrow', 'parson', 'parso', 'parsu', 'narsu',
    # Hindi (Devanagari)
    'परसों', 'परसो', 'परसू',
    # Telugu
    'ఎల్లుండి',
    # Kannada
    'ನಾಡಿದ್ದು',
    # Urdu
    'پرسوں',
]

# Multilingual "next" words (e.g., "agle somvaar" = next Monday)
NEXT_WORDS = [
    'next', 'agle', 'agla', 'aane wale',
    # Hindi (Devanagari)
    'अगले', 'अगला', 'आने वाले',
    # Telugu
    'వచ్చే', 'తర్వాత',
    # Kannada
    'ಮುಂದಿನ',
    # Urdu
    'اگلے', 'آنے والے',
]

# Multilingual "in N days" patterns
IN_N_DAYS_PATTERNS = [
    r'in\s+(\d+)\s+days?',                      # English
    r'(\d+)\s+din\s+(baad|me|mein)',             # Hindi Romanized
    r'(\d+)\s+दिन\s+(बाद|में)',                   # Hindi Devanagari
    r'(\d+)\s+రోజుల\s+తర్వాత',                   # Telugu
    r'(\d+)\s+ದಿನಗಳ\s+ನಂತರ',                    # Kannada
    r'(\d+)\s+دن\s+بعد',                         # Urdu
]

# Multilingual number words (for "teen din baad" = 3 days later)
NUMBER_WORDS = {
    # English
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    # Hindi (Romanized)
    'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'paanch': 5,
    'cheh': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10,
    'gyarah': 11, 'barah': 12,
    # Hindi (Devanagari)
    'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5,
    'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
    # Telugu (Romanized)
    'okati': 1, 'rendu': 2, 'moodu': 3, 'nalugu': 4, 'aidu': 5,
    'aaru': 6, 'eedu': 7, 'enimidi': 8, 'tommidi': 9, 'padi': 10,
    # Telugu (Script)
    'ఒకటి': 1, 'రెండు': 2, 'మూడు': 3, 'నాలుగు': 4, 'ఐదు': 5,
    'ఆరు': 6, 'ఏడు': 7, 'ఎనిమిది': 8, 'తొమ్మిది': 9, 'పది': 10,
    # Kannada (Romanized)
    'ondu': 1, 'eradu': 2, 'mooru': 3, 'nalku': 4, 'aidhu': 5,
    'aaru_kn': 6, 'elu': 7, 'entu': 8, 'ombattu': 9, 'hattu': 10,
    # Kannada (Script)
    'ಒಂದು': 1, 'ಎರಡು': 2, 'ಮೂರು': 3, 'ನಾಲ್ಕು': 4, 'ಐದು': 5,
    'ಆರು': 6, 'ಏಳು': 7, 'ಎಂಟು': 8, 'ಒಂಬತ್ತು': 9, 'ಹತ್ತು': 10,
    # Urdu
    'ایک': 1, 'دو': 2, 'تین': 3, 'چار': 4, 'پانچ': 5,
    'چھ': 6, 'سات': 7, 'آٹھ': 8, 'نو': 9, 'دس': 10,
}

# Multilingual shift/period words
MORNING_WORDS = [
    'morning', 'subah', 'savere',
    'सुबह', 'सवेरे',           # Hindi
    'ఉదయం', 'పొద్దున',         # Telugu
    'ಬೆಳಿಗ್ಗೆ', 'ಮುಂಜಾನೆ',     # Kannada
    'صبح',                     # Urdu
    # Code-mixed (Hinglish/Kanglish/Telglish)
    'subah wala', 'morning ka', 'morning wala', 'morning wali',
    'beligge slot', 'udayam slot', 'morning lo', 'morning alli',
]
AFTERNOON_WORDS = [
    'afternoon', 'dopahar', 'dopehar',
    'दोपहर',                    # Hindi
    'మధ్యాహ్నం',                # Telugu
    'ಮಧ್ಯಾಹ್ನ',                 # Kannada
    'دوپہر',                    # Urdu
    # Code-mixed
    'dopahar wala', 'afternoon ka', 'afternoon wala',
    'madhyahnam slot', 'madhyahna slot',
]
EVENING_WORDS = [
    'evening', 'sham', 'shaam',
    'शाम',                      # Hindi
    'సాయంత్రం',                 # Telugu
    'ಸಂಜೆ',                     # Kannada
    'شام',                      # Urdu
    # Code-mixed
    'sham wala', 'sham ka', 'evening ka', 'evening wala', 'evening wali',
    'sanje slot', 'sayantram slot', 'evening lo', 'evening alli',
]
NIGHT_WORDS = [
    'night', 'raat', 'raat ko',
    'रात',                       # Hindi
    'రాత్రి',                    # Telugu
    'ರಾತ್ರಿ',                    # Kannada
    'رات',                       # Urdu
    # Code-mixed
    'raat wala', 'raat ka', 'night ka', 'night wala', 'night wali',
    'raatri slot', 'night lo', 'night alli',
]


def resolve_date(text: str, today: date = None) -> tuple:
    """
    Parse natural language date text into YYYY-MM-DD.
    Supports English, Hindi, Telugu, Kannada, Urdu in both native script and Romanized form.
    Rejects past dates and 'today' (same-day bookings not allowed).

    Returns: (date_str: str | None, error_msg: str | None)
    - Both None if the text could not be parsed at all.
    - date_str is set on success.
    - error_msg is set if the date is invalid (past / today).
    """
    if today is None:
        today = date.today()

    text_lower = text.lower().strip()

    # Already YYYY-MM-DD
    try:
        parsed = datetime.strptime(text_lower, '%Y-%m-%d').date()
        return _validate_future(parsed, today)
    except ValueError:
        pass

    # "today" → reject (multilingual)
    if any(w == text_lower or text_lower.startswith(w + ' ') or w in text_lower for w in TODAY_WORDS):
        return None, "Same-day bookings are not available. Please choose from tomorrow onwards."

    # "tomorrow" (multilingual)
    if any(w in text_lower for w in TOMORROW_WORDS):
        return _validate_future(today + timedelta(days=1), today)

    # "day after tomorrow" (multilingual)
    if any(w in text_lower for w in DAY_AFTER_WORDS):
        return _validate_future(today + timedelta(days=2), today)

    # "in N days" (multilingual patterns)
    for pattern in IN_N_DAYS_PATTERNS:
        m = re.search(pattern, text_lower)
        if m:
            d = today + timedelta(days=int(m.group(1)))
            return _validate_future(d, today)

    # Word-number based "teen din baad" / "3 दिन बाद" etc.
    for word, num in NUMBER_WORDS.items():
        if word in text_lower:
            # Check if followed by "din/days/रोजु/ದಿನ" type words
            day_words = ['din', 'days', 'day', 'दिन', 'రోజు', 'రోజుల', 'ದಿನ', 'ದಿನಗಳ', 'دن']
            for dw in day_words:
                if dw in text_lower:
                    d = today + timedelta(days=num)
                    return _validate_future(d, today)
            break

    # "next monday", "next friday", "on saturday" (English)
    for i, day_name in enumerate(DAY_NAMES):
        if day_name in text_lower:
            days_ahead = (i - today.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7  # next week
            d = today + timedelta(days=days_ahead)
            return _validate_future(d, today)

    # Multilingual day names (Hindi, Telugu, Kannada, Urdu)
    for day_word, weekday_idx in MULTILINGUAL_DAY_NAMES.items():
        if day_word in text_lower:
            days_ahead = (weekday_idx - today.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            d = today + timedelta(days=days_ahead)
            return _validate_future(d, today)

    # Month + day: "feb 21", "21 feb", "february 21", "march 5th", "5th march"
    for month_name, month_num in MONTH_MAP.items():
        if month_name in text_lower:
            day_match = re.search(r'(\d{1,2})', text_lower)
            if day_match:
                day = int(day_match.group(1))
                year = today.year
                try:
                    candidate = date(year, month_num, day)
                    if candidate <= today:
                        candidate = date(year + 1, month_num, day)
                    return _validate_future(candidate, today)
                except ValueError:
                    pass
            break

    # Just a number like "15" → try current month, then next month
    num_match = re.match(r'^\s*(\d{1,2})(?:st|nd|rd|th)?\s*$', text_lower)
    if num_match:
        day = int(num_match.group(1))
        try:
            candidate = date(today.year, today.month, day)
            if candidate <= today:
                # Try next month
                if today.month == 12:
                    candidate = date(today.year + 1, 1, day)
                else:
                    candidate = date(today.year, today.month + 1, day)
            return _validate_future(candidate, today)
        except ValueError:
            pass

    return None, None  # Could not parse


def _validate_future(d: date, today: date) -> tuple:
    """Reject dates that are today or in the past."""
    if d <= today:
        return None, f"The date {d.strftime('%B %d, %Y')} has already passed. Please choose from tomorrow onwards."
    return d.strftime('%Y-%m-%d'), None


def validate_booking_date(date_str: str, today: date = None) -> tuple:
    """
    Validate a YYYY-MM-DD string is a valid future date.
    Returns: (is_valid: bool, error_msg: str | None)
    """
    if today is None:
        today = date.today()
    try:
        d = datetime.strptime(date_str, '%Y-%m-%d').date()
        if d <= today:
            return False, f"The date {d.strftime('%B %d, %Y')} has already passed. Please choose from tomorrow onwards."
        return True, None
    except ValueError:
        return False, f"'{date_str}' is not a valid date format. Please use YYYY-MM-DD."


# ═══════════════════════════════════════════
#  TIME RESOLUTION
# ═══════════════════════════════════════════

def resolve_time(text: str) -> str | None:
    """
    Parse natural language time to HH:MM (24h format).
    Handles: '9am', '9:30am', '14:00', '2pm', '9 AM', '14:30', etc.
    Returns HH:MM string or None if unparseable.
    """
    text_clean = text.strip().lower().replace(' ', '')

    # Already HH:MM (24h)
    m = re.match(r'^(\d{1,2}):(\d{2})$', text_clean)
    if m:
        h, mn = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23 and 0 <= mn <= 59:
            return f"{h:02d}:{mn:02d}"

    # 12h format: 9am, 9:30am, 2pm, 2:30pm, 9 am
    m = re.match(r'^(\d{1,2})(?::(\d{2}))?([ap]\.?m\.?)$', text_clean)
    if m:
        h = int(m.group(1))
        mn = int(m.group(2)) if m.group(2) else 0
        period = m.group(3).replace('.', '')
        if period == 'pm' and h != 12:
            h += 12
        if period == 'am' and h == 12:
            h = 0
        if 0 <= h <= 23 and 0 <= mn <= 59:
            return f"{h:02d}:{mn:02d}"

    # Just a bare number (e.g. "9", "14")
    m = re.match(r'^(\d{1,2})$', text_clean)
    if m:
        h = int(m.group(1))
        if 0 <= h <= 23:
            return f"{h:02d}:00"

    return None


def resolve_ambiguous_time(time_text: str, doctor_id: str, date_str: str, appt_service) -> tuple:
    """
    Resolve ambiguous time (e.g. "2:30" without AM/PM) by checking
    the doctor's actual shift schedule on the given date.

    Uses get_available_shifts() + get_shift_slots() to get real free slots.

    Logic:
    - Parse the bare time to get hour + minute.
    - Check if that time (or its +12h version) is an available slot.
    - If only one matches → use it.
    - If both match → pick the first available one.
    - If neither matches → return None with a helpful message.

    Returns: (resolved_HH:MM: str | None, error_msg: str | None)
    """
    text_clean = time_text.strip().lower().replace(' ', '')

    # If it already has am/pm, resolve directly
    if re.search(r'[ap]\.?m\.?', text_clean):
        resolved = resolve_time(time_text)
        return (resolved, None) if resolved else (None, "Could not parse the time.")

    # Parse bare time: "2:30" → h=2, m=30 | "2" → h=2, m=0 | "14:30" → h=14, m=30
    h, mn = None, 0
    m = re.match(r'^(\d{1,2})(?::(\d{2}))?$', text_clean)
    if m:
        h = int(m.group(1))
        mn = int(m.group(2)) if m.group(2) else 0
    else:
        return None, "Could not parse the time."

    # If hour >= 13, it's already unambiguous 24h
    if h >= 13:
        return f"{h:02d}:{mn:02d}", None

    # Two candidates: the hour as-is (AM interpretation) and +12 (PM interpretation)
    candidate_am = f"{h:02d}:{mn:02d}"
    candidate_pm = f"{(h + 12):02d}:{mn:02d}" if h < 12 else candidate_am

    # Get all available slots from the doctor's schedule on this date
    try:
        shifts = appt_service.get_available_shifts(doctor_id, date_str)
        if not shifts:
            return None, f"Doctor is not available on {date_str}."

        # Collect all free slot start times
        all_slot_times = []
        for s in shifts:
            slots = appt_service.get_shift_slots(doctor_id, date_str, s['start'], s['end'])
            if slots:
                all_slot_times.extend([slot['start'] for slot in slots])

        if not all_slot_times:
            return None, f"All slots are booked on {date_str}."

        am_match = candidate_am in all_slot_times
        pm_match = candidate_pm in all_slot_times

        if am_match and not pm_match:
            logger.info(f"⏰ Resolved ambiguous '{time_text}' → {candidate_am} (AM shift available)")
            return candidate_am, None
        elif pm_match and not am_match:
            logger.info(f"⏰ Resolved ambiguous '{time_text}' → {candidate_pm} (PM shift available)")
            return candidate_pm, None
        elif am_match and pm_match:
            # Both available — default to the earlier one
            logger.info(f"⏰ Both {candidate_am} and {candidate_pm} available, defaulting to {candidate_am}")
            return candidate_am, None
        else:
            # Neither EXACT match is available. Look for closest matches in the same hour.
            # E.g. user said "9" but only "09:30" is available.
            am_prefix = f"{h:02d}:"
            pm_prefix = f"{(h + 12):02d}:" if h < 12 else am_prefix

            closest_am = next((t for t in all_slot_times if t.startswith(am_prefix)), None)
            closest_pm = next((t for t in all_slot_times if t.startswith(pm_prefix)), None)

            if closest_am and not closest_pm:
                return closest_am, None
            elif closest_pm and not closest_am:
                return closest_pm, None

            # Still no matches — suggest available alternatives to the AI
            return None, (
                f"Neither {candidate_am} nor {candidate_pm} is exactly available. "
                f"Available times: {', '.join(all_slot_times[:8])}."
            )
    except Exception as e:
        logger.error(f"Error resolving ambiguous time: {e}")
        # Final safety fallback
        return None, "Error checking availability."


def get_doctor_weekly_schedule(doctor_id: str, appt_service) -> str:
    """
    Get a doctor's weekly schedule from the database.
    Returns a formatted string showing which days and shifts the doctor works.
    """
    try:
        schedules = list(appt_service.db.doctor_schedules.find({
            'doctor_id': doctor_id,
            'is_available': True
        }))

        if not schedules:
            return "This doctor has no active schedule."

        from services.appointment_service import AppointmentService
        fmt = AppointmentService.format_time_ampm

        # Group by day
        by_day = {}
        for s in schedules:
            day = s.get('day_of_week', 'Unknown')
            start = fmt(s.get('start_time', '?'))
            end = fmt(s.get('end_time', '?'))
            by_day.setdefault(day, []).append(f"{start}–{end}")

        day_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        lines = []
        for day in day_order:
            if day in by_day:
                shifts_str = ', '.join(by_day[day])
                lines.append(f"- {day}: {shifts_str}")

        return '\n'.join(lines) if lines else "No schedule available."
    except Exception as e:
        logger.error(f"Error getting weekly schedule: {e}")
        return "Could not retrieve schedule."
