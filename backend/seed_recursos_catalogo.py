import os
import json
from sqlalchemy.orm import Session
from app.db.session import SessionLocal, engine
from app.models import Base, CategoriaRecurso, Recurso, ReglaMapeoContexto, CuentaMatrizReglas

# Base groups mapping
BASE_GROUPS = {
    "410200": "Remuneraciones y Bonos",
    "410300": "Indemnizaciones y Gastos en Personal",
    "410400": "Seguros Laborales",
    "410500": "Asesoría Técnica y Orientación (ATE)",
    "410600": "Gastos en Recursos de Aprendizaje",
    "410700": "Equipamiento de Apoyo Pedagógico",
    "410800": "Gastos en Alumnos",
    "410900": "Gastos de Operación",
    "411000": "Servicios Básicos",
    "411100": "Servicios Generales",
    "411200": "Multas e Intereses",
    "411400": "Arriendos de Inmuebles",
    "411500": "Arriendos de Bienes Muebles",
    "411600": "Construcción y Mantención de Infraestructura"
}

def get_or_create_category(db: Session, group_code: str) -> CategoriaRecurso:
    cat = db.query(CategoriaRecurso).filter(CategoriaRecurso.codigo_contable == group_code).first()
    if not cat:
        name = BASE_GROUPS.get(group_code, "Otra Categoría Contable")
        cat = CategoriaRecurso(
            nombre=name,
            codigo_contable=group_code,
            descripcion=f"Recursos correspondientes al grupo {group_code}",
            estado="Activo"
        )
        db.add(cat)
        db.flush()
    return cat

def parse_context(example_text: str):
    text_lower = example_text.lower()
    
    # 1. Determinar tipo_transaccion
    if any(k in text_lower for k in ["arriendo", "renting", "leasing"]):
        transaccion = "ARRIENDO"
    elif any(k in text_lower for k in ["mantencion", "reparacion", "reparaciones", "remodelacion", "servicio de mant", "pintura", "limpieza", "instalacion"]):
        transaccion = "MANTENCION"
    else:
        transaccion = "COMPRA"
        
    # 2. Determinar destino_uso
    if any(k in text_lower for k in ["alumno", "estudiante", "parvulo", "juegos infantiles", "util escolar"]):
        destino = "ESTUDIANTE"
    elif any(k in text_lower for k in ["docente", "profesor", "capacitacion docente", "perfeccionamiento"]):
        destino = "DOCENTE"
    elif any(k in text_lower for k in ["oficina", "administrativo", "sostenedor", "directivos", "insumos de escritorio"]):
        destino = "ADMINISTRATIVO"
    elif any(k in text_lower for k in ["comunidad", "apoderado", "padres", "charlas de orientacion"]):
        destino = "COMUNIDAD"
    else:
        destino = "GENERAL"
        
    # 3. Determinar subvencion especifica si se menciona en el ejemplo
    subvencion = None
    if "con recursos pie" in text_lower or "para alumnos pie" in text_lower or "acoplamiento a audifonos" in text_lower:
        subvencion = "PIE"
    elif "recursos sep" in text_lower:
        subvencion = "SEP"
    elif "recursos pro retencion" in text_lower or "pro retencion" in text_lower:
        subvencion = "PRO_RETENCION"
        
    return transaccion, destino, subvencion

def seed_recursos_catalogo():
    print("Iniciando seed de recursos y reglas de contexto...")
    
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(backend_dir)
    descripcion_path = os.path.join(root_dir, "descargas_manual_cuentas", "descripcion_cuentas.json")
    
    if not os.path.exists(descripcion_path):
        print(f"Error: No se encontró el archivo descripcion_cuentas.json en {descripcion_path}")
        return
        
    with open(descripcion_path, "r", encoding="utf-8") as f:
        descripcion_data = json.load(f)
        
    db = SessionLocal()
    try:
        # Limpiar reglas y recursos previos de tipo seed para no duplicar
        print("Limpiando reglas de contexto anteriores...")
        db.query(ReglaMapeoContexto).delete()
        
        print("Limpiando recursos del catálogo que no están asociados a presupuestos...")
        from sqlalchemy import not_
        db.query(Recurso).filter(not_(Recurso.presupuesto_detalles.any())).delete()
        db.flush()
        
        recursos_creados = 0
        reglas_creadas = 0
        
        for ficha in descripcion_data:
            codigo = ficha["codigo"].replace(" ", "").strip()
            
            # Buscar el grupo base de este código (ej: 410902 -> grupo 410900)
            if len(codigo) == 6:
                grupo_code = codigo[:4] + "00"
            else:
                grupo_code = "410900" # Fallback
                
            categoria = get_or_create_category(db, grupo_code)
            
            ejemplos = ficha.get("ejemplos_compra", [])
            for ejemplo in ejemplos:
                nombre_limpio = ejemplo.strip()
                if not nombre_limpio:
                    continue
                
                # Evitar duplicados de nombre de recurso en la base de datos
                recurso = db.query(Recurso).filter(Recurso.nombre == nombre_limpio).first()
                if not recurso:
                    recurso = Recurso(
                        nombre=nombre_limpio[:254],
                        descripcion=f"Recurso extraído de ejemplos para la cuenta {ficha['nombre']}",
                        formato="Unidad",
                        id_cat_recurso=categoria.id_cat_recurso,
                        estado="ACTIVO"
                    )
                    db.add(recurso)
                    db.flush()
                    recursos_creados += 1
                
                # Determinar reglas contextuales según el texto del ejemplo
                transaccion, destino, subvencion = parse_context(nombre_limpio)
                
                # Crear regla de mapeo
                nueva_regla = ReglaMapeoContexto(
                    id_recurso=recurso.id_recurso,
                    codigo_cuenta=codigo,
                    destino_uso=destino,
                    tipo_transaccion=transaccion,
                    subvencion=subvencion
                )
                db.add(nueva_regla)
                reglas_creadas += 1
                
        db.commit()
        print(f"¡Seed de catálogo completado! Recursos creados: {recursos_creados}, Reglas de contexto creadas: {reglas_creadas}")
        
    except Exception as e:
        print(f"Error durante el seed de catálogo: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_recursos_catalogo()
