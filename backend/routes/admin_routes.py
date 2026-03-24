from flask import Blueprint, request, jsonify
from datetime import datetime
from flask_jwt_extended import jwt_required, get_jwt
from mongodb_config import MongoDatabase
from auth import admin_required
import logging
logger = logging.getLogger(__name__)


# Initialize Blueprint
admin_bp = Blueprint('admin_bp', __name__)
db = MongoDatabase()

@admin_bp.route('/stats', methods=['GET'])
@admin_required
def get_system_stats():
    """Get overall system statistics (Super Admin only)."""
    try:
        stats = db.get_system_stats()
        return jsonify({'success': True, 'stats': stats})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/doctors', methods=['GET'])
@admin_required
def get_all_doctors_admin():
    """Get all doctors (Super Admin only)."""
    try:
        doctors = db.get_all_doctors()
        return jsonify({'success': True, 'doctors': doctors, 'count': len(doctors)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/nurses', methods=['GET'])
@admin_required
def get_all_nurses_admin():
    """Get all nurses (Super Admin only)."""
    try:
        nurses = db.get_all_nurses()
        return jsonify({'success': True, 'nurses': nurses, 'count': len(nurses)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/patients', methods=['GET'])
@admin_required
def get_all_patients_admin():
    """Get all patients (Super Admin only)."""
    try:
        patients = db.get_all_patients()
        return jsonify({'success': True, 'patients': patients, 'count': len(patients)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/doctors/<user_id>', methods=['DELETE'])
@admin_required
def delete_doctor_admin(user_id):
    """Delete a doctor (Super Admin only)."""
    try:
        if db.delete_user(user_id):
            return jsonify({'success': True, 'message': 'Doctor deleted successfully'})
        return jsonify({'success': False, 'error': 'Doctor not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/nurses/<user_id>', methods=['DELETE'])
@admin_required
def delete_nurse_admin(user_id):
    """Delete a nurse (Super Admin only)."""
    try:
        if db.delete_user(user_id):
            return jsonify({'success': True, 'message': 'Nurse deleted successfully'})
        return jsonify({'success': False, 'error': 'Nurse not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/patients/<patient_id>', methods=['DELETE'])
@admin_required
def delete_patient_admin(patient_id):
    """Delete a patient (Super Admin only)."""
    try:
        if db.delete_patient(patient_id):
            return jsonify({'success': True, 'message': 'Patient deleted successfully'})
        return jsonify({'success': False, 'error': 'Patient not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/handoffs', methods=['GET'])
@admin_required
def get_all_handoffs_admin():
    """Get all handoffs (Super Admin access)."""
    try:
        handoffs = db.get_all_handoffs()
        
        # Robust serialization of list
        max_items = 50 # temporary safety limit
        safe_handoffs = []
        
        for h in handoffs:
            try:
                # Convert ObjectId and ensure handoff_id
                if '_id' in h:
                    h['_id'] = str(h['_id'])
                    if 'handoff_id' not in h or not h['handoff_id']:
                         h['handoff_id'] = h['_id']
                
                # Convert Timestamp
                if 'timestamp' in h and h['timestamp']:
                    if hasattr(h['timestamp'], 'isoformat'):
                         h['timestamp'] = h['timestamp'].isoformat()
                    else:
                         h['timestamp'] = str(h['timestamp'])
                
                # Enrich names
                if 'patient_id' in h:
                    try:
                        patient = db.get_patient(h['patient_id'])
                        if patient:
                            h['patient_name'] = patient.get('patient_name', 'Unknown')
                    except:
                        h['patient_name'] = 'Error Fetching Name'
                # Enrich nurse name (live lookup so edits propagate)
                if 'nurse_id' in h:
                    try:
                        nurse = db.get_user_by_id(h['nurse_id'])
                        if nurse:
                            h['nurse_name'] = nurse.get('full_name', h.get('nurse_name', 'Unknown'))
                    except:
                        pass
                
                safe_handoffs.append(h)
            except Exception as item_error:
                logger.error(f"Skipping bad item: {item_error}")
                continue
                
        return jsonify({'success': True, 'handoffs': safe_handoffs})
    except Exception as e:
        logger.error(f"Error in admin handoffs: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/handoffs/<handoff_id>', methods=['DELETE'])
@admin_required
def delete_handoff_admin(handoff_id):
    """Delete a handoff (Super Admin access)."""
    try:
        if db.delete_handoff(handoff_id):
            return jsonify({'success': True, 'message': 'Handoff deleted successfully'})
        return jsonify({'success': False, 'error': 'Handoff not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/appointment-logs', methods=['GET'])
@admin_required
def get_appointment_logs_admin():
    """Get all appointment audit logs (Super Admin)."""
    try:
        # Optional filtering
        action = request.args.get('action')
        user_id = request.args.get('user_id')
        
        query = {}
        if action:
            query['action'] = action
        if user_id:
            query['performed_by'] = user_id
            
        logs = list(db.db.appointment_logs.find(query).sort('timestamp', -1))
        
        # Enrich/Format
        result = []
        for log in logs:
            log_entry = {
                'log_id': log.get('log_id', str(log.get('_id'))),
                'appointment_id': log.get('appointment_id'),
                'action': log.get('action'),
                'performed_by': log.get('performed_by'),
                'performed_by_role': log.get('performed_by_role'),
                'details': log.get('details'),
                'timestamp': log.get('timestamp').isoformat() if log.get('timestamp') else None
            }
            
            # Try to get performer name
            if log.get('performed_by'):
                u = db.get_user_by_id(log['performed_by'])
                if u:
                    log_entry['performer_name'] = u.get('full_name') or u.get('patient_name')
            
            result.append(log_entry)
            
        return jsonify({'success': True, 'logs': result, 'count': len(result)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/vendors', methods=['GET'])
@admin_required
def get_all_vendors_admin():
    """Get all vendors (Super Admin only)."""
    try:
        # Fetch all vendors, excluding passwords and _id
        vendors = list(db.vendors.find({}, {'password': 0, '_id': 0}))
        return jsonify({'success': True, 'vendors': vendors, 'count': len(vendors)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/vendors/<user_id>/approve', methods=['PUT'])
@admin_required
def approve_vendor(user_id):
    """Approve a vendor (Super Admin only)."""
    try:
        result = db.vendors.update_one(
            {'user_id': user_id},
            {'$set': {'is_approved': True, 'is_active': True, 'updated_at': datetime.now()}}
        )
        
        if result.modified_count > 0:
            return jsonify({'success': True, 'message': 'Vendor approved successfully'})
        
        # Check if already approved or not found
        vendor = db.vendors.find_one({'user_id': user_id})
        if not vendor:
            return jsonify({'success': False, 'error': 'Vendor not found'}), 404
        
        return jsonify({'success': True, 'message': 'Vendor already approved'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/vendors/<user_id>/reject', methods=['PUT'])
@admin_required
def reject_vendor(user_id):
    """Reject a vendor (Super Admin only)."""
    try:
        data = request.get_json() or {}
        reason = data.get('reason', '')

        vendor = db.vendors.find_one({'user_id': user_id})
        if not vendor:
            return jsonify({'success': False, 'error': 'Vendor not found'}), 404

        result = db.vendors.update_one(
            {'user_id': user_id},
            {'$set': {
                'is_approved': False,
                'is_active': False,
                'is_rejected': True,
                'rejection_reason': reason,
                'updated_at': datetime.now()
            }}
        )

        if result.modified_count > 0:
            return jsonify({'success': True, 'message': 'Vendor rejected successfully'})
        return jsonify({'success': True, 'message': 'Vendor already rejected'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/vendors/<user_id>', methods=['DELETE'])
@admin_required
def delete_vendor_admin(user_id):
    """Delete or Reject a vendor (Super Admin only)."""
    try:
        # Check if vendor exists
        vendor = db.vendors.find_one({'user_id': user_id})
        if not vendor:
             return jsonify({'success': False, 'error': 'Vendor not found'}), 404

        # Delete from vendors collection
        db.vendors.delete_one({'user_id': user_id})
        
        return jsonify({'success': True, 'message': 'Vendor deleted successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
