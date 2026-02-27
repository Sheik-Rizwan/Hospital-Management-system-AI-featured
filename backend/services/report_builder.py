# report_builder.py

import json
import re
from .groq_client import get_client
from .prompts import STRUCTURED_REPORT_PROMPT
from config.settings import GENERATION_CONFIG, MODEL_NAME
import logging
logger = logging.getLogger(__name__)


client = get_client()

def build_structured_report(transcript: str) -> dict:
    """Convert unstructured nurse handoff transcript into structured JSON report."""
    prompt = STRUCTURED_REPORT_PROMPT + transcript
    
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
        
        response_text = response.choices[0].message.content.strip()
        
        # Robust JSON extraction: Find substrings between first '{' and last '}'
        try:
            start_index = response_text.find('{')
            end_index = response_text.rfind('}')
            
            if start_index != -1 and end_index != -1 and end_index > start_index:
                json_str = response_text[start_index : end_index + 1]
                structured_data = json.loads(json_str)
                return structured_data
            else:
                 # Fallback to direct load if no curly braces found (unlikely for valid JSON)
                structured_data = json.loads(response_text)
                return structured_data
        except Exception:
            # If substring extraction fails or json.loads fails on substring, try original text cleanup
            # Remove markdown code blocks if present
            clean_text = re.sub(r'^```json\s*', '', response_text)
            clean_text = re.sub(r'^```\s*', '', clean_text)
            clean_text = re.sub(r'\s*```$', '', clean_text)
            return json.loads(clean_text)
        
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON response: {e}")
        logger.info(f"Raw response: {response_text}")
        raise
    except Exception as e:
        logger.error(f"Error generating report: {e}")
        raise
