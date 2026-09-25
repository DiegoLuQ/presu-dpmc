import sys
import os

# Añade el directorio actual (backend) al PYTHONPATH
# local_path: .../backend/app/core/roles_seeder.py
root_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.append(root_path)

from sqlalchemy.orm import Session
from app.models import Rol
from app.db.session import SessionLocal
from app.core.permissions import PERMISOS_POR_ROL

def seed_roles():
    db = SessionLocal()
    try:
        print("Sincronizando tabla de roles...")
        roles_data = [
            {"nombre": "Administrador", "codigo": "ADM", "prefijo": "ADM"},
            {"nombre": "Director", "codigo": "DIR", "prefijo": "DIR"},
            {"nombre": "Docente", "codigo": "DOC", "prefijo": "DOC"},
            {"nombre": "CRA", "codigo": "CRA", "prefijo": "CRA"},
            {"nombre": "PIE", "codigo": "PIE", "prefijo": "PIE"},
            {"nombre": "Inspectoría", "codigo": "INS", "prefijo": "INS"},
            {"nombre": "CDP", "codigo": "CDP", "prefijo": "CDP"},
            {"nombre": "Extraescolar", "codigo": "EXT", "prefijo": "EXT"},
            {"nombre": "UTP", "codigo": "UTP", "prefijo": "UTP"},
            {"nombre": "Convivencia", "codigo": "CON", "prefijo": "CON"},
            {"nombre": "Orientación", "codigo": "ORI", "prefijo": "ORI"},
            {"nombre": "Técnicos", "codigo": "TEC", "prefijo": "TEC"},
            {"nombre": "Finanzas", "codigo": "FIN", "prefijo": "FIN"},
            {"nombre": "Operaciones", "codigo": "OPE", "prefijo": "OPE"},
            {"nombre": "Sostenedor", "codigo": "SOS", "prefijo": "SOS"},
            {"nombre": "Gestión", "codigo": "GES", "prefijo": "GES"},
            {"nombre": "Gerente", "codigo": "GERENTE", "prefijo": "GER"},
            {"nombre": "Asesor", "codigo": "ASESOR", "prefijo": "ASE"},
        ]
        
        import json
        for role_item in roles_data:
            db_rol = db.query(Rol).filter(Rol.codigo == role_item["codigo"]).first()
            
            if not db_rol:
                print(f"Creando rol: {role_item['codigo']}")
                permisos = PERMISOS_POR_ROL.get(role_item["codigo"], [])
                db_rol = Rol(**role_item, permisos=json.dumps(permisos) if permisos else [])
                db.add(db_rol)
            else:
                db_rol.nombre = role_item["nombre"]
                db_rol.prefijo = role_item["prefijo"]
                # NO sobrescribir permisos si ya existen en la BD
                # (permite que los cambios desde la UI persistan)
                
        db.commit()
        print("Roles sincronizados con éxito.")
    except Exception as e:
        print(f"Error al poblar roles: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_roles()
