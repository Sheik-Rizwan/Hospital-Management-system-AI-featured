
import os
from dotenv import load_dotenv
from mongodb_config import MongoDatabase
from termcolor import colored

def check_system_health():
    print(colored("\n--- SYSTEM HEALTH CHECK ---", "cyan", attrs=['bold']))
    
    # 1. Check .env
    load_dotenv()
    token = os.getenv('WHATSAPP_TOKEN')
    phone_id = os.getenv('PHONE_NUMBER_ID')
    
    print(f"\n1. Environment Variables:")
    if token and len(token) > 20:
        print(colored(f" WHATSAPP_TOKEN found (Starts with {token[:5]}...)", "green"))
    else:
        print(colored(" WHATSAPP_TOKEN missing or invalid", "red"))

    if phone_id:
        print(colored(f" PHONE_NUMBER_ID found ({phone_id})", "green"))
    else:
        print(colored(" PHONE_NUMBER_ID missing", "red"))

    # 2. Check Database
    try:
        db = MongoDatabase()
        print(f"\n2. Database Check:")
        
        # Check Doctors
        doctors = list(db.doctors.find({'is_active': True}))
        print(f"   - Active Doctors: {len(doctors)}")
        
        if len(doctors) == 0:
             print(colored("   ️  Warning: No active doctors found! Appointment flow will fail.", "yellow"))
        else:
             print(colored("    Doctors exist.", "green"))

        # Check Schedules
        schedules = list(db.doctor_schedules.find({'is_available': True}))
        print(f"   - Active Schedules: {len(schedules)}")
        
        if len(schedules) == 0:
             print(colored("   ️  Warning: No doctor schedules found! Doctors will appear unavailable.", "yellow"))
        else:
             print(colored("    Schedules exist.", "green"))
             
    except Exception as e:
        print(colored(f" Database Error: {e}", "red"))

if __name__ == "__main__":
    try:
        check_system_health()
    except ImportError:
        # Fallback if termcolor not installed
        print("Please install termcolor: pip install termcolor")
        # Proceed without color
        pass
    except Exception as e:
        print(f"Error: {e}")
