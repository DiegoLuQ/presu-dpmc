import sys
import os

# Añade el directorio raíz al PYTHONPATH para que las importaciones funcionen correctamente
root_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(root_path)

from backend.app.db.session import SessionLocal
from backend.app.models import Colegio, User, Area, Subarea, Rol
from backend.app.core.security import get_password_hash

def create_admin_account():
    db = SessionLocal()
    try:
        # 1. Asegurar que existe un Colegio
        colegio = db.query(Colegio).first()
        if not colegio:
            print("Creando colegio por defecto...")
            colegio = Colegio(
                nombre="Configuración Inicial",
                rut="99.999.999-9",
                direccion="Casa Matriz",
                correo="sistema@mcdp.cl",
                celular="+56900000000"
            )
            db.add(colegio)
            db.flush()

        # 2. Asegurar que existe un Area y Subarea
        area = db.query(Area).first()
        if not area:
            print("Creando área por defecto...")
            area = Area(nombre="Administración Central")
            db.add(area)
            db.flush()

        subarea = db.query(Subarea).filter(Subarea.id_area == area.id_area).first()
        if not subarea:
            print("Creando subárea por defecto...")
            subarea = Subarea(nombre="Recursos Humanos", id_area=area.id_area)
            db.add(subarea)
            db.flush()

        # 3. Asegurar que existe el Rol de Administrador
        rol_admin = db.query(Rol).filter(Rol.codigo == "ADM").first()
        if not rol_admin:
            print("Creando rol Administrador por defecto...")
            rol_admin = Rol(nombre="Administrador", codigo="ADM", prefijo="ADM")
            db.add(rol_admin)
            db.flush()

        # 4. Crear el Usuario Admin
        admin_rut = "1-9"
        admin_pass = "admin123"
        
        existing_admin = db.query(User).filter(User.rut == admin_rut).first()
        if existing_admin:
            print(f"El usuario administrador con RUT {admin_rut} ya existe.")
        else:
            print(f"Creando usuario administrador {admin_rut}...")
            new_admin = User(
                id_colegio=colegio.id_colegio,
                id_subarea=subarea.id_subarea,
                id_rol=rol_admin.id_rol,
                rut=admin_rut,
                nombre="Administrador Sistema",
                correo="admin@mcdp.cl",
                password=get_password_hash(admin_pass),
                status="ACTIVE"
            )
            db.add(new_admin)
            db.commit()
            print("------------------------------------------")
            print("¡Usuario administrador creado con éxito!")
            print(f"RUT: {admin_rut}")
            print(f"Contraseña: {admin_pass}")
            print("------------------------------------------")

    except Exception as e:
        print(f"Error al crear la cuenta admin: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_admin_account()
