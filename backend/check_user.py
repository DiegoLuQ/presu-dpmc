import sys
import os

root_path = os.path.dirname(os.path.abspath(__file__))
sys.path.append(root_path)

from app.db.session import SessionLocal
from app.models import User

db = SessionLocal()
try:
    user = db.query(User).filter(User.rut == '18.899.479-2').first()
    if user:
        print(f"User found: {user.nombre}, Email: {user.correo}, RUT: {user.rut}")
        print(f"Role: {user.id_rol}, Hash starts with: {user.password[:15] if user.password else 'None'}")
    else:
        print("User not found.")
finally:
    db.close()
