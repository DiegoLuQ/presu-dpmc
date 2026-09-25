"""Migración: pertenencia multi-colegio de usuarios.

1. Crea la tabla puente `auth_usuario_colegio` (si no existe).
2. Backfill idempotente: por cada usuario existente inserta (id_user, id_colegio)
   con su colegio principal actual, para que los usuarios de hoy queden con 1
   colegio (y no vean el selector de colegio activo).

Ejecutar:  python migrate_usuario_colegio.py   (desde la carpeta backend/)
"""
from sqlalchemy import text
from app.db.session import SessionLocal, engine
from app.models import Base


def run_migration():
    # 1. Crear la tabla nueva declarada en los modelos (auth_usuario_colegio)
    print("Creando tablas nuevas (si faltan)...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # 2. Backfill: copiar el colegio principal de cada usuario a la M2M.
        #    INSERT IGNORE evita duplicados por la PK compuesta (idempotente).
        print("Backfill de auth_usuario_colegio desde auth_usuario.id_colegio...")
        result = db.execute(text("""
            INSERT IGNORE INTO auth_usuario_colegio (id_user, id_colegio)
            SELECT id_user, id_colegio
            FROM auth_usuario
            WHERE id_colegio IS NOT NULL
        """))
        db.commit()
        print(f"Filas insertadas (nuevas): {result.rowcount}")
        print("Migración completada.")
    except Exception as e:
        db.rollback()
        print(f"ERROR en la migración: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_migration()
