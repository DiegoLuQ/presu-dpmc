"""Migración: un área puede tener varios jefes.

Antes: `org_area_colegio_jefe` tenía PK (id_area, id_colegio) con un solo id_jefe
(nullable). Ahora la PK incluye id_jefe → varias filas por (área, colegio), una
por cada jefe. "Sin jefe" pasa a representarse como ausencia de filas.

Pasos (idempotentes):
  1. Si la tabla no existe, create_all la crea ya con el esquema nuevo.
  2. Si id_jefe ya es parte de la PK, no hace nada.
  3. Elimina filas con id_jefe NULL (ya no significan "sin jefe").
  4. Quita la FK actual sobre id_jefe (nombre dinámico), pone id_jefe NOT NULL,
     redefine la PK a (id_area, id_colegio, id_jefe) y recrea la FK con CASCADE.

Ejecutar:  python migrate_area_multi_jefe.py   (desde la carpeta backend/)
"""
from sqlalchemy import text
from app.db.session import SessionLocal, engine
from app.models import Base

TABLE = "org_area_colegio_jefe"


def run_migration():
    # 1. Crear la tabla si falta (en BD nueva queda ya con la PK de 3 columnas).
    print("Creando tablas nuevas (si faltan)...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # ¿Existe la tabla?
        exists = db.execute(text("""
            SELECT COUNT(*) FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t
        """), {"t": TABLE}).scalar()
        if not exists:
            print("La tabla no existe tras create_all; nada que migrar.")
            return

        # 2. ¿id_jefe ya es parte de la PK? → ya migrado.
        pk_cols = db.execute(text("""
            SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t
              AND CONSTRAINT_NAME = 'PRIMARY'
        """), {"t": TABLE}).fetchall()
        pk_set = {c for (c,) in pk_cols}
        if "id_jefe" in pk_set:
            print("La PK ya incluye id_jefe; migración ya aplicada.")
            return

        # 3. Eliminar filas sin jefe (id_jefe NULL).
        res = db.execute(text(f"DELETE FROM {TABLE} WHERE id_jefe IS NULL"))
        print(f"Filas con id_jefe NULL eliminadas: {res.rowcount}")

        # 4a. Quitar la FK sobre id_jefe (para poder modificar la columna / PK).
        fks = db.execute(text("""
            SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t
              AND COLUMN_NAME = 'id_jefe' AND REFERENCED_TABLE_NAME = 'auth_usuario'
        """), {"t": TABLE}).fetchall()
        for (name,) in fks:
            print(f"Quitando FK {name}...")
            db.execute(text(f"ALTER TABLE {TABLE} DROP FOREIGN KEY `{name}`"))

        # 4b. id_jefe NOT NULL.
        db.execute(text(f"ALTER TABLE {TABLE} MODIFY id_jefe INT NOT NULL"))

        # 4c. Redefinir la PK para incluir id_jefe.
        db.execute(text(
            f"ALTER TABLE {TABLE} DROP PRIMARY KEY, "
            f"ADD PRIMARY KEY (id_area, id_colegio, id_jefe)"
        ))

        # 4d. Recrear la FK con ON DELETE CASCADE (si se borra el usuario, se
        #     quita su asignación como jefe).
        db.execute(text(f"""
            ALTER TABLE {TABLE}
            ADD CONSTRAINT fk_acj_jefe FOREIGN KEY (id_jefe)
            REFERENCES auth_usuario(id_user) ON DELETE CASCADE
        """))

        db.commit()
        print("Migración completada: el área ahora admite varios jefes.")
    except Exception as e:
        db.rollback()
        print(f"ERROR en la migración: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_migration()
