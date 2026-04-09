import logging
from datetime import datetime
import math

logger = logging.getLogger(__name__)

def assign_tasks_to_nurses(tasks, db):
    """
    Assign a list of tasks to the best available nurses.
    Now supports shift-based assignment (day, afternoon, night).
    Returns: list of assigned tasks (with assigned_nurse_id set)
    """
    # 1. Get all available nurses
    all_nurses = db.get_all_nurses()
    available_nurses = [n for n in all_nurses if n.get('is_visible', True) and n.get('is_available', True)]
    
    if not available_nurses:
        logger.warning(" No available nurses found for assignment")
        return tasks

    # 2. Assign each task
    assigned_count = 0
    unassigned_count = 0
    
    for task in tasks:
        # Skip if already assigned or completed
        if task.get('assigned_nurse_id') or task.get('status') == 'completed':
            continue

        task_shift = task.get('shift', 'day').lower()
        
        # First try: Get online nurses for the specific shift
        candidates = get_shift_nurses(available_nurses, task_shift)
        
        # Fallback: If no shift-specific nurses, get any online nurse
        if not candidates:
            candidates = [n for n in available_nurses if n.get('status') == 'online']
        
        if not candidates:
            logger.warning(f"No online nurses available for task {task.get('task_id', 'unknown')}")
            task['status'] = 'unassigned'
            unassigned_count += 1
            continue
            
        # Find nurse with LOWEST active task count
        # Use db method if available, otherwise use in-memory count
        for nurse in candidates:
            if 'current_workload' not in nurse:
                nurse['current_workload'] = db.get_nurse_task_count(nurse['user_id'])
        
        best_nurse = min(candidates, key=lambda n: n.get('current_workload', 0))
        
        if best_nurse:
            task['assigned_nurse_id'] = best_nurse['user_id']
            task['assigned_nurse_name'] = best_nurse['full_name']
            task['status'] = 'pending'
            
            # Save Decision Metadata
            task['assignment_reason'] = (
                f"Selected based on shift ({task_shift}) and "
                f"lowest active task count ({best_nurse.get('current_workload', 0)})"
            )

            # Update nurse workload (in memory for this batch)
            best_nurse['current_workload'] = best_nurse.get('current_workload', 0) + 1
            assigned_count += 1

    logger.info(f"AI Assigned {assigned_count} tasks, {unassigned_count} unassigned")
    return tasks


def get_shift_nurses(nurses, shift):
    """
    Filter nurses by shift and online status.
    Shift can be: day, afternoon, night
    """
    shift_lower = shift.lower() if shift else 'day'
    
    matching = []
    for n in nurses:
        if n.get('status') != 'online':
            continue
        
        nurse_shift = (n.get('shift') or n.get('current_shift') or 'day').lower()
        if nurse_shift == shift_lower:
            matching.append(n)
    
    return matching


def assign_task_after_rejection(task_id, rejecting_nurse_id, db, reason=""):
    """
    After a nurse rejects a task, find another available nurse and assign.
    Returns: (success: bool, new_nurse_name: str or None)
    """
    # 1. Get the task
    task = db.db.tasks.find_one({'task_id': task_id})
    if not task:
        from bson import ObjectId
        if ObjectId.is_valid(task_id):
            task = db.db.tasks.find_one({'_id': ObjectId(task_id)})
    
    if not task:
        return False, None
    
    task_shift = task.get('shift', 'day').lower()
    
    # 2. Get available nurses (excluding the rejecting nurse)
    all_nurses = db.get_all_nurses()
    available_nurses = [
        n for n in all_nurses 
        if n.get('is_visible', True) 
        and n.get('is_available', True)
        and n['user_id'] != rejecting_nurse_id
    ]
    
    # 3. Try shift-specific first
    candidates = get_shift_nurses(available_nurses, task_shift)
    
    # Fallback to any online nurse
    if not candidates:
        candidates = [n for n in available_nurses if n.get('status') == 'online']
    
    if not candidates:
        # No nurse available - mark as unassigned
        db.db.tasks.update_one(
            {'task_id': task.get('task_id', task_id)},
            {
                '$set': {
                    'assigned_nurse_id': None,
                    'assigned_nurse_name': None,
                    'status': 'unassigned',
                    'updated_at': datetime.now()
                }
            }
        )
        logger.warning(f"No nurse available to reassign task {task_id}")
        return True, None
    
    # 4. Find nurse with lowest workload
    for nurse in candidates:
        nurse['current_workload'] = db.get_nurse_task_count(nurse['user_id'])
    
    best_nurse = min(candidates, key=lambda n: n.get('current_workload', 0))
    
    # 5. Reassign using db method
    success = db.reassign_task(
        task_id=task.get('task_id', task_id),
        from_nurse_id=rejecting_nurse_id,
        to_nurse_id=best_nurse['user_id'],
        to_nurse_name=best_nurse['full_name'],
        reason=reason
    )
    
    if success:
        logger.info(f"Task {task_id} reassigned to {best_nurse['full_name']}")
        return True, best_nurse['full_name']
    
    return False, None


def calculate_nurse_score(nurse, task, patient_bed_number):
    """
    Deprecated in favor of strict workload-based assignment.
    """
    return 0

def reassign_nurse_tasks(nurse_id, db, reason="Nurse Unavailable"):
    """
    Triggered when a nurse goes offline.
    Reassigns all specific nurse's PENDING tasks to others.
    """
    # 1. Get Pending Tasks from DB
    tasks = db.get_nurse_tasks(nurse_id)
    
    pending_tasks = [t for t in tasks if t['status'] == 'pending']
    
    if not pending_tasks:
        return 0

    logger.info(f"Reassigning {len(pending_tasks)} tasks from {nurse_id}...")
    
    # 2. Unassign them first
    for task in pending_tasks:
        task['assigned_nurse_id'] = None
        task['reassigned'] = True
        if 'reassignment_history' not in task:
            task['reassignment_history'] = []
        task['reassignment_history'].append({
            'from_nurse': nurse_id,
            'reason': reason,
            'timestamp': datetime.now().isoformat()
        })
    
    # 3. Call Assignment Logic
    assigned_tasks = assign_tasks_to_nurses(pending_tasks, db)
    
    # 4. Update DB
    count = 0
    for task in assigned_tasks:
        if task.get('assigned_nurse_id'):
            # Update specific task in DB
            db.update_task_assignment(task['task_id'], task['assigned_nurse_id'], task['assigned_nurse_name'])
            # Also update the reassignment history and flag
            db.db.tasks.update_one(
                {'task_id': task['task_id']},
                {'$set': {
                    'reassigned': True,
                    'reassignment_history': task['reassignment_history']
                }}
            )
            count += 1
            
    return count

