# google_calendar_service.py — Google Calendar API Integration
# Syncs confirmed appointments as Google Calendar events

import os
from datetime import datetime, timedelta
from logger_config import logger

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    GCAL_AVAILABLE = True
except ImportError:
    GCAL_AVAILABLE = False
    logger.warning("google-api-python-client or google-auth not installed. Google Calendar disabled.")

CREDENTIALS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'config', 'credentials.json')
CALENDAR_ID = os.getenv('GOOGLE_CALENDAR_ID', 'primary')
SCOPES = ['https://www.googleapis.com/auth/calendar']


class GoogleCalendarService:
    """Manages Google Calendar events for confirmed appointments."""

    def __init__(self):
        self._service = None
        self._initialized = False

    def _get_service(self):
        """Lazy-initialize the Google Calendar API client."""
        if self._service:
            return self._service

        if not GCAL_AVAILABLE:
            logger.warning("Google Calendar libraries not available")
            return None

        creds_path = os.path.normpath(CREDENTIALS_PATH)
        if not os.path.exists(creds_path):
            logger.warning(f"Google credentials not found at {creds_path} — Calendar sync disabled")
            return None

        try:
            credentials = service_account.Credentials.from_service_account_file(
                creds_path, scopes=SCOPES
            )
            self._service = build('calendar', 'v3', credentials=credentials, cache_discovery=False)
            self._initialized = True
            logger.info("Google Calendar service initialized")
            return self._service
        except Exception as e:
            logger.error(f"Google Calendar init failed: {e}")
            return None

    def is_available(self):
        """Check if the Google Calendar service is configured and ready."""
        return self._get_service() is not None

    def add_appointment_event(self, appointment):
        """
        Create a Google Calendar event for a confirmed appointment.

        Args:
            appointment: dict with keys:
                - appointment_id, patient_name, doctor_name
                - date (YYYY-MM-DD), start_time (HH:MM), end_time (HH:MM)

        Returns:
            calendar_event_id (str) or None on failure
        """
        service = self._get_service()
        if not service:
            return None

        try:
            date_str = appointment.get('date', '')
            start_time = appointment.get('start_time', '')
            end_time = appointment.get('end_time', '')
            patient_name = appointment.get('patient_name', 'Patient')
            doctor_name = appointment.get('doctor_name', 'Doctor')
            appointment_id = appointment.get('appointment_id', '')

            # Build datetime strings (IST timezone)
            start_dt = f"{date_str}T{start_time}:00"
            end_dt = f"{date_str}T{end_time}:00"

            event = {
                'summary': f"Appointment: {patient_name} with Dr. {doctor_name}",
                'description': (
                    f"Appointment ID: {appointment_id}\n"
                    f"Patient: {patient_name}\n"
                    f"Doctor: Dr. {doctor_name}\n"
                    f"Booked via Hospital Management System"
                ),
                'start': {
                    'dateTime': start_dt,
                    'timeZone': 'Asia/Kolkata',
                },
                'end': {
                    'dateTime': end_dt,
                    'timeZone': 'Asia/Kolkata',
                },
                'reminders': {
                    'useDefault': False,
                    'overrides': [
                        {'method': 'popup', 'minutes': 60},
                        {'method': 'popup', 'minutes': 15},
                    ],
                },
            }

            created_event = service.events().insert(
                calendarId=CALENDAR_ID,
                body=event
            ).execute()

            event_id = created_event.get('id', '')
            logger.info(f"Google Calendar event created: {event_id} for {appointment_id}")
            return event_id

        except Exception as e:
            logger.error(f"Google Calendar create event error: {e}")
            return None

    def delete_appointment_event(self, calendar_event_id):
        """
        Delete a Google Calendar event by its ID.

        Args:
            calendar_event_id: The Google Calendar event ID stored on the appointment

        Returns:
            True on success, False on failure
        """
        service = self._get_service()
        if not service or not calendar_event_id:
            return False

        try:
            service.events().delete(
                calendarId=CALENDAR_ID,
                eventId=calendar_event_id
            ).execute()

            logger.info(f"Google Calendar event deleted: {calendar_event_id}")
            return True

        except Exception as e:
            logger.error(f"Google Calendar delete event error: {e}")
            return False
