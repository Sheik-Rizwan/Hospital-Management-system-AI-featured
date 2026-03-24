# sarvam_tools.py — Tool definitions for Sarvam AI appointment booking
# Extracted from sarvam_service.py for better modularity

BOOKING_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_available_doctors",
            "description": "List active doctors, optionally filtered by specialization and/or date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "Optional date in YYYY-MM-DD format or natural language like 'tomorrow'."
                    },
                    "specialization": {
                        "type": "string",
                        "description": "Optional specialization filter, e.g. Cardiology, Orthopedics."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_availability",
            "description": "Check doctor availability on a specific date. Returns available shifts and time slots. Always call this before booking.",
            "parameters": {
                "type": "object",
                "properties": {
                    "doctor_name": {
                        "type": "string",
                        "description": "The name of the doctor (e.g., 'Dr. Smith', 'Ali')"
                    },
                    "specialization": {
                        "type": "string",
                        "description": "Optional specialization to disambiguate same-name doctors (e.g., Cardiology, Orthopedics)."
                    },
                    "date": {
                        "type": "string",
                        "description": "The target date in YYYY-MM-DD format"
                    },
                    "time": {
                        "type": "string",
                        "description": "Optional specific time in HH:MM 24-hour format. If null, returns all available slots."
                    }
                },
                "required": ["doctor_name", "date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "book_appointment",
            "description": "Book an appointment for a patient with a doctor at a confirmed available date and time.",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_name": {
                        "type": "string",
                        "description": "The patient's name. Use 'self' if booking for themselves."
                    },
                    "doctor_name": {
                        "type": "string",
                        "description": "The name of the doctor"
                    },
                    "specialization": {
                        "type": "string",
                        "description": "Optional specialization to disambiguate same-name doctors (e.g., Cardiology, Orthopedics)."
                    },
                    "date": {
                        "type": "string",
                        "description": "The date in YYYY-MM-DD format"
                    },
                    "time": {
                        "type": "string",
                        "description": "The time in HH:MM 24-hour format"
                    }
                },
                "required": ["patient_name", "doctor_name", "date", "time"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "save_temporary_details",
            "description": "Save the patient's name or preferred date temporarily during the conversation. Call this whenever the user mentions their name or a date they prefer. Call again with a new date if the user wants to change it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_name": {
                        "type": "string",
                        "description": "The patient's name as stated by the user."
                    },
                    "date": {
                        "type": "string",
                        "description": "The user's preferred date in YYYY-MM-DD format or natural language like 'tomorrow', 'Monday'."
                    }
                },
                "required": []
            }
        }
    }
]

# Alias mapping for normalizing tool argument keys
TOOL_ARGUMENT_ALIASES = {
    'doctor': 'doctor_name',
    'doctorname': 'doctor_name',
    'doc': 'doctor_name',
    'patient': 'patient_name',
    'patientname': 'patient_name',
    'speciality': 'specialization',
    'specialization_name': 'specialization',
    'appointment_date': 'date',
    'slot': 'time',
    'slot_time': 'time',
    'timing': 'time',
}


def normalize_tool_argument_keys(function_name: str, args: dict) -> dict:
    """Map common alias keys to canonical tool schema keys."""
    if not isinstance(args, dict):
        return {}

    normalized = {}
    for key, value in args.items():
        key_str = str(key).strip()
        key_norm = TOOL_ARGUMENT_ALIASES.get(key_str.lower(), key_str)
        normalized[key_norm] = value

    return normalized
