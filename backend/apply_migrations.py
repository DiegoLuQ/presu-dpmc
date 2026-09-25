import sys
from sqlalchemy import text
from app.db.session import engine
from app.models import Base

def apply_migrations():
    print("Iniciando aplicación de migraciones manuales...")
    
    # 1. Crear tablas nuevas (esto creará pre_regla_mapeo_contexto si no existe)
    print("Creando nuevas tablas si no existen...")
    Base.metadata.create_all(bind=engine)
    
    # 2. Agregar columnas a tablas existentes
    with engine.begin() as conn:
        # Desactivar FK checks temporalmente para evitar problemas de alteración
        conn.execute(text('SET FOREIGN_KEY_CHECKS = 0;'))
        
        # --- pre_recurso ---
        # Verificar si 'estado' existe en pre_recurso
        res = conn.execute(text("SHOW COLUMNS FROM pre_recurso LIKE 'estado';")).fetchone()
        if not res:
            print("Agregando columna 'estado' a 'pre_recurso'...")
            conn.execute(text("ALTER TABLE pre_recurso ADD COLUMN estado VARCHAR(50) DEFAULT 'ACTIVO' NOT NULL;"))
            
        res = conn.execute(text("SHOW COLUMNS FROM pre_recurso LIKE 'id_solicitante';")).fetchone()
        if not res:
            print("Agregando columna 'id_solicitante' a 'pre_recurso'...")
            conn.execute(text("ALTER TABLE pre_recurso ADD COLUMN id_solicitante INT NULL;"))
            conn.execute(text("ALTER TABLE pre_recurso ADD CONSTRAINT fk_recurso_solicitante FOREIGN KEY (id_solicitante) REFERENCES auth_usuario(id_user);"))
            
        res = conn.execute(text("SHOW COLUMNS FROM pre_recurso LIKE 'descripcion_solicitud';")).fetchone()
        if not res:
            print("Agregando columna 'descripcion_solicitud' a 'pre_recurso'...")
            conn.execute(text("ALTER TABLE pre_recurso ADD COLUMN descripcion_solicitud TEXT NULL;"))
            
        # --- pre_detalle ---
        res = conn.execute(text("SHOW COLUMNS FROM pre_detalle LIKE 'codigo_cuenta';")).fetchone()
        if not res:
            print("Agregando columna 'codigo_cuenta' a 'pre_detalle'...")
            conn.execute(text("ALTER TABLE pre_detalle ADD COLUMN codigo_cuenta VARCHAR(6) NULL;"))
            conn.execute(text("ALTER TABLE pre_detalle ADD CONSTRAINT fk_detalle_codigo_cuenta FOREIGN KEY (codigo_cuenta) REFERENCES pre_cuenta_matriz_reglas(codigo);"))
            
        # --- pre_cuenta_matriz_reglas ---
        res = conn.execute(text("SHOW COLUMNS FROM pre_cuenta_matriz_reglas LIKE 'categoria_pilar';")).fetchone()
        if not res:
            print("Agregando columna 'categoria_pilar' a 'pre_cuenta_matriz_reglas'...")
            conn.execute(text(
                "ALTER TABLE pre_cuenta_matriz_reglas "
                "ADD COLUMN categoria_pilar VARCHAR(50) NULL "
                "COMMENT 'clases(alumno)|oficinas(administracion)|premio/beneficio|mantencion/servicio';"
            ))

        res = conn.execute(text("SHOW COLUMNS FROM pre_cuenta_matriz_reglas LIKE 'descripcion_breve';")).fetchone()
        if not res:
            print("Agregando columna 'descripcion_breve' a 'pre_cuenta_matriz_reglas'...")
            conn.execute(text(
                "ALTER TABLE pre_cuenta_matriz_reglas "
                "ADD COLUMN descripcion_breve VARCHAR(500) NULL;"
            ))

        # --- pre_categoria_recurso ---
        res = conn.execute(text("SHOW COLUMNS FROM pre_categoria_recurso LIKE 'destino_gasto';")).fetchone()
        if not res:
            print("Agregando columna 'destino_gasto' a 'pre_categoria_recurso'...")
            conn.execute(text(
                "ALTER TABLE pre_categoria_recurso "
                "ADD COLUMN destino_gasto VARCHAR(255) "
                "NOT NULL DEFAULT 'Alumnos' "
                "COMMENT 'Destino(s) del gasto separados por coma';"
            ))
        elif str(res[1]).lower().startswith('enum'):
            # Migrar de ENUM (un solo valor) a VARCHAR (permite múltiples separados por coma)
            print("Convirtiendo 'destino_gasto' de ENUM a VARCHAR (múltiples valores)...")
            conn.execute(text(
                "ALTER TABLE pre_categoria_recurso "
                "MODIFY COLUMN destino_gasto VARCHAR(255) "
                "NOT NULL DEFAULT 'Alumnos' "
                "COMMENT 'Destino(s) del gasto separados por coma';"
            ))

        # --- pre_convocatoria ---
        res = conn.execute(text("SHOW COLUMNS FROM pre_convocatoria LIKE 'pin';")).fetchone()
        if not res:
            print("Agregando columna 'pin' a 'pre_convocatoria'...")
            conn.execute(text("ALTER TABLE pre_convocatoria ADD COLUMN pin VARCHAR(10) NULL;"))

        # --- pre_pedido_externo ---
        res = conn.execute(text("SHOW COLUMNS FROM pre_pedido_externo LIKE 'actividad_evento';")).fetchone()
        if not res:
            print("Agregando columna 'actividad_evento' a 'pre_pedido_externo'...")
            conn.execute(text("ALTER TABLE pre_pedido_externo ADD COLUMN actividad_evento VARCHAR(255) NULL;"))

        res = conn.execute(text("SHOW COLUMNS FROM pre_pedido_externo LIKE 'destino';")).fetchone()
        if not res:
            print("Agregando columna 'destino' a 'pre_pedido_externo'...")
            conn.execute(text("ALTER TABLE pre_pedido_externo ADD COLUMN destino VARCHAR(20) NULL;"))

        res = conn.execute(text("SHOW COLUMNS FROM pre_pedido_externo LIKE 'id_actividad_pme';")).fetchone()
        if not res:
            print("Agregando columna 'id_actividad_pme' a 'pre_pedido_externo'...")
            conn.execute(text("ALTER TABLE pre_pedido_externo ADD COLUMN id_actividad_pme INT NULL;"))

        res = conn.execute(text("SHOW COLUMNS FROM pre_pedido_externo LIKE 'actividad_pme_nombre';")).fetchone()
        if not res:
            print("Agregando columna 'actividad_pme_nombre' a 'pre_pedido_externo'...")
            conn.execute(text("ALTER TABLE pre_pedido_externo ADD COLUMN actividad_pme_nombre VARCHAR(500) NULL;"))

        res = conn.execute(text("SHOW COLUMNS FROM pre_pedido_externo LIKE 'id_recurso';")).fetchone()
        if not res:
            print("Agregando columna 'id_recurso' a 'pre_pedido_externo'...")
            conn.execute(text("ALTER TABLE pre_pedido_externo ADD COLUMN id_recurso INT NULL;"))
            conn.execute(text("ALTER TABLE pre_pedido_externo ADD CONSTRAINT fk_pedido_recurso FOREIGN KEY (id_recurso) REFERENCES pre_recurso(id_recurso);"))

        # --- org_area cleanup ---
        res = conn.execute(text("SHOW COLUMNS FROM org_area LIKE 'id_jefe';")).fetchone()
        if res:
            print("Eliminando columna 'id_jefe' residual de 'org_area'...")
            try:
                conn.execute(text("ALTER TABLE org_area DROP FOREIGN KEY fk_area_jefe;"))
            except Exception as e:
                print(f"No se pudo eliminar FK fk_area_jefe: {e}")
            try:
                conn.execute(text("ALTER TABLE org_area DROP COLUMN id_jefe;"))
            except Exception as e:
                print(f"No se pudo eliminar columna id_jefe: {e}")

        conn.execute(text('SET FOREIGN_KEY_CHECKS = 1;'))

    print("¡Migración manual completada con éxito!")

if __name__ == "__main__":
    apply_migrations()
