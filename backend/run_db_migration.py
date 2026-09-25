from sqlalchemy import text
from app.db.session import SessionLocal

def run_migration():
    db = SessionLocal()
    try:
        # 1. Crear tabla pre_subvencion
        print("Creando tabla pre_subvencion...")
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS pre_subvencion (
                id_subvencion INT AUTO_INCREMENT PRIMARY KEY,
                nombre_corto VARCHAR(50) NOT NULL,
                nombre_completo VARCHAR(255) NOT NULL,
                estado VARCHAR(20) DEFAULT 'ACTIVO'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """))
        
        # 2. Agregar columna id_subvencion a pre_mapeo_recurso_subcategoria si no existe
        print("Verificando columna id_subvencion en pre_mapeo_recurso_subcategoria...")
        # MySQL query to check if column exists
        columns = db.execute(text("SHOW COLUMNS FROM pre_mapeo_recurso_subcategoria LIKE 'id_subvencion'")).fetchall()
        if not columns:
            print("Agregando columna id_subvencion...")
            db.execute(text("""
                ALTER TABLE pre_mapeo_recurso_subcategoria 
                ADD COLUMN id_subvencion INT NULL,
                ADD CONSTRAINT fk_mapeo_subvencion FOREIGN KEY (id_subvencion) REFERENCES pre_subvencion(id_subvencion) ON DELETE SET NULL;
            """))
            print("Columna id_subvencion agregada exitosamente.")
        else:
            print("La columna id_subvencion ya existe.")
            
        db.commit()
        print("Migración completada con éxito.")
    except Exception as e:
        print(f"Error ejecutando migración: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
