import logging
import os
import json
from groq import Groq

logger = logging.getLogger(__name__)

try:
    from config.settings import GROQ_API_KEY, MODEL_NAME
except ImportError:
    # Fallback if config not found/circular import
    GROQ_API_KEY = os.getenv('GROQ_API_KEY')
    MODEL_NAME = "llama-3.3-70b-versatile"

class AIService:
    def __init__(self):
        self.client = Groq(api_key=GROQ_API_KEY)
        self.model = MODEL_NAME
        
        # Tools available to the LLM
        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "list_available_doctors",
                    "description": "List all doctors available on a given date, optionally filtered by specialization. Call this when the user asks 'which doctors are available', 'show me doctors', or wants to browse options before choosing. IMPORTANT: Only pass the 'date' parameter if the user explicitly mentioned a specific date. If the user did NOT mention any date, do NOT pass this parameter — just list all active doctors.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date": {
                                "type": "string",
                                "description": "The date in YYYY-MM-DD format, or natural language like 'tomorrow', 'Monday'. ONLY provide this if the user explicitly said a date. Do NOT assume or default to any date."
                            },
                            "specialization": {
                                "type": "string",
                                "description": "Filter by specialization e.g. 'Cardiology', 'Dentistry'. Optional."
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
                    "description": "Check available time slots for a specific doctor on a specific date. Returns list of free shifts and slots.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "doctor_name": {
                                "type": "string",
                                "description": "The name of the doctor (e.g., 'Dr. Smith' or just 'Smith')"
                            },
                            "specialization": {
                                "type": "string",
                                "description": "Optional specialization to disambiguate same-name doctors (e.g., 'Cardiology', 'Orthopedics')."
                            },
                            "date": {
                                "type": "string",
                                "description": "The date in YYYY-MM-DD format, or natural language like 'tomorrow', 'Monday'"
                            },
                            "time": {
                                "type": "string",
                                "description": "Specific time to check in HH:MM (24h) or natural language like '9am'. Omit to list all available slots."
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
                                "description": "The patient's full name, or 'self' if booking for themselves."
                            },
                            "doctor_name": {
                                "type": "string",
                                "description": "The doctor's name (e.g., 'Dr. Smith')"
                            },
                            "specialization": {
                                "type": "string",
                                "description": "Optional specialization to disambiguate same-name doctors (e.g., 'Cardiology', 'Orthopedics')."
                            },
                            "date": {
                                "type": "string",
                                "description": "The date in YYYY-MM-DD format, or natural language like 'tomorrow'"
                            },
                            "time": {
                                "type": "string",
                                "description": "The time in HH:MM (24h) format, e.g. '09:00'"
                            }
                        },
                        "required": ["patient_name", "doctor_name", "date", "time"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "list_my_appointments",
                    "description": "Get a list of the user's active appointments. Call this whenever the user asks to check, cancel, or reschedule an appointment.",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "cancel_appointment",
                    "description": "Cancel an existing appointment. YOU MUST ALWAYS call list_my_appointments first to get the correct appointment_id. Call this if the user asks to cancel, or BEFORE booking a new appointment if they ask to reschedule.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "appointment_id": {
                                "type": "string",
                                "description": "The exact appointment ID from list_my_appointments (e.g. 'APT-12345678')."
                            },
                            "reason": {
                                "type": "string",
                                "description": "Reason for cancellation, e.g. 'Cancelled by patient for rescheduling'"
                            }
                        },
                        "required": ["appointment_id"]
                    }
                }
            }
        ]
        
        self.system_prompt = """You are a smart, friendly hospital booking assistant on WhatsApp.

Your job is to help patients book appointments quickly and efficiently.

CORE RULES:
1. Be ultra-concise — this is WhatsApp, not email. 1-3 lines max per reply.
2. Understand natural language dates: "tomorrow", "Monday", "next week", "day after tomorrow", "Feb 21" — pass them as-is to tools, they handle resolution.
3. STEP-BY-STEP BOOKING: Guide the user through booking one step at a time. First identify the doctor, then ask for the date, then check availability to show real slots, then confirm and book. NEVER skip steps or assume information.
   CRITICAL: NEVER assume, guess, or infer a date that the user did not explicitly mention. If the user says "I need an appointment" or "book appointment" without specifying a date, do NOT default to 'tomorrow' or any other date. Instead, ASK the user which date they prefer. Only use a date in tool calls if the user explicitly stated one.
4. When user asks "which doctors are available [date]" or "show me doctors", call list_available_doctors(date) right away. Do NOT just list from context.
5. When user picks a doctor, call check_availability to show real available slots from the database.
6. Never make up time slots — always call check_availability first, show the real slots from the result.
7. Patient name: if the user is registered, use their name from context. Only ask for name when booking for someone else.
8. After booking, confirm briefly: " Done! Appointment booked for [name] with Dr. [X] on [date] at [time]."
9. If a slot is unavailable, suggest alternatives from check_availability output.
10. You may call multiple tools in sequence — check availability, then book — in the same turn.
11. NEVER output raw function call syntax like <function=name>{}</function>. Always use the proper tool calling mechanism.
12. IF RESCHEDULING: 
    - A reschedule means cancelling the old appointment and booking a new one.
    - FIRST, call `list_my_appointments` to find their active appointments.
    - If they have multiple, ask the user WHICH appointment they want to reschedule.
    - Gather the new Date/Time and check availability.
    - Once the new slot is agreed upon, call `cancel_appointment` with the old appointment ID and reason "Cancelled by patient for rescheduling".
    - THEN call `book_appointment` for the new slot.

SLOT-FILLING RULES — Collect these 5 fields before booking:
1. Patient name — use registered name from context if booking for self. Only ask if booking for someone else.
2. Specialist or Doctor name — user may say a specialty like "cardiologist" or a direct name like "Dr. Ali". If specialty, call list_available_doctors to find matches.
3. Doctor name — must be resolved to a specific doctor.
4. Date — MUST be a future date. NEVER assume or fill in a date the user did not say. If the user hasn't mentioned a date, ASK them. If user says 'today', say 'Same-day bookings are not available, please choose from tomorrow onwards.' If user gives a past date, say 'That date has already passed, pick a date from tomorrow onwards.'
5. Time — CRITICAL TIME RULES:
   - Convert spoken times to 24-hour HH:MM format BEFORE calling any tool.
   - 'X and a half' means X:30 (e.g. '6 and a half' = '6:30', '9 and a half' = '9:30').
   - 'half past X' means X:30 (e.g. 'half past 6' = '6:30').
   - 'quarter past X' means X:15, 'quarter to X' means (X-1):45.
   - ALWAYS consider AM/PM context: 'evening'/'sham'/'night' = PM, 'morning'/'subah' = AM.
   - '6 in the evening' = '18:00', NOT '06:00'. '6 and a half in the evening' = '18:30'.
   - '9 in the morning' = '09:00'. '3 in the afternoon' = '15:00'.
   - If user says just '2:30' without AM/PM, pass it to check_availability — it will auto-resolve.
   - If time is vague like just 'morning' with no number, ask for specific time.
   - NEVER guess or approximate times. Always pass the EXACT time the user said.

SMART COLLECTION:
- Extract ONLY fields the user explicitly mentioned. Never assume or infer missing fields.
- Only ask for ONE missing field at a time, in priority: doctor  date  time  patient name.
- If the user provides all fields EXCEPT one, ASK for that specific missing field. Never skip it.
- Once all fields are collected, call check_availability first, then book_appointment if the slot is confirmed available.
- NEVER call book_appointment without first confirming the slot exists via check_availability.

NEVER SUGGEST TIMES: Do NOT say "Can I book 10 AM for you?" or "How about the 9:30 slot?". Only SHOW the available slots from check_availability and ask "What time works for you?". Let the user pick their own slot. Never recommend or push a specific time.

DUPLICATE DOCTOR NAMES: If the tool returns "Multiple doctors match", present EACH doctor with their specialization clearly. Say something like: "There are 2 doctors named Dr. X — one in Cardiology and one in Orthopedics. Which specialization do you need?" Never silently pick one.

MANDATORY CONFIRMATION: Before calling book_appointment, you MUST read all details aloud and ask the user to confirm. Say: "Let me confirm — appointment for [name] with Doctor [name] ([specialization]) on [date] at [time]. Should I go ahead and book this?" Only call book_appointment AFTER the user says yes, confirm, or an equivalent in their language (haan, avunu, haudu, jee, etc.).

VOICE NOTES: If this is a voice conversation, avoid markdown symbols (* # etc). Speak naturally.

MULTILINGUAL: Detect the user's language from their message. If the user writes in Hindi, Telugu, or Kannada, respond in THAT SAME language. Keep doctor names, dates (YYYY-MM-DD), times (HH:MM), and appointment IDs in English, but write all conversational text in the user's language. If the user writes in English, respond in English. If Romanized Hindi (e.g. 'mujhe appointment chahiye'), respond in Hindi script.

CODE-MIXED LANGUAGE (very common in India — handle naturally):
- HINGLISH (Hindi + English): If user says "appointment book karo kal 10 baje", respond in same mixed style: "Dr. Sharma ka appointment kal 10 AM pe book karte hain."
  Markers: "karo", "karna", "chahiye", "baje", "wala", "ka", "ke", "se", "milna", "dikhao"
- TELGLISH (Telugu + English): If user says "appointment book cheyandi repu 10 gantalaku", respond: "Dr. Rao tho repu 10 AM ki appointment book chesthanu."
  Markers: "kavali", "cheyandi", "chesi", "chudandi", "vellali", "undha"
- KANGLISH (Kannada + English): If user says "appointment book maadi naale 10 gantege", respond: "Dr. Patil avara appointment naale 10 AM ge book maadtini."
  Markers: "beku", "maadi", "maadkodi", "hogbeku", "torisi", "heli"

Match the user's code-mixed style — don't switch to pure script if they are using Romanized words."""

    def process_conversation(self, messages: list, available_services: list = None, available_doctors: list = None, tool_callback=None) -> str:
        """
        Process a list of conversation messages (role/content dicts) and return the AI's response.
        If the AI decides to call a tool, it will execute the tool_callback and continue the generation.
        
        tool_callback should follow the signature:
        def tool_callback(tool_name: str, tool_args: dict) -> str
        """
        
        # Inject system prompt at the beginning
        chat_messages = [{"role": "system", "content": self.system_prompt}]
        
        # Inject contextual definitions
        context_str = "Context Settings:\n"
        if available_services:
            context_str += f"Available Services: {', '.join(available_services)}\n"
        if available_doctors:
            context_str += f"Available Doctors: {', '.join(available_doctors)}\n"
            
        if available_services or available_doctors:
             chat_messages.append({"role": "system", "content": context_str})
             
        # Add the conversation history
        chat_messages.extend(messages)
        
        try:
            # 1. Initial LLM call
            response = self.client.chat.completions.create(
                model=self.model,
                messages=chat_messages,
                tools=self.tools,
                tool_choice="auto",
                temperature=0.3,
                max_tokens=256
            )
            
            response_message = response.choices[0].message
            
            # 2. Check if LLM wanted to call a tool
            if response_message.tool_calls:
                chat_messages.append(response_message)
                
                # Execute all requested tool calls
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    
                    logger.info(f"AI called tool: {function_name} with {function_args}")
                    
                    if tool_callback:
                        # The callback handles the actual database check and returns a string
                        tool_result = tool_callback(function_name, function_args)
                    else:
                        tool_result = f"Error: No tool execution callback provided for {function_name}."
                        
                    # Add tool result to conversation history
                    chat_messages.append({
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": tool_result,
                    })
                    
                # 3. Call LLM again with the tool output so it can formulate a final answer
                final_response = self.client.chat.completions.create(
                    model=self.model,
                    messages=chat_messages,
                    temperature=0.3,
                    max_tokens=256
                )
                
                return self._strip_leaked_function_calls(final_response.choices[0].message.content.strip())
                
            # If no tool calls, just return the text response
            return self._strip_leaked_function_calls(response_message.content.strip())
            
        except Exception as e:
            logger.error(f"Conversation Processing Error: {e}")
            return "I'm having a little trouble connecting right now. Can we try again in a moment?"
            
    def _strip_leaked_function_calls(self, text: str) -> str:
        """
        Remove any raw function call syntax that the model outputs as text
        instead of using the structured tool_calls mechanism.
        E.g. <function=check_availability>{"doctor":"Dr. X"}</function>
        """
        import re
        # Remove <function=name>{...}</function> patterns
        cleaned = re.sub(r'<function=[^>]+>\s*\{[^}]*\}\s*</function>', '', text)
        # Remove any remaining <function=...> tags without proper JSON
        cleaned = re.sub(r'<function=[^>]*>[^<]*</function>', '', cleaned)
        # Clean up extra whitespace left behind
        cleaned = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned).strip()
        if cleaned != text:
            logger.info(f" Stripped leaked function call syntax from AI response")
        return cleaned if cleaned else "How can I help you with your appointment?"

    # Keep the old extraction functions for backward compatibility with other features for now
    def structure_handoff_text(self, raw_text: str) -> dict:
        """
        Converts raw handoff text into a structured JSON format:
        {
            "vitals": "...",
            "observation": "...",
            "recommendation": "..."
        }
        """
        prompt = f"""
        You are a medical AI assistant. Your task is to extract and structure the following raw nurse handoff text into three distinct sections:
        1. Vitals
        2. Observation
        3. Recommendation

        Return the output STRICTLY as a JSON object without hallucinationsas as from raw data  with keys "vitals", "observation", and "recommendation".
        Do not include any markdown formatting (like ```json), just the raw JSON string.
        Format the values to be clean and readable (using bullet points or newlines if necessary).

        Raw Text:
        "{raw_text}"
        """

        try:
            completion = self.client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a helpful medical assistant that structures clinical notes."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                model=self.model,
                temperature=0.1,
            )
            
            response_text = completion.choices[0].message.content.strip()
            
            if response_text.startswith("```json"):
                response_text = response_text.replace("```json", "").replace("```", "")
            
            return json.loads(response_text)

        except Exception as e:
            logger.error(f"Error structuring handoff: {e}")
            return {
                "vitals": "See raw text",
                "observation": raw_text,
                "recommendation": "See raw text"
            }

    def extract_booking_intent(self, text: str, available_services: list = None, available_doctors: list = None) -> dict:
        """Legacy Intent Extractor - being phased out in favor of process_conversation."""
        # Intentionally passing through basic functionality for now.
        return {"intent": "unknown", "for_whom": None, "entities": {}}

