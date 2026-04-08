# email_service.py - Gmail SMTP Email Notifications

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from logger_config import logger

load_dotenv()

GMAIL_SENDER_EMAIL = os.getenv('GMAIL_SENDER_EMAIL', '')
GMAIL_APP_PASSWORD = os.getenv('GMAIL_APP_PASSWORD', '')
HOSPITAL_NAME = os.getenv('HOSPITAL_NAME', 'Hospital')


class EmailService:
    """Handles all outbound email notifications via Gmail SMTP."""

    @staticmethod
    def send_email(to, subject, html_body):
        """
        Send an HTML email via Gmail SMTP.
        Returns True on success, False on failure.
        """
        if not GMAIL_SENDER_EMAIL or not GMAIL_APP_PASSWORD:
            logger.warning("Email not configured — GMAIL_SENDER_EMAIL or GMAIL_APP_PASSWORD missing in .env")
            return False

        msg = MIMEMultipart('alternative')
        msg['From'] = f"{HOSPITAL_NAME} <{GMAIL_SENDER_EMAIL}>"
        msg['To'] = to
        msg['Subject'] = subject
        msg.attach(MIMEText(html_body, 'html'))

        try:
            with smtplib.SMTP('smtp.gmail.com', 587) as server:
                server.starttls()
                server.login(GMAIL_SENDER_EMAIL, GMAIL_APP_PASSWORD)
                server.send_message(msg)

            logger.info(f"Email sent to {to}: {subject}")
            return True
        except smtplib.SMTPAuthenticationError:
            logger.error("Gmail authentication failed — check GMAIL_SENDER_EMAIL and GMAIL_APP_PASSWORD in .env")
            return False
        except Exception as e:
            logger.error(f"Email send error: {e}")
            return False

    @staticmethod
    def send_po_notification(vendor_email, vendor_name, po_data, items):
        """
        Send a professional PO acceptance email to the vendor.
        Called after admin selects a quotation and creates a PO.
        """
        po_number = po_data.get('po_number', po_data.get('po_id', 'N/A'))
        total_amount = po_data.get('total_amount', 0)
        expected_delivery = po_data.get('expected_delivery', 'To be confirmed')
        department = po_data.get('department', '')

        # Build items table rows
        items_rows = ""
        for item in items:
            items_rows += f"""
            <tr>
                <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb;">{item.get('item_name', '')}</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; text-align: center;">{item.get('quantity', 0)}</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; text-align: right;">₹{item.get('unit_price', 0):,.2f}</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; text-align: right;">₹{item.get('total', 0):,.2f}</td>
            </tr>
            """

        subject = f"Purchase Order #{po_number} — Your Quotation Has Been Accepted"

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f3f4f6;">
            <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

                <!-- Header -->
                <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 28px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 22px;"> {HOSPITAL_NAME}</h1>
                    <p style="color: #bfdbfe; margin: 6px 0 0; font-size: 14px;">Purchase Order Notification</p>
                </div>

                <!-- Body -->
                <div style="padding: 28px 24px;">
                    <p style="font-size: 16px; color: #1f2937;">Dear <strong>{vendor_name}</strong>,</p>

                    <p style="font-size: 15px; color: #374151; line-height: 1.6;">
                        We are pleased to inform you that your quotation has been <strong style="color: #16a34a;">accepted</strong>.
                        A Purchase Order has been created with the following details:
                    </p>

                    <!-- PO Summary -->
                    <div style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 14px 18px; border-radius: 4px; margin: 18px 0;">
                        <p style="margin: 4px 0; color: #1e40af;"><strong>PO Number:</strong> {po_number}</p>
                        <p style="margin: 4px 0; color: #1e40af;"><strong>Department:</strong> {department or 'N/A'}</p>
                        <p style="margin: 4px 0; color: #1e40af;"><strong>Expected Delivery:</strong> {expected_delivery or 'To be confirmed'}</p>
                    </div>

                    <!-- Items Table -->
                    <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px;">
                        <thead>
                            <tr style="background: #f9fafb;">
                                <th style="padding: 10px 14px; text-align: left; border-bottom: 2px solid #e5e7eb; color: #6b7280;">Item</th>
                                <th style="padding: 10px 14px; text-align: center; border-bottom: 2px solid #e5e7eb; color: #6b7280;">Qty</th>
                                <th style="padding: 10px 14px; text-align: right; border-bottom: 2px solid #e5e7eb; color: #6b7280;">Unit Price</th>
                                <th style="padding: 10px 14px; text-align: right; border-bottom: 2px solid #e5e7eb; color: #6b7280;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items_rows}
                        </tbody>
                        <tfoot>
                            <tr style="background: #f0fdf4;">
                                <td colspan="3" style="padding: 12px 14px; text-align: right; font-weight: bold; color: #1f2937;">Grand Total:</td>
                                <td style="padding: 12px 14px; text-align: right; font-weight: bold; color: #16a34a; font-size: 16px;">₹{total_amount:,.2f}</td>
                            </tr>
                        </tfoot>
                    </table>

                    <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">
                        Please log in to your vendor portal to acknowledge this Purchase Order and update delivery status.
                    </p>
                </div>

                <!-- Footer -->
                <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                        This is an automated notification from {HOSPITAL_NAME}. Please do not reply to this email.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

        return EmailService.send_email(vendor_email, subject, html_body)

    @staticmethod
    def send_appointment_confirmation(to_email, patient_name, doctor_name, date, time, appointment_id):
        """
        Send appointment confirmation email after doctor approval.
        Returns True on success, False on failure.
        """
        subject = f"✅ Appointment Confirmed — {date} at {time}"

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f3f4f6;">
            <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

                <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 28px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 22px;">✅ Appointment Confirmed</h1>
                    <p style="color: #d1fae5; margin: 6px 0 0; font-size: 14px;">{HOSPITAL_NAME}</p>
                </div>

                <div style="padding: 28px 24px;">
                    <p style="font-size: 16px; color: #1f2937;">Dear <strong>{patient_name}</strong>,</p>

                    <p style="font-size: 15px; color: #374151; line-height: 1.6;">
                        Your appointment has been <strong style="color: #059669;">confirmed</strong>. Here are the details:
                    </p>

                    <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 4px; margin: 18px 0;">
                        <p style="margin: 4px 0; color: #065f46;"><strong>🆔 Appointment ID:</strong> {appointment_id}</p>
                        <p style="margin: 4px 0; color: #065f46;"><strong>👨‍⚕️ Doctor:</strong> Dr. {doctor_name}</p>
                        <p style="margin: 4px 0; color: #065f46;"><strong>📅 Date:</strong> {date}</p>
                        <p style="margin: 4px 0; color: #065f46;"><strong>🕐 Time:</strong> {time}</p>
                    </div>

                    <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">
                        Please arrive <strong>10 minutes early</strong>. If you need to reschedule, contact us via WhatsApp or phone.
                    </p>
                </div>

                <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                        This is an automated notification from {HOSPITAL_NAME}.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

        return EmailService.send_email(to_email, subject, html_body)

    @staticmethod
    def send_appointment_reminder(to_email, patient_name, doctor_name, date, time, appointment_id):
        """
        Send appointment reminder email (e.g., 24 hours before).
        Returns True on success, False on failure.
        """
        subject = f"⏰ Appointment Reminder — Tomorrow at {time}"

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f3f4f6;">
            <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

                <div style="background: linear-gradient(135deg, #d97706, #f59e0b); padding: 28px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 22px;">⏰ Appointment Reminder</h1>
                    <p style="color: #fef3c7; margin: 6px 0 0; font-size: 14px;">{HOSPITAL_NAME}</p>
                </div>

                <div style="padding: 28px 24px;">
                    <p style="font-size: 16px; color: #1f2937;">Dear <strong>{patient_name}</strong>,</p>

                    <p style="font-size: 15px; color: #374151; line-height: 1.6;">
                        This is a friendly reminder about your upcoming appointment:
                    </p>

                    <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 18px; border-radius: 4px; margin: 18px 0;">
                        <p style="margin: 4px 0; color: #92400e;"><strong>🆔 Appointment ID:</strong> {appointment_id}</p>
                        <p style="margin: 4px 0; color: #92400e;"><strong>👨‍⚕️ Doctor:</strong> Dr. {doctor_name}</p>
                        <p style="margin: 4px 0; color: #92400e;"><strong>📅 Date:</strong> {date}</p>
                        <p style="margin: 4px 0; color: #92400e;"><strong>🕐 Time:</strong> {time}</p>
                    </div>

                    <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">
                        Please arrive <strong>10 minutes early</strong>. If you cannot attend, please cancel or reschedule in advance.
                    </p>
                </div>

                <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                        This is an automated reminder from {HOSPITAL_NAME}.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

        return EmailService.send_email(to_email, subject, html_body)

