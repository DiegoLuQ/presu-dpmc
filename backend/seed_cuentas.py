import os
import json
from sqlalchemy.orm import Session
from app.db.session import SessionLocal, engine
from app.models import Base, CuentaMatrizReglas, CuentaDescripcion

def seed_cuentas():
    print("Iniciando creación de tablas e importación de cuentas contables...")
    
    # Asegurar que las tablas existan
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Rutas de los archivos JSON en la raíz del proyecto
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        root_dir = os.path.dirname(backend_dir)
        matriz_path = os.path.join(root_dir, "descargas_manual_cuentas", "matriz_cuentas.json")
        descripcion_path = os.path.join(root_dir, "descargas_manual_cuentas", "descripcion_cuentas.json")

        
        if not os.path.exists(matriz_path):
            print(f"Error: No se encontró el archivo matriz_cuentas.json en {matriz_path}")
            return
        if not os.path.exists(descripcion_path):
            print(f"Error: No se encontró el archivo descripcion_cuentas.json en {descripcion_path}")
            return
            
        # Cargar archivos JSON
        with open(matriz_path, "r", encoding="utf-8") as f:
            matriz_data = json.load(f)
            
        with open(descripcion_path, "r", encoding="utf-8") as f:
            descripcion_data = json.load(f)
            
        # Limpiar datos previos
        print("Limpiando registros antiguos...")
        db.query(CuentaMatrizReglas).delete()
        db.query(CuentaDescripcion).delete()
        db.flush()
        
        # Insertar matriz de reglas
        print(f"Cargando {len(matriz_data)} reglas de la matriz...")
        for item in matriz_data:
            codigo_norm = item["codigo"].strip()
            nueva_regla = CuentaMatrizReglas(
                codigo=codigo_norm,
                nombre=item["nombre"].strip(),
                grupo=item["grupo"].strip(),
                libro_rendicion=item["libro_rendicion"].strip(),
                documentos_habilitados=item["documentos_habilitados"],
                subvenciones_reglas=item["subvenciones_reglas"]
            )
            db.add(nueva_regla)
            
        # Insertar descripciones (con normalización del código)
        print(f"Cargando {len(descripcion_data)} descripciones...")
        for item in descripcion_data:
            # Reemplazar espacios en códigos como "410 501" para dejarlos como "410501"
            codigo_norm = item["codigo"].replace(" ", "").strip()
            nueva_desc = CuentaDescripcion(
                codigo=codigo_norm,
                nombre=item["nombre"].strip(),
                caracteristicas=item.get("caracteristicas", "").strip() if item.get("caracteristicas") else "",
                diferenciacion_publico=item.get("diferenciacion_publico", "").strip() if item.get("diferenciacion_publico") else "",
                ejemplos_compra=item.get("ejemplos_compra", []),
                advertencias_sistema=item.get("advertencias_sistema", [])
            )
            db.add(nueva_desc)
            
        db.commit()
        print("¡Importación y carga de cuentas contables realizada con éxito!")
        
    except Exception as e:
        print(f"Error durante el seed de cuentas: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_cuentas()
