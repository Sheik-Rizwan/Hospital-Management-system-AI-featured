
import os
import requests
import json
from dotenv import load_dotenv
from logger_config import logger

load_dotenv()

WHATSAPP_TOKEN = os.getenv('WHATSAPP_TOKEN')
PHONE_NUMBER_ID = os.getenv('PHONE_NUMBER_ID')

class NotificationService:
    """
    Handles all outbound notifications via WhatsApp Cloud API.
    """

    @staticmethod
    def send_whatsapp_text(to, body):
        """Send a simple text message."""
        NotificationService._send_meta_request(to, "text", {"body": body})

    @staticmethod
    def send_whatsapp_buttons(to, body, buttons, button_ids=None):
        """
        Send a message with up to 3 buttons.
        buttons: List of strings (max 3)
        button_ids: Optional list of custom IDs.
        Returns: List of button IDs used.
        """
        if button_ids and len(button_ids) == len(buttons):
            ids = button_ids
        else:
            ids = [f"btn_{i}" for i in range(len(buttons))]
            
        rows = [{"type": "reply", "reply": {"id": ids[i], "title": b[:20]}} for i, b in enumerate(buttons[:3])]
        NotificationService._send_meta_request(to, "interactive", {
            "type": "button",
            "body": {"text": body},
            "action": {"buttons": rows}
        })
        return ids

    @staticmethod
    def send_whatsapp_list(to, body, items, title="Options", button_text="Select"):
        """
        Send a list message (menu).
        items: List of tuples (id, title, description[optional])
        WhatsApp hard limit: 10 rows total per list message.
        Items beyond 10 are silently dropped.
        """
        rows = []
        for item_id, item_title, *desc in items[:10]:  # WhatsApp max 10 rows
            row = {"id": item_id, "title": item_title[:24]}
            if desc:
                row["description"] = desc[0][:72]
            rows.append(row)

        NotificationService._send_meta_request(to, "interactive", {
            "type": "list",
            "body": {"text": body},
            "action": {
                "button": button_text,
                "sections": [{"title": title[:24], "rows": rows}]
            }
        })

    @staticmethod
    def notify_appointment_approved(to, patient_name, date, time, doctor_name):
        """Send approval notification."""
        msg = (
            f"✅ Appointment Confirmed!\n\n"
            f"Dear {patient_name},\n"
            f"Your appointment with Dr. {doctor_name} is confirmed.\n"
            f"📅 Date: {date}\n"
            f"⏰ Time: {time}\n\n"
            f"Please arrive 10 minutes early."
        )
        NotificationService.send_whatsapp_text(to, msg)

    @staticmethod
    def notify_appointment_rejected(to, patient_name, date, time, doctor_name, reason=""):
        """Send rejection notification."""
        msg = (
            f"❌ Appointment Update\n\n"
            f"Dear {patient_name},\n"
            f"Your appointment request with Dr. {doctor_name} for {date} at {time} could not be confirmed.\n"
            f"Reason: {reason}\n\n"
            f"Please try booking another slot."
        )
        NotificationService.send_whatsapp_buttons(to, msg, ["Book Again"], ["book_appointment"])

    @staticmethod
    def _send_meta_request(to, type_str, payload_data):
        url = f"https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages"
        headers = {
            "Authorization": f"Bearer {WHATSAPP_TOKEN}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": type_str,
            type_str: payload_data
        }
        
        logger.info(f"NotificationService sending to {to}: {json.dumps(payload, default=str)}")
        
        try:
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()
            logger.info(f"Meta Response: {response.status_code}")
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"WhatsApp API Error: {e}")
            if e.response:
                logger.error(f"Response: {e.response.text}")
            return None
