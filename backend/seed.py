from sqlalchemy.orm import Session
from app.db.session import SessionLocal, engine
from app.models import Base, Colegio, User, Area, Subarea, PapelCatalogo, Proveedor, Role
from app.core.security import get_password_hash

def seed():
    db = SessionLocal()
    try:
        # 1. Create Colegio
        colegio = Colegio(
            nombre="Colegio de Prueba",
            direccion="Calle Falsa 123",
            rut="12.345.678-9",
            correo="contacto@colegio.cl",
            celular="+56912345678"
        )
        db.add(colegio)
        db.flush()

        # 2. Create Area and Subarea
        area = Area(nombre="Administración")
        db.add(area)
        db.flush()
        
        subarea = Subarea(nombre="Secretaría", id_area=area.id_area)
        db.add(subarea)
        db.flush()

        # 3. Create Admin User
        user = User(
            id_colegio=colegio.id_colegio,
            id_subarea=subarea.id_subarea,
            rut="1-9",
            nombre="Admin Test",
            correo="admin@test.com",
            password=get_password_hash("admin123"),
            role=Role.ADMIN
        )
        db.add(user)

        # 4. Create initial Papel Catalogo
        papeles = [
            PapelCatalogo(tipo_tamano="A4", marca="Chamex", hojas_por_resma=500),
            PapelCatalogo(tipo_tamano="Carta", marca="HP", hojas_por_resma=500),
            PapelCatalogo(tipo_tamano="Oficio", marca="ProDesign", hojas_por_resma=500),
        ]
        db.add_all(papeles)

        # 5. Create initial Proveedor
        proveedor = Proveedor(
            rut="77.777.777-7",
            nombre_empresa="Distribuidora Papelera S.A.",
            contacto_telefono="+56988887777",
            correo="ventas@papelera.cl"
        )
        db.add(proveedor)

        db.commit()
        print("Seed completed successfully!")
    except Exception as e:
        print(f"Error seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed()
