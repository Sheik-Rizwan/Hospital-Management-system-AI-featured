# reminder_jobs.py — Background Scheduler for Appointment Reminders
# Sends WhatsApp + Email reminders 24 hours before confirmed appointments

from datetime import datetime, timedelta
from logger_config import logger

_scheduler = None


def start_reminder_scheduler(app):
    """
    Initialize and start the APScheduler background job.
    Runs every 30 minutes to check for upcoming appointments.
    """
    global _scheduler
    if _scheduler is not None:
        return  # Already running

    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        _scheduler = BackgroundScheduler(daemon=True)
        _scheduler.add_job(
            func=_check_and_send_reminders,
            trigger='interval',
            minutes=30,
            id='appointment_reminders',
            name='Send appointment reminders',
            replace_existing=True,
            kwargs={'app': app}
        )
        _scheduler.start()
        logger.info("Appointment reminder scheduler started (runs every 30 minutes)")
    except ImportError:
        logger.warning("APScheduler not installed — reminder jobs disabled")
    except Exception as e:
        logger.error(f"Failed to start reminder scheduler: {e}")


def _check_and_send_reminders(app=None):
    """
    Check for confirmed appointments in the next 24 hours
    that haven't had a reminder sent yet.
    """
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()

        now = datetime.now()
        tomorrow = now + timedelta(hours=24)

        # Query: confirmed appointments within next 24 hours, reminder not yet sent
        upcoming = list(db.db.appointments.find({
            'status': 'confirmed',
            'date': {
                '$gte': now.strftime('%Y-%m-%d'),
                '$lte': tomorrow.strftime('%Y-%m-%d')
            },
            'reminder_sent': {'$ne': True}
        }))

        if not upcoming:
            return

        logger.info(f"Found {len(upcoming)} appointments needing reminders")

        for appointment in upcoming:
            _send_reminder_for_appointment(appointment, db)

    except Exception as e:
        logger.error(f"Reminder check error: {e}")


def _send_reminder_for_appointment(appointment, db):
    """Send WhatsApp and Email reminders for a single appointment."""
    appointment_id = appointment.get('appointment_id', '')
    patient_id = appointment.get('patient_id', '')
    doctor_id = appointment.get('doctor_id', '')
    appt_date = appointment.get('date', '')
    appt_time = appointment.get('start_time', '')
    patient_name = appointment.get('patient_name', 'Patient')

    # Get doctor name
    doctor = db.doctors.find_one({'user_id': doctor_id}, {'full_name': 1, '_id': 0})
    doctor_name = doctor.get('full_name', 'Doctor') if doctor else 'Doctor'

    # Get patient contact info
    patient = db.patients.find_one({'patient_id': patient_id})
    patient_phone = patient.get('phone', '') if patient else ''
    patient_email = patient.get('email', '') if patient else ''

    sent_any = False

    # 1. WhatsApp Reminder
    if patient_phone:
        try:
            from services.notification_service import NotificationService
            from services.appointment_service import AppointmentService
            spoken_time = AppointmentService.format_time_ampm(appt_time)
            reminder_msg = (
                f"Appointment Reminder\n\n"
                f"Dear {patient_name},\n"
                f"This is a reminder for your appointment:\n"
                f"Doctor: Dr. {doctor_name}\n"
                f"🗓️ Date: {appt_date}\n"
                f"Time: {spoken_time}\n\n"
                f"Please arrive 10 minutes early."
            )
            NotificationService.send_whatsapp_text(patient_phone, reminder_msg)
            logger.info(f"WhatsApp reminder sent to {patient_phone} for {appointment_id}")
            sent_any = True
        except Exception as e:
            logger.warning(f"WhatsApp reminder failed for {appointment_id}: {e}")

    # 2. Email Reminder
    if patient_email:
        try:
            from services.email_service import EmailService
            from services.appointment_service import AppointmentService
            spoken_time = AppointmentService.format_time_ampm(appt_time)
            EmailService.send_appointment_reminder(
                patient_email, patient_name, doctor_name,
                appt_date, spoken_time, appointment_id
            )
            logger.info(f"Email reminder sent to {patient_email} for {appointment_id}")
            sent_any = True
        except Exception as e:
            logger.warning(f"Email reminder failed for {appointment_id}: {e}")

    # Mark reminder as sent to avoid duplicates
    if sent_any:
        try:
            db.db.appointments.update_one(
                {'appointment_id': appointment_id},
                {'$set': {'reminder_sent': True, 'reminder_sent_at': datetime.now()}}
            )
        except Exception as e:
            logger.warning(f"Failed to mark reminder_sent for {appointment_id}: {e}")
