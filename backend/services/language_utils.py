# language_utils.py — Auto-detect language from text using Unicode script analysis
# Supports: Hindi (hi), Telugu (te), Kannada (kn), Tamil (ta), Urdu (ur), English (en)

import logging
import re

logger = logging.getLogger(__name__)

# Unicode block ranges for Indian scripts
SCRIPT_RANGES = {
    'hi': [  # Devanagari
        (0x0900, 0x097F),  # Devanagari
        (0xA8E0, 0xA8FF),  # Devanagari Extended
    ],
    'te': [  # Telugu
        (0x0C00, 0x0C7F),  # Telugu
    ],
    'kn': [  # Kannada
        (0x0C80, 0x0CFF),  # Kannada
    ],
    'ta': [  # Tamil
        (0x0B80, 0x0BFF),  # Tamil
    ],
    'ur': [  # Urdu (Arabic script)
        (0x0600, 0x06FF),  # Arabic
        (0x0750, 0x077F),  # Arabic Supplement
        (0xFB50, 0xFDFF),  # Arabic Presentation Forms-A
        (0xFE70, 0xFEFF),  # Arabic Presentation Forms-B
    ],
}

# Language display names
LANGUAGE_NAMES = {
    'en': 'English',
    'hi': 'Hindi',
    'te': 'Telugu',
    'kn': 'Kannada',
    'ta': 'Tamil',
    'ur': 'Urdu',
}


def _count_script_chars(text: str) -> dict:
    """Count characters belonging to each script in the text."""
    counts = {lang: 0 for lang in SCRIPT_RANGES}
    latin_count = 0

    for char in text:
        cp = ord(char)

        # Skip whitespace, digits, punctuation
        if char.isspace() or char.isdigit() or cp < 0x40:
            continue

        matched = False
        for lang, ranges in SCRIPT_RANGES.items():
            for start, end in ranges:
                if start <= cp <= end:
                    counts[lang] += 1
                    matched = True
                    break
            if matched:
                break

        if not matched and 0x0041 <= cp <= 0x024F:  # Latin block
            latin_count += 1

    counts['en'] = latin_count
    return counts


def detect_language(text: str) -> str:
    """
    Detect the primary language of the given text using Unicode script analysis.

    Returns: 'hi', 'te', 'kn', 'ur', or 'en' (default).

    Logic:
    - Count characters in each Unicode script block.
    - The script with the most characters wins.
    - If no non-Latin characters are found, default to 'en'.
    - For mixed text (e.g., "book karna hai Dr. A ke saath"), the Indic
      script characters take precedence over Latin ones.
    """
    if not text or not text.strip():
        return 'en'

    counts = _count_script_chars(text)

    # Get the dominant Indic script (non-English)
    indic_langs = {k: v for k, v in counts.items() if k != 'en'}
    max_indic_lang = max(indic_langs, key=indic_langs.get) if indic_langs else None
    max_indic_count = indic_langs.get(max_indic_lang, 0) if max_indic_lang else 0

    # If any Indic script characters are found, prefer that language
    # (even a few Indic chars in mixed text indicate user's language preference)
    if max_indic_count >= 2:
        logger.info(f"🌐 Detected language: {LANGUAGE_NAMES.get(max_indic_lang, max_indic_lang)} "
                     f"({max_indic_count} chars)")
        return max_indic_lang

    # Check for Romanized Hindi/Urdu patterns (transliterated)
    romanized_patterns = _detect_romanized_hindi(text)
    if romanized_patterns:
        logger.info(f"🌐 Detected Romanized Hindi/Urdu from patterns")
        return 'hi'

    # Check for Romanized Telugu patterns
    if _detect_romanized_telugu(text):
        logger.info(f"🌐 Detected Romanized Telugu from patterns")
        return 'te'

    # Check for Romanized Kannada patterns
    if _detect_romanized_kannada(text):
        logger.info(f"🌐 Detected Romanized Kannada from patterns")
        return 'kn'

    # Check for Romanized Tamil patterns
    if _detect_romanized_tamil(text):
        logger.info(f"🌐 Detected Romanized Tamil from patterns")
        return 'ta'

    # Default to English
    return 'en'


def _detect_romanized_hindi(text: str) -> bool:
    """
    Detect Romanized Hindi/Hinglish from common patterns.
    E.g., "mujhe appointment chahiye", "kal doctor se milna hai", "book karna hai"
    """
    text_lower = text.lower()

    # Common Hindi words written in Latin script (Hinglish code-mixed patterns)
    hindi_markers = [
        r'\bmujhe\b', r'\bchahiye\b', r'\bkarna\b', r'\bhai\b',
        r'\bkal\b', r'\baaj\b', r'\bparson\b', r'\bkon\b',
        r'\bkab\b', r'\bkaise\b', r'\bkya\b', r'\bnahi\b',
        r'\bse\b', r'\bko\b', r'\bke\b', r'\bka\b', r'\bki\b',
        r'\bmeeting\b.*\b(karna|chahiye|hai)\b',
        r'\b(appointment|doctor|hospital)\b.*\b(chahiye|karna|hai|kar|karo|karwa|karao)\b',
        r'\bmilna\b', r'\bdikhao\b', r'\bbolo\b', r'\bbatao\b',
        r'\bbook\b.*\b(karo|karna|kar|kijiye|kar\s+do|karwa\s+do|karao)\b',
        r'\bsamay\b', r'\bwaqt\b', r'\bdin\b',
        r'\bsubah\b', r'\bsham\b', r'\bdopahar\b', r'\brat\b',
        # Hinglish booking phrases
        r'\bappointment\s+(fix|book)\s+karo\b',
        r'\b(book|fix)\s+kar\s+do\b',
        r'\bdoctor\s+(se|ke\s+paas)\s+(milna|milwa\s+do|jaana)\b',
        r'\bmilna\s+chahta\b', r'\bmilwa\s+do\b',
        r'\bslot\s+(dikhao|batao|available\s+hai)\b',
        r'\bfree\s+slot\s+kab\b', r'\btime\s+(kya|batao|dikhao)\s+hai\b',
        # Hinglish time words
        r'\bbaje\b', r'\bbajey\b', r'\bwale\s+din\b',
        r'\bsubah\s+wala\b', r'\bsham\s+wala\b', r'\bsham\s+ka\b',
        r'\bmorning\s+(ka|wala|wali)\b', r'\bevening\s+(ka|wala|wali)\b',
        r'\btarik\b', r'\btarikh\b', r'\btareekh\b',
        # Medical/booking context
        r'\bdawai\b', r'\bilaj\b', r'\bbimari\b', r'\bbukhar\b',
        r'\bdoctor\s+sahab\b', r'\bdoctor\s+saab\b',
        r'\bkitne\s+baje\b', r'\bshift\s+kab\b',
        r'\bcheck\s+up\s+(karwana|karna|chahiye)\b',
        r'\bjaanch\b', r'\btest\s+karwana\b',
        # Day names romanized
        r'\bsomvaar\b', r'\bmangalvaar\b', r'\bbudhvaar\b',
        r'\bguruvaar\b', r'\bshukravaar\b', r'\bshanivaar\b',
        r'\bravivaar\b', r'\bitvaar\b',
        r'\bagle\b', r'\bagla\b', r'\bpehle\b',
        # Specialty references (code-mixed)
        r'\b(heart|bone|eye|skin|pet)\s+ka\s+doctor\b',
        r'\bhaddi\b', r'\bdil\b', r'\bdaant\b', r'\baankh\b',
        r'\bnaak\b', r'\bgala\b', r'\bpet\b', r'\bsar\b',
        r'\bchehre\b', r'\bchamdi\b', r'\btwacha\b',
    ]

    match_count = 0
    for pattern in hindi_markers:
        if re.search(pattern, text_lower):
            match_count += 1
            if match_count >= 2:  # At least 2 Hindi markers to confirm
                return True

    return False


def _detect_romanized_telugu(text: str) -> bool:
    """
    Detect Romanized Telugu from common patterns.
    E.g., "repu doctor daggariki velali", "appointment kavali"
    """
    text_lower = text.lower()

    telugu_markers = [
        r'\bkavali\b', r'\bvelali\b', r'\bcheyali\b', r'\brandi\b',
        r'\brepu\b', r'\bellundi\b', r'\bnaku\b', r'\bmeeku\b',
        r'\bdaggariki\b', r'\beppudu\b', r'\benchakkani\b',
        r'\bchudandi\b', r'\bcheppandi\b', r'\bbooking\b.*\bkavali\b',
        r'\bdoctor\b.*\bkavali\b', r'\bsamayam\b', r'\budayam\b',
        r'\bsayantram\b', r'\bmuddu\b',
        r'\b(appointment|doctor)\b.*\b(kavali|cheyali|cheyandi|chesi)\b',
        # Telglish code-mixed patterns
        r'\bappointment\s+(book|fix)\s+cheyandi\b',
        r'\b(book|fix)\s+chesi\s+ivvandi\b',
        r'\bdoctor\s+daggariki\s+vellali\b',
        r'\bslot\s+(chudandi|cheppandi|available\s+undha)\b',
        r'\bfree\s+slot\s+eppudu\b', r'\btime\s+entha\b',
        # Telglish time words
        r'\bgantalu\b', r'\bgantalaku\b', r'\btariki\b', r'\btarikuna\b',
        r'\brasthundi\b', r'\bundhi\b', r'\bundha\b',
        r'\bmorning\s+(lo|slot)\b', r'\bevening\s+(lo|slot)\b',
        # Telglish specialty references
        r'\b(heart|bone|eye|skin)\s+doctor\s+kavali\b',
        r'\bkannu\s+doctor\b',
    ]

    match_count = 0
    for pattern in telugu_markers:
        if re.search(pattern, text_lower):
            match_count += 1
            if match_count >= 2:
                return True

    return False


def _detect_romanized_kannada(text: str) -> bool:
    """
    Detect Romanized Kannada from common patterns.
    E.g., "naale doctor hatira hogbeku", "appointment beku"
    """
    text_lower = text.lower()

    kannada_markers = [
        r'\bbeku\b', r'\bhogbeku\b', r'\bmaadu\b', r'\bbanni\b',
        r'\bnaale\b', r'\bnaadiddu\b', r'\bnanage\b', r'\bnimage\b',
        r'\bhatira\b', r'\byavaga\b', r'\bhege\b', r'\bhelu\b',
        r'\btorisi\b', r'\bheli\b', r'\bbelgge\b', r'\bsanje\b',
        r'\b(appointment|doctor)\b.*\b(beku|maadi|maadkodi)\b',
        # Kanglish code-mixed patterns
        r'\bappointment\s+(book|fix)\s+maadi\b',
        r'\b(book|fix)\s+maadkodi\b',
        r'\bdoctor\s+hatira\s+hogbeku\b',
        r'\bslot\s+(torisi|heli|available\s+idya)\b',
        r'\bfree\s+slot\s+yavaga\b', r'\btime\s+eshtu\b',
        # Kanglish time words
        r'\bgante\b', r'\bgantege\b', r'\btareeku\b',
        r'\bbaruttare\b', r'\bidya\b',
        r'\bmorning\s+(alli|slot)\b', r'\bevening\s+(alli|slot)\b',
        # Kanglish specialty references
        r'\b(heart|bone|eye|skin)\s+doctor\s+beku\b',
        r'\bkannu\s+doctor\b',
    ]

    match_count = 0
    for pattern in kannada_markers:
        if re.search(pattern, text_lower):
            match_count += 1
            if match_count >= 2:
                return True

    return False


def _detect_romanized_tamil(text: str) -> bool:
    """
    Detect Romanized Tamil from common patterns.
    E.g., "naalaikku doctor kitta poganum", "appointment venum"
    """
    text_lower = text.lower()

    tamil_markers = [
        r'\bvenum\b', r'\bvendum\b', r'\bpoganum\b', r'\bvaanga\b',
        r'\bnaalaikku\b', r'\bnaalai\b', r'\bnettru\b', r'\benakku\b',
        r'\bungalukku\b', r'\bkitta\b', r'\beppozhu\b', r'\beppo\b',
        r'\bpaaru\b', r'\bsollunga\b', r'\bkaalaila\b', r'\bmaalai\b',
        r'\birukku\b', r'\billa\b', r'\benna\b', r'\binga\b',
        r'\b(appointment|doctor)\b.*\b(venum|vendum|poganum|pannunga|pannu)\b',
        # Taminglish code-mixed patterns
        r'\bappointment\s+(book|fix)\s+pannunga\b',
        r'\b(book|fix)\s+pannunga\b',
        r'\bdoctor\s+kitta\s+poganum\b',
        r'\bslot\s+(paaru|sollunga|irukka)\b',
        r'\bfree\s+slot\s+eppo\b', r'\btime\s+enna\b',
        # Taminglish time words
        r'\bmani\b', r'\bmanikku\b', r'\bthethi\b', r'\bthariku\b',
        r'\bvaranga\b', r'\birukkiranga\b',
        r'\bmorning\s+(la|slot)\b', r'\bevening\s+(la|slot)\b',
        # Taminglish specialty references
        r'\b(heart|bone|eye|skin)\s+doctor\s+venum\b',
        r'\bkannu\s+doctor\b',
        # Tamil day names romanized
        r'\bthingal\b', r'\bsevvai\b', r'\bbudhan\b',
        r'\bviyazhan\b', r'\bvelli\b', r'\bsani\b', r'\bnyayiru\b',
        r'\bindru\b', r'\bagudha\b',
    ]

    match_count = 0
    for pattern in tamil_markers:
        if re.search(pattern, text_lower):
            match_count += 1
            if match_count >= 2:
                return True

    return False


def get_language_name(lang_code: str) -> str:
    """Get the display name for a language code."""
    return LANGUAGE_NAMES.get(lang_code, 'English')


def get_response_language_instruction(lang_code: str) -> str:
    """
    Generate a system prompt instruction telling the LLM which language to respond in.
    """
    if lang_code == 'en':
        return ""  # No extra instruction needed for English

    lang_name = LANGUAGE_NAMES.get(lang_code, 'English')
    return (
        f"\n\nIMPORTANT LANGUAGE INSTRUCTION: The user is communicating in {lang_name}. "
        f"You MUST respond in {lang_name}. "
        f"Keep doctor names, dates (YYYY-MM-DD), times (HH:MM), and medical terms in English, "
        f"but write ALL conversational text in {lang_name}. "
        f"If the user switches to English, switch back to English."
    )
