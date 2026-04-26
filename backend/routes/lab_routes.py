# routes/lab_routes.py — Lab Technician API

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timezone

from auth import lab_technician_required, role_required
from db import get_session_factory
from db.models.lab_request import LabRequest

lab_bp = Blueprint('lab', __name__)


@lab_bp.route('/requests', methods=['GET'])
@role_required('lab_technician', 'doctor', 'system_admin')
def get_lab_requests():
    """List lab requests. Lab techs see all; doctors see their own."""
    session = get_session_factory()()
    try:
        q = session.query(LabRequest)
        status = request.args.get('status')
        if status:
            q = q.filter(LabRequest.status == status)
        q = q.order_by(LabRequest.created_at.desc())
        requests_list = q.limit(100).all()
        return jsonify({'success': True, 'requests': [r.to_dict() for r in requests_list]}), 200
    finally:
        session.close()


@lab_bp.route('/requests/<request_id>', methods=['GET'])
@role_required('lab_technician', 'doctor', 'system_admin')
def get_lab_request(request_id):
    """Get single lab request detail."""
    session = get_session_factory()()
    try:
        lab_req = session.query(LabRequest).filter(LabRequest.id == request_id).first()
        if not lab_req:
            return jsonify({'success': False, 'error': 'Request not found'}), 404
        return jsonify({'success': True, 'request': lab_req.to_dict()}), 200
    finally:
        session.close()


@lab_bp.route('/requests/<request_id>/results', methods=['PUT'])
@lab_technician_required
def upload_results(request_id):
    """Upload results for a lab request (lab technician only)."""
    session = get_session_factory()()
    try:
        data = request.get_json()
        lab_req = session.query(LabRequest).filter(LabRequest.id == request_id).first()
        if not lab_req:
            return jsonify({'success': False, 'error': 'Request not found'}), 404

        lab_req.result_text = data.get('result_text', '')
        lab_req.result_file_url = data.get('result_file_url', '')
        lab_req.status = 'completed'
        lab_req.completed_by = get_jwt_identity()
        lab_req.completed_at = datetime.now(timezone.utc)

        session.commit()
        return jsonify({'success': True, 'message': 'Results uploaded', 'request': lab_req.to_dict()}), 200
    except Exception as e:
        session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        session.close()


@lab_bp.route('/stats', methods=['GET'])
@lab_technician_required
def get_lab_stats():
    """Lab test statistics."""
    session = get_session_factory()()
    try:
        total = session.query(LabRequest).count()
        pending = session.query(LabRequest).filter(LabRequest.status == 'pending').count()
        completed = session.query(LabRequest).filter(LabRequest.status == 'completed').count()
        return jsonify({
            'success': True,
            'stats': {'total': total, 'pending': pending, 'completed': completed}
        }), 200
    finally:
        session.close()
