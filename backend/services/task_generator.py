from datetime import datetime, timedelta
from bson import ObjectId

def generate_tasks(care_plan):
    tasks = []

    patient_id = care_plan["patient_id"]
    plan_id = care_plan["_id"]

    # Medications
    for med in care_plan.get("medications", []):
        task = {
            "patient_id": patient_id,
            "care_plan_id": plan_id,
            "type": "medication",
            "description": f"{med['name']} {med['dose']}",
            "scheduled_time": med["time"],
            "priority": "high",
            "status": "pending",
            "assigned_nurse_id": None
        }
        tasks.append(task)

    # Meals
    for meal_time, meal in care_plan.get("meals", {}).items():
        if meal:
            tasks.append({
                "patient_id": patient_id,
                "care_plan_id": plan_id,
                "type": "meal",
                "description": meal,
                "scheduled_time": meal_time,
                "priority": "medium",
                "status": "pending",
                "assigned_nurse_id": None
            })

    return tasks
