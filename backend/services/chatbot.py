# chatbot.py - Fixed version

import json
from .groq_client import get_client
from .prompts import CHATBOT_PROMPT_TEMPLATE
from config.settings import MODEL_NAME, GENERATION_CONFIG

client = get_client()

def ask_handoff_chatbot(structured_report: dict, question: str) -> str:
    """Answer questions about the patient handoff report."""
    prompt = CHATBOT_PROMPT_TEMPLATE.format(
        report=json.dumps(structured_report, indent=2),
        question=question
    )
    
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "user", "content": prompt}
            ],
            temperature=GENERATION_CONFIG["temperature"],
            max_tokens=GENERATION_CONFIG["max_tokens"],
            top_p=GENERATION_CONFIG["top_p"]
        )
        # Fixed: Access the correct attribute
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"Error: Unable to generate response. {str(e)}"

def ask_nurse_assistant(context: str, question: str) -> str:
    """Answer general questions for the nurse based on patient context."""
    prompt = f"""
You are a helpful nursing assistant. Use the following patient context to answer the nurse's question.

Patient Context:
{context}

Question: {question}

Provide a concise, clinical, and helpful answer.
"""
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "user", "content": prompt}],
            temperature=GENERATION_CONFIG["temperature"],
            max_tokens=GENERATION_CONFIG["max_tokens"],
            top_p=GENERATION_CONFIG["top_p"]
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"Error: Unable to generate response. {str(e)}"