from sqlalchemy import text
from app.db.session import SessionLocal

def run_migration():
    db = SessionLocal()
    try:
        print("Iniciando migración de grupo de recursos...")

        # 1. Crear tabla pre_grupo_recurso si no existe
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS pre_grupo_recurso (
                id_grupo_recurso INT AUTO_INCREMENT PRIMARY KEY,
                id_cat_recurso INT NOT NULL,
                nombre VARCHAR(255) NOT NULL,
                FOREIGN KEY (id_cat_recurso) REFERENCES pre_categoria_recurso(id_cat_recurso) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """))
        db.commit()
        print("Tabla 'pre_grupo_recurso' creada.")

        # 2. Agregar columna id_grupo_recurso a pre_recurso si no existe
        columns_res = db.execute(text("SHOW COLUMNS FROM pre_recurso LIKE 'id_grupo_recurso'")).fetchone()
        if not columns_res:
            db.execute(text("""
                ALTER TABLE pre_recurso 
                ADD COLUMN id_grupo_recurso INT NULL,
                ADD CONSTRAINT fk_recurso_grupo 
                FOREIGN KEY (id_grupo_recurso) REFERENCES pre_grupo_recurso(id_grupo_recurso) ON DELETE SET NULL;
            """))
            db.commit()
            print("Columna 'id_grupo_recurso' agregada a 'pre_recurso'.")

        # 3. Crear grupo de recurso 'General' por defecto para cada categoría existente
        categorias = db.execute(text("SELECT id_cat_recurso, nombre FROM pre_categoria_recurso")).fetchall()
        for cat in categorias:
            # Check if group already exists
            grupo_existente = db.execute(
                text("SELECT id_grupo_recurso FROM pre_grupo_recurso WHERE id_cat_recurso = :cat_id AND nombre = 'General'"),
                {"cat_id": cat[0]}
            ).fetchone()
            
            if not grupo_existente:
                db.execute(
                    text("INSERT INTO pre_grupo_recurso (id_cat_recurso, nombre) VALUES (:cat_id, 'General')"),
                    {"cat_id": cat[0]}
                )
                db.commit()

        print("Grupos por defecto 'General' creados para todas las categorías.")

        # 4. Migrar recursos actuales a sus respectivos grupos por defecto
        recursos_sin_grupo = db.execute(
            text("SELECT id_recurso, id_cat_recurso FROM pre_recurso WHERE id_grupo_recurso IS NULL AND id_cat_recurso IS NOT NULL")
        ).fetchall()

        for rec in recursos_sin_grupo:
            id_recurso, id_cat_recurso = rec
            # Obtener el grupo 'General' de la categoría del recurso
            grupo = db.execute(
                text("SELECT id_grupo_recurso FROM pre_grupo_recurso WHERE id_cat_recurso = :cat_id AND nombre = 'General'"),
                {"cat_id": id_cat_recurso}
            ).fetchone()
            
            if grupo:
                db.execute(
                    text("UPDATE pre_recurso SET id_grupo_recurso = :grupo_id WHERE id_recurso = :recurso_id"),
                    {"grupo_id": grupo[0], "recurso_id": id_recurso}
                )
        db.commit()
        print(f"Se actualizaron {len(recursos_sin_grupo)} recursos asociados al grupo 'General'.")

        # 5. Eliminar clave foránea antigua id_cat_recurso de pre_recurso
        # Primero buscar el nombre de la constraint de la FK
        fk_res = db.execute(text("""
            SELECT CONSTRAINT_NAME 
            FROM information_schema.KEY_COLUMN_USAGE 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'pre_recurso' 
              AND COLUMN_NAME = 'id_cat_recurso'
              AND REFERENCED_TABLE_NAME IS NOT NULL
        """)).fetchone()

        if fk_res:
            constraint_name = fk_res[0]
            db.execute(text(f"ALTER TABLE pre_recurso DROP FOREIGN KEY {constraint_name}"))
            db.commit()
            print(f"Clave foránea antigua '{constraint_name}' eliminada.")

        # Eliminar la columna id_cat_recurso
        has_cat_col = db.execute(text("SHOW COLUMNS FROM pre_recurso LIKE 'id_cat_recurso'")).fetchone()
        if has_cat_col:
            db.execute(text("ALTER TABLE pre_recurso DROP COLUMN id_cat_recurso"))
            db.commit()
            print("Columna 'id_cat_recurso' eliminada de 'pre_recurso'.")

        print("Migración completada exitosamente.")
    except Exception as e:
        print(f"Error durante la migración: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
