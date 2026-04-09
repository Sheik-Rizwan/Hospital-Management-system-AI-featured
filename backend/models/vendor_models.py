# vendor_models.py - Vendor & Procurement Models

from datetime import datetime
from typing import Dict, List, Optional
from models.user_models import User
import uuid


class Vendor:
    """Vendor user model - external supplier of goods"""
    
    @staticmethod
    def create(vendor_data: Dict) -> Dict:
        """Create a new vendor user."""
        return {
            'user_id': vendor_data.get('user_id') or f"vendor_{uuid.uuid4().hex[:8]}",
            'email': vendor_data['email'].lower(),
            'password': User.hash_password(vendor_data['password']),
            'company_name': vendor_data['company_name'],
            'contact_person': vendor_data.get('contact_person', ''),
            'role': 'vendor',
            'phone': vendor_data.get('phone', ''),
            'address': vendor_data.get('address', ''),
            'category': vendor_data.get('category', 'general'),  # medicines, equipment, beds, general
            'gst_number': vendor_data.get('gst_number', ''),
            'bank_details': vendor_data.get('bank_details', {}),
            'is_approved': vendor_data.get('is_approved', False),  # Admin must approve
            'is_active': True,
            'is_deleted': False,
            'created_at': datetime.now(),
            'created_by': vendor_data.get('created_by', 'system'),
            'updated_at': datetime.now()
        }
    
    @staticmethod
    def to_dict(vendor_data: Dict) -> Dict:
        """Convert vendor data to dict without password."""
        return {
            'user_id': vendor_data['user_id'],
            'email': vendor_data['email'],
            'company_name': vendor_data['company_name'],
            'contact_person': vendor_data.get('contact_person', ''),
            'role': vendor_data['role'],
            'phone': vendor_data.get('phone', ''),
            'address': vendor_data.get('address', ''),
            'category': vendor_data.get('category', 'general'),
            'gst_number': vendor_data.get('gst_number', ''),
            'is_approved': vendor_data.get('is_approved', False),
            'is_active': vendor_data.get('is_active', True),
            'created_at': vendor_data.get('created_at'),
            'updated_at': vendor_data.get('updated_at')
        }


class InventoryItem:
    """Inventory item model for hospital supplies"""
    
    @staticmethod
    def create(item_data: Dict) -> Dict:
        """Create a new inventory item."""
        return {
            'item_id': item_data.get('item_id') or f"item_{uuid.uuid4().hex[:8]}",
            'name': item_data['name'],
            'sku': item_data.get('sku', ''),
            'category': item_data['category'],  # medicines, equipment, beds, consumables
            'description': item_data.get('description', ''),
            'unit': item_data.get('unit', 'pcs'),  # pcs, box, kg, litre
            'quantity': item_data.get('quantity', 0),
            'reorder_level': item_data.get('reorder_level', 10),
            'unit_price': item_data.get('unit_price', 0.0),
            'location': item_data.get('location', ''),  # Storage location
            'is_active': True,
            'is_deleted': False,
            'created_at': datetime.now(),
            'created_by': item_data.get('created_by', 'system'),
            'updated_at': datetime.now()
        }
    
    @staticmethod
    def to_dict(item_data: Dict) -> Dict:
        """Convert item data to dict."""
        return {
            'item_id': item_data['item_id'],
            'name': item_data['name'],
            'sku': item_data.get('sku', ''),
            'category': item_data['category'],
            'description': item_data.get('description', ''),
            'unit': item_data.get('unit', 'pcs'),
            'quantity': item_data.get('quantity', 0),
            'reorder_level': item_data.get('reorder_level', 10),
            'unit_price': item_data.get('unit_price', 0.0),
            'location': item_data.get('location', ''),
            'is_low_stock': item_data.get('quantity', 0) <= item_data.get('reorder_level', 10),
            'is_active': item_data.get('is_active', True),
            'created_at': item_data.get('created_at'),
            'updated_at': item_data.get('updated_at')
        }


class PurchaseRequest:
    """Internal purchase request raised by staff"""
    
    # Status lifecycle: REQUESTED -> APPROVED -> ORDERED -> DELIVERED -> COMPLETED
    # Can also be: REJECTED at any stage
    STATUSES = ['requested', 'approved', 'rejected', 'ordered', 'delivered', 'completed', 'cancelled']
    
    @staticmethod
    def create(request_data: Dict) -> Dict:
        """Create a new purchase request."""
        return {
            'request_id': request_data.get('request_id') or f"req_{uuid.uuid4().hex[:8]}",
            'item_id': request_data.get('item_id'),  # Optional - can be new item
            'item_name': request_data['item_name'],
            'category': request_data.get('category', 'general'),
            'quantity': request_data['quantity'],
            'unit': request_data.get('unit', 'pcs'),
            'urgency': request_data.get('urgency', 'normal'),  # low, normal, high, urgent
            'reason': request_data.get('reason', ''),
            'department': request_data.get('department', ''),
            'status': 'requested',
            'requested_by': request_data['requested_by'],  # user_id
            'requested_by_name': request_data.get('requested_by_name', ''),
            'requested_by_role': request_data.get('requested_by_role', ''),
            'approved_by': None,
            'approved_at': None,
            'rejection_reason': None,
            'selected_vendor_id': None,
            'selected_quotation_id': None,
            'estimated_cost': request_data.get('estimated_cost', 0.0),
            'actual_cost': None,
            'budget_id': request_data.get('budget_id'),  # Link to department budget
            'is_deleted': False,
            'status_history': [{
                'status': 'requested',
                'by': request_data['requested_by'],
                'at': datetime.now().isoformat(),
                'note': 'Request created'
            }],
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }
    
    @staticmethod
    def to_dict(request_data: Dict) -> Dict:
        """Convert request data to dict."""
        return {
            'request_id': request_data['request_id'],
            'item_id': request_data.get('item_id'),
            'item_name': request_data['item_name'],
            'category': request_data.get('category', 'general'),
            'quantity': request_data['quantity'],
            'unit': request_data.get('unit', 'pcs'),
            'urgency': request_data.get('urgency', 'normal'),
            'reason': request_data.get('reason', ''),
            'department': request_data.get('department', ''),
            'status': request_data.get('status', 'requested'),
            'requested_by': request_data['requested_by'],
            'requested_by_name': request_data.get('requested_by_name', ''),
            'requested_by_role': request_data.get('requested_by_role', ''),
            'approved_by': request_data.get('approved_by'),
            'approved_at': request_data.get('approved_at'),
            'rejection_reason': request_data.get('rejection_reason'),
            'selected_vendor_id': request_data.get('selected_vendor_id'),
            'estimated_cost': request_data.get('estimated_cost', 0.0),
            'actual_cost': request_data.get('actual_cost'),
            'status_history': request_data.get('status_history', []),
            'created_at': request_data.get('created_at'),
            'updated_at': request_data.get('updated_at')
        }


class Quotation:
    """Vendor quotation for a purchase request"""
    
    @staticmethod
    def create(quotation_data: Dict) -> Dict:
        """Create a new quotation."""
        return {
            'quotation_id': quotation_data.get('quotation_id') or f"quote_{uuid.uuid4().hex[:8]}",
            'request_id': quotation_data['request_id'],
            'vendor_id': quotation_data['vendor_id'],
            'vendor_name': quotation_data.get('vendor_name', ''),
            'unit_price': quotation_data['unit_price'],
            'total_price': quotation_data['total_price'],
            'delivery_days': quotation_data.get('delivery_days', 7),
            'validity_days': quotation_data.get('validity_days', 30),
            'terms': quotation_data.get('terms', ''),
            'notes': quotation_data.get('notes', ''),
            'is_selected': False,
            'is_deleted': False,
            'submitted_at': datetime.now(),
            'created_at': datetime.now()
        }
    
    @staticmethod
    def to_dict(quotation_data: Dict) -> Dict:
        """Convert quotation data to dict."""
        return {
            'quotation_id': quotation_data['quotation_id'],
            'request_id': quotation_data['request_id'],
            'vendor_id': quotation_data['vendor_id'],
            'vendor_name': quotation_data.get('vendor_name', ''),
            'unit_price': quotation_data['unit_price'],
            'total_price': quotation_data['total_price'],
            'delivery_days': quotation_data.get('delivery_days', 7),
            'validity_days': quotation_data.get('validity_days', 30),
            'terms': quotation_data.get('terms', ''),
            'notes': quotation_data.get('notes', ''),
            'is_selected': quotation_data.get('is_selected', False),
            'submitted_at': quotation_data.get('submitted_at'),
            'created_at': quotation_data.get('created_at')
        }


class DepartmentBudget:
    """Department budget for procurement"""
    
    @staticmethod
    def create(budget_data: Dict) -> Dict:
        """Create a new department budget."""
        return {
            'budget_id': budget_data.get('budget_id') or f"budget_{uuid.uuid4().hex[:8]}",
            'department': budget_data['department'],
            'fiscal_year': budget_data.get('fiscal_year', str(datetime.now().year)),
            'total_budget': budget_data['total_budget'],
            'used_budget': budget_data.get('used_budget', 0.0),
            'reserved_budget': budget_data.get('reserved_budget', 0.0),  # For approved but not completed orders
            'is_active': True,
            'is_deleted': False,
            'created_at': datetime.now(),
            'created_by': budget_data.get('created_by', 'system'),
            'updated_at': datetime.now()
        }
    
    @staticmethod
    def to_dict(budget_data: Dict) -> Dict:
        """Convert budget data to dict."""
        total = budget_data.get('total_budget', 0)
        used = budget_data.get('used_budget', 0)
        reserved = budget_data.get('reserved_budget', 0)
        available = total - used - reserved
        
        return {
            'budget_id': budget_data['budget_id'],
            'department': budget_data['department'],
            'fiscal_year': budget_data.get('fiscal_year'),
            'total_budget': total,
            'used_budget': used,
            'reserved_budget': reserved,
            'available_budget': available,
            'utilization_percent': round((used / total * 100), 2) if total > 0 else 0,
            'is_active': budget_data.get('is_active', True),
            'created_at': budget_data.get('created_at'),
            'updated_at': budget_data.get('updated_at')
        }


class PurchaseOrder:
    """Purchase order sent to vendor after quotation selection"""
    
    STATUSES = ['created', 'sent', 'acknowledged', 'shipped', 'delivered', 'completed', 'cancelled']
    
    @staticmethod
    def create(po_data: Dict) -> Dict:
        """Create a new purchase order."""
        return {
            'po_id': po_data.get('po_id') or f"PO-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
            'request_id': po_data['request_id'],
            'quotation_id': po_data['quotation_id'],
            'vendor_id': po_data['vendor_id'],
            'vendor_name': po_data.get('vendor_name', ''),
            'items': po_data.get('items', []),  # [{item_name, quantity, unit_price, total}]
            'total_amount': po_data['total_amount'],
            'status': 'created',
            'expected_delivery': po_data.get('expected_delivery'),
            'actual_delivery': None,
            'delivery_notes': '',
            'budget_id': po_data.get('budget_id'),
            'budget_department': po_data.get('budget_department', ''),
            'department': po_data.get('department', ''),
            'created_by': po_data['created_by'],
            'is_deleted': False,
            'status_history': [{
                'status': 'created',
                'by': po_data['created_by'],
                'at': datetime.now().isoformat(),
                'note': 'PO created'
            }],
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }
    
    @staticmethod
    def to_dict(po_data: Dict) -> Dict:
        """Convert PO data to dict."""
        return {
            'po_id': po_data['po_id'],
            'request_id': po_data['request_id'],
            'quotation_id': po_data['quotation_id'],
            'vendor_id': po_data['vendor_id'],
            'vendor_name': po_data.get('vendor_name', ''),
            'items': po_data.get('items', []),
            'total_amount': po_data['total_amount'],
            'status': po_data.get('status', 'created'),
            'expected_delivery': po_data.get('expected_delivery'),
            'actual_delivery': po_data.get('actual_delivery'),
            'delivery_notes': po_data.get('delivery_notes', ''),
            'department': po_data.get('department', ''),
            'status_history': po_data.get('status_history', []),
            'created_at': po_data.get('created_at'),
            'updated_at': po_data.get('updated_at')
        }
