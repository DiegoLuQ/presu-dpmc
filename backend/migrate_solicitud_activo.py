from sqlalchemy import text
from app.db.session import SessionLocal


def run_migration():
    db = SessionLocal()
    try:
        print("Verificando columna 'activo' en pre_solicitud...")
        columns = db.execute(
            text("SHOW COLUMNS FROM pre_solicitud LIKE 'activo'")
        ).fetchall()
        if not columns:
            print("Agregando columna 'activo'...")
            db.execute(text("""
                ALTER TABLE pre_solicitud
                ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1;
            """))
            print("Columna 'activo' agregada exitosamente.")
        else:
            print("La columna 'activo' ya existe.")

        db.commit()
        print("Migración completada con éxito.")
    except Exception as e:
        print(f"Error ejecutando migración: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    run_migration()
