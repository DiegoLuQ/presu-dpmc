import sys
import os
import bcrypt

root_path = os.path.dirname(os.path.abspath(__file__))
sys.path.append(root_path)

from app.db.session import SessionLocal
from app.models import User

db = SessionLocal()
try:
    user = db.query(User).filter(User.rut == '18.899.479-2').first()
    if user:
        hash_bytes = user.password.encode('utf-8')
        test_passwords = ['admin123', 'Admin123', '123456', '18.899.479-2']
        for p in test_passwords:
            if bcrypt.checkpw(p.encode('utf-8'), hash_bytes):
                print(f"Match found! Password is: {p}")
                sys.exit(0)
        print("Password is NOT in the test list.")
    else:
        print("User not found.")
finally:
    db.close()
