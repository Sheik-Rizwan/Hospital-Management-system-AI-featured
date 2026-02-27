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
                    "description": "List all doctors available on a given date, optionally filtered by specialization. Call this when the user asks 'which doctors are available', 'show me doctors', or wants to browse options before choosing.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date": {
                                "type": "string",
                                "description": "The date in YYYY-MM-DD format, or natural language like 'tomorrow', 'Monday', 'next week'. Leave empty to list all active doctors."
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
            }
        ]
        
        self.system_prompt = """You are a smart, friendly hospital booking assistant on WhatsApp.

Your job is to help patients book appointments quickly and efficiently.

CORE RULES:
1. Be ultra-concise — this is WhatsApp, not email. 1-3 lines max per reply.
2. Understand natural language dates: "tomorrow", "Monday", "next week", "day after tomorrow", "Feb 21" — pass them as-is to tools, they handle resolution.
3. SMART ONE-SHOT BOOKING: If the user's message contains doctor + date + time + patient name, call check_availability then book_appointment immediately — do NOT ask for info you already have.
4. When user asks "which doctors are available [date]" or "show me doctors", call list_available_doctors(date) right away. Do NOT just list from context.
5. When user picks a doctor, call check_availability to show real available slots from the database.
6. Never make up time slots — always call check_availability first, show the real slots from the result.
7. Patient name: if the user is registered, use their name from context. Only ask for name when booking for someone else.
8. After booking, confirm briefly: "✅ Done! Appointment booked for [name] with Dr. [X] on [date] at [time]."
9. If a slot is unavailable, suggest alternatives from check_availability output.
10. You may call multiple tools in sequence — check availability, then book — in the same turn.

VOICE NOTES: If this is a voice conversation, avoid markdown symbols (* # etc). Speak naturally."""

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
                
                return final_response.choices[0].message.content.strip()
                
            # If no tool calls, just return the text response
            return response_message.content.strip()
            
        except Exception as e:
            logger.error(f"Conversation Processing Error: {e}")
            return "I'm having a little trouble connecting right now. Can we try again in a moment?"
            
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

