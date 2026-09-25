from sqlalchemy import text
from app.db.session import SessionLocal

def run_migration():
    db = SessionLocal()
    try:
        print("Verificando columna id_subvencion en pre_regla_mapeo_contexto...")
        columns = db.execute(text("SHOW COLUMNS FROM pre_regla_mapeo_contexto LIKE 'id_subvencion'")).fetchall()
        if not columns:
            print("Agregando columna id_subvencion a pre_regla_mapeo_contexto...")
            db.execute(text("""
                ALTER TABLE pre_regla_mapeo_contexto 
                ADD COLUMN id_subvencion INT NULL,
                ADD CONSTRAINT fk_regla_subvencion FOREIGN KEY (id_subvencion) REFERENCES pre_subvencion(id_subvencion) ON DELETE SET NULL;
            """))
            print("Columna id_subvencion agregada exitosamente a pre_regla_mapeo_contexto.")
        else:
            print("La columna id_subvencion ya existe en pre_regla_mapeo_contexto.")
            
        db.commit()
    except Exception as e:
        print(f"Error ejecutando migración: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
