import os
import sys

root_path = os.path.abspath(os.path.join(os.path.dirname(__file__)))
if root_path not in sys.path:
    sys.path.append(root_path)

from sqlalchemy import text
from app.db.session import engine, SessionLocal
from app.models import Base, GrupoRecurso

def run_migration():
    print("Iniciando migración de motivos de recurso y grupo/línea...")
    with engine.begin() as conn:
        # 1. Asegurar grupo 'Salud / Enfermería'
        res_salud = conn.execute(text(
            "SELECT id_grupo_recurso FROM pre_grupo_recurso WHERE LOWER(nombre) LIKE '%salud%' OR LOWER(nombre) LIKE '%enfermer%'"
        )).fetchone()
        if not res_salud:
            print("Creando grupo 'Salud / Enfermería'...")
            conn.execute(text(
                "INSERT INTO pre_grupo_recurso (nombre, descripcion) VALUES ('Salud / Enfermería', 'Insumos médicos, botiquín y primeros auxilios')"
            ))

        # 2. Crear tabla pre_motivo_recurso si no existe
        print("Creando tabla 'pre_motivo_recurso'...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS pre_motivo_recurso (
                id_motivo INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                descripcion TEXT NULL,
                id_grupo_recurso INT NULL,
                activo BOOLEAN NOT NULL DEFAULT TRUE,
                orden INT NOT NULL DEFAULT 0,
                CONSTRAINT fk_motivo_grupo FOREIGN KEY (id_grupo_recurso) REFERENCES pre_grupo_recurso(id_grupo_recurso) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """))

        # 3. Columna id_grupo_recurso en pre_detalle
        res_col = conn.execute(text("SHOW COLUMNS FROM pre_detalle LIKE 'id_grupo_recurso'")).fetchone()
        if not res_col:
            print("Agregando columna 'id_grupo_recurso' a pre_detalle...")
            conn.execute(text("""
                ALTER TABLE pre_detalle 
                ADD COLUMN id_grupo_recurso INT NULL,
                ADD CONSTRAINT fk_detalle_grupo FOREIGN KEY (id_grupo_recurso) REFERENCES pre_grupo_recurso(id_grupo_recurso) ON DELETE SET NULL;
            """))

    # 4. Sembrar los 8 motivos por defecto iniciales
    db = SessionLocal()
    try:
        # Mapeo de motivos y nombres de grupo sugeridos
        motivos_iniciales = [
            ("Materiales de librería", "Artículos de papelería, cuadernos, lápices y útiles de oficina/aula", "Librería", 1),
            ("Insumos de limpieza", "Artículos de aseo, desinfectantes, bolsas y útiles de higiene", "Aseo", 2),
            ("Insumos de cafetería", "Café, té, azúcar, galletas y catering institucional", "Alimentación", 3),
            ("Material didáctico (orientación UTP)", "Recursos pedagógicos de apoyo para docentes y sala de clases", "Librería", 4),
            ("Material Deportivo", "Balones, conos, colchonetas y equipamiento para educación física", "Deportes", 5),
            ("Recurso Tecnológico", "Equipos, componentes, cables y accesorios de computación/TICs", "Tecnología", 6),
            ("Material de Mantención", "Herramientas, repuestos, pintura y materiales de reparación", "Mantenimiento", 7),
            ("Insumo de Enfermería", "Alcohol, gasas, vendas, parches y botiquín de primeros auxilios", "Salud / Enfermería", 8),
        ]

        for nombre_motivo, desc, nombre_grupo, orden in motivos_iniciales:
            # Verificar si ya existe
            existe = db.execute(text(
                "SELECT id_motivo FROM pre_motivo_recurso WHERE LOWER(TRIM(nombre)) = :nom"
            ), {"nom": nombre_motivo.lower().strip()}).fetchone()

            if not existe:
                # Buscar id_grupo_recurso correspondiente
                grp = db.execute(text(
                    "SELECT id_grupo_recurso FROM pre_grupo_recurso WHERE LOWER(nombre) LIKE :grp"
                ), {"grp": f"%{nombre_grupo.lower().split()[0]}%"}).fetchone()
                id_grp = grp[0] if grp else None

                db.execute(text("""
                    INSERT INTO pre_motivo_recurso (nombre, descripcion, id_grupo_recurso, activo, orden)
                    VALUES (:nombre, :desc, :id_grp, 1, :orden)
                """), {
                    "nombre": nombre_motivo,
                    "desc": desc,
                    "id_grp": id_grp,
                    "orden": orden
                })
                print(f"  + Motivo creado: '{nombre_motivo}' -> Grupo ID: {id_grp}")

        db.commit()
        print("Migración de motivos de recurso completada exitosamente.")
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
