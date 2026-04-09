import os
import re
import sys
import unittest


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from services.whatsapp_service import WhatsAppService


class _StubAppointmentService:
    @staticmethod
    def _time_to_spoken(time_str):
        h, m = map(int, str(time_str).split(':'))
        period = 'AM' if h < 12 else 'PM'
        h12 = 12 if h % 12 == 0 else h % 12
        return f"{h12}:{m:02d} {period}"

    @staticmethod
    def format_time_ampm(time_str):
        return _StubAppointmentService._time_to_spoken(time_str)


class _StubNotifier:
    def __init__(self):
        self.text_messages = []
        self.list_messages = []

    def send_whatsapp_text(self, sender_id, message):
        self.text_messages.append({
            'sender_id': sender_id,
            'message': message,
        })

    def send_whatsapp_list(self, sender_id, header, items, title=None, button_text=None):
        self.list_messages.append({
            'sender_id': sender_id,
            'header': header,
            'items': items,
            'title': title,
            'button_text': button_text,
        })


class WhatsAppHybridSlotOrderingTests(unittest.TestCase):
    def setUp(self):
        self.service = WhatsAppService.__new__(WhatsAppService)
        self.service.appt_service = _StubAppointmentService()
        self.service.notifier = _StubNotifier()

    def test_overnight_slots_preserve_shift_sequence_and_slot_index_mapping(self):
        # 22:00 -> 07:00 night shift with 45-minute slots (12 slots)
        slots = [
            {'start': '22:00', 'end': '22:45'},
            {'start': '22:45', 'end': '23:30'},
            {'start': '23:30', 'end': '00:15'},
            {'start': '00:15', 'end': '01:00', 'next_day': True},
            {'start': '01:00', 'end': '01:45', 'next_day': True},
            {'start': '01:45', 'end': '02:30', 'next_day': True},
            {'start': '02:30', 'end': '03:15', 'next_day': True},
            {'start': '03:15', 'end': '04:00', 'next_day': True},
            {'start': '04:00', 'end': '04:45', 'next_day': True},
            {'start': '04:45', 'end': '05:30', 'next_day': True},
            {'start': '05:30', 'end': '06:15', 'next_day': True},
            {'start': '06:15', 'end': '07:00', 'next_day': True},
        ]

        session_data = {}

        self.service._send_hybrid_slots(
            sender_id='919999999999',
            slots=slots,
            shift_name='Night',
            doctor_name='Chaman',
            date_str='2026-03-19',
            session_data=session_data,
        )

        # Slot-number mapping must follow the same sequence shown to the user.
        slot_map = session_data.get('hybrid_slot_selection', {}).get('slot_map', {})
        self.assertEqual(slot_map.get('1'), '22:00')
        self.assertEqual(slot_map.get('2'), '22:45')
        self.assertEqual(slot_map.get('3'), '23:30')
        self.assertEqual(slot_map.get('11'), '05:30')
        self.assertEqual(slot_map.get('12'), '06:15')

        # Full text list should keep PM slots first, then post-midnight AM slots.
        self.assertTrue(self.service.notifier.text_messages, 'Expected a hybrid text message')
        text_message = self.service.notifier.text_messages[-1]['message']

        expected_prefixes = [
            '1. 10:00 PM',
            '2. 10:45 PM',
            '3. 11:30 PM',
            '4. 12:15 AM',
            '5. 1:00 AM',
        ]

        last_index = -1
        for token in expected_prefixes:
            idx = text_message.find(token)
            self.assertNotEqual(idx, -1, f"Missing token in slot list: {token}")
            self.assertGreater(idx, last_index, f"Out-of-order token in slot list: {token}")
            last_index = idx

        # Interactive list (first 10) must match the same order.
        self.assertTrue(self.service.notifier.list_messages, 'Expected a hybrid interactive list')
        first_list = self.service.notifier.list_messages[-1]
        row_ids = [item[0] for item in first_list['items']]

        self.assertEqual(
            row_ids,
            [
                'vslot_22:00',
                'vslot_22:45',
                'vslot_23:30',
                'vslot_00:15',
                'vslot_01:00',
                'vslot_01:45',
                'vslot_02:30',
                'vslot_03:15',
                'vslot_04:00',
                'vslot_04:45',
            ],
        )


if __name__ == '__main__':
    unittest.main()
