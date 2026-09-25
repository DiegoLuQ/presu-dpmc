from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models import Subvencion, MapeoRecursoSubcategoria

def seed_subvenciones():
    db = SessionLocal()
    try:
        subvenciones_data = [
            { "nombre_corto": "GENERAL", "nombre_completo": "Subvención General", "estado": "ACTIVO" },
            { "nombre_corto": "SEP", "nombre_completo": "Subvención Escolar Preferencial", "estado": "ACTIVO" },
            { "nombre_corto": "PIE", "nombre_completo": "Programa de Integración Escolar", "estado": "ACTIVO" },
            { "nombre_corto": "PRO_RETENCION", "nombre_completo": "Pro Retención", "estado": "ACTIVO" },
            { "nombre_corto": "MANTENIMIENTO", "nombre_completo": "Subvención de Mantenimiento del Establecimiento", "estado": "ACTIVO" },
            { "nombre_corto": "INTERNADO", "nombre_completo": "Subvención de Internado", "estado": "INACTIVO" },
            { "nombre_corto": "REFUERZO_EDUCATIVO", "nombre_completo": "Refuerzo Educativo", "estado": "INACTIVO" },
        ]

        subvenciones_map = {}
        for item in subvenciones_data:
            sub = db.query(Subvencion).filter(Subvencion.nombre_corto == item["nombre_corto"]).first()
            if not sub:
                sub = Subvencion(
                    nombre_corto=item["nombre_corto"],
                    nombre_completo=item["nombre_completo"],
                    estado=item["estado"]
                )
                db.add(sub)
                db.flush()
            else:
                sub.nombre_completo = item["nombre_completo"]
                sub.estado = item["estado"]
                db.flush()
            subvenciones_map[item["nombre_corto"]] = sub.id_subvencion

        # Asociar todos los mapeos de recursos existentes que no tengan id_subvencion a 'GENERAL'
        mapeos = db.query(MapeoRecursoSubcategoria).filter(MapeoRecursoSubcategoria.id_subvencion == None).all()
        id_general = subvenciones_map.get("GENERAL")
        if id_general:
            for map_item in mapeos:
                map_item.id_subvencion = id_general

        db.commit()
        print("Subvenciones sembradas con éxito en la base de datos.")
    except Exception as e:
        print(f"Error sembrando subvenciones: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_subvenciones()
