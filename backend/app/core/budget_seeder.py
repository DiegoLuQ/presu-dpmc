import os
import sys
from datetime import datetime

# Setup path
root_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if root_path not in sys.path:
    sys.path.append(root_path)

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models import (
    Area, Subarea, Contabilidad, Recurso, CategoriaRecurso,
    PME, Accion, Actividad, SolicitudPresupuesto, 
    PresupuestoDetalle, Colegio, User
)

def seed_budget():
    db = SessionLocal()
    try:
        # Solo sembrar datos de ejemplo en una base de datos NUEVA. Si ya existen
        # subáreas, se omite todo el seed para no resucitar áreas/subáreas (u otros
        # datos) que el usuario eliminó manualmente.
        if db.query(Subarea).count() > 0:
            print("Budget seed omitido: ya existen subáreas (BD configurada).")
            return

        print("Starting Budget Seeding...")

        # 1. More Areas & Subareas if they don't exist
        areas_data = [
            ("Académica", ["Matemáticas", "Lenguaje", "Ciencias", "Historia"]),
            ("Deportes", ["Fútbol", "Vóleibol", "Atletismo"]),
            ("Artes y Cultura", ["Música", "Pintura", "Teatro"]),
            ("Tecnología", ["Computación", "Robótica"]),
            ("Administración", ["Secretaría", "Finanzas", "Mantenimiento"])
        ]
        
        for area_name, subareas in areas_data:
            area = db.query(Area).filter(Area.nombre == area_name).first()
            if not area:
                area = Area(nombre=area_name)
                db.add(area)
                db.flush()
                print(f"Added Area: {area_name}")
            
            for sub_name in subareas:
                sub = db.query(Subarea).filter(Subarea.nombre == sub_name, Subarea.id_area == area.id_area).first()
                if not sub:
                    sub = Subarea(nombre=sub_name, id_area=area.id_area)
                    db.add(sub)
                    print(f"  Added Subarea: {sub_name}")
        
        db.commit()

        # 2. Accounting (Contabilidad) - DESHABILITADO PARA PRUEBAS MANUALES
        # contabilidad_data = [
        #     ("CC-001", "Subvención General"),
        #     ("CC-002", "SEP - Subvención Escolar Preferencial"),
        #     ("CC-003", "PIE - Programa de Integración"),
        #     ("CC-004", "Propios")
        # ]
        # for codigo, centro in contabilidad_data:
        #     if not db.query(Contabilidad).filter(Contabilidad.codigo == codigo).first():
        #         db.add(Contabilidad(codigo=codigo, centro_costo=centro))
        #         print(f"Added Accounting: {codigo} - {centro}")
        
        # db.commit()

        # 3. Recursos - Primero crear categorías si no existen
        # Verificar si ya hay categorías
        existente_cat = db.query(CategoriaRecurso).first()
        if not existente_cat:
            # Crear categorías básica
            categorias = [
                CategoriaRecurso(nombre="Materiales de Oficina", codigo_contable="001", descripcion="Artículos de oficina", estado="Activo"),
                CategoriaRecurso(nombre="Tecnología", codigo_contable="002", descripcion="Equipos tecnológicos", estado="Activo"),
                CategoriaRecurso(nombre="Deportes", codigo_contable="003", descripcion="Material deportivo", estado="Activo"),
                CategoriaRecurso(nombre="Educación", codigo_contable="004", descripcion="Material educativo", estado="Activo"),
            ]
            db.add_all(categorias)
            db.flush()
            print("Added Resource Categories")
        
        # Obtener primera categoría para los recursos
        cat_oficina = db.query(CategoriaRecurso).first()
        
        if cat_oficina:
            # 4. Resources (Recursos) - usando id_cat_recurso
            recursos_data = [
                ("Libros de Texto 1° Básico", "Set de libros para lenguaje y matemáticas", "Set"),
                ("Tablets Educativas", "Tablets de 10 pulgadas para laboratorio", "Unidad"),
                ("Material Deportivo", "Balones, redes y conos", "Pack"),
                ("Insumos de Oficina", "Hojas, carpetas, lápices", "Caja"),
                ("Cuadernos", "Cuadernos college", "Unidad"),
                ("Lápices", "Lápices grafito", "Caja"),
            ]
            for nom, desc, fmt in recursos_data:
                if not db.query(Recurso).filter(Recurso.nombre == nom).first():
                    db.add(Recurso(nombre=nom, descripcion=desc, formato=fmt, id_cat_recurso=cat_oficina.id_cat_recurso))
                    print(f"Added Resource: {nom}")
        
        db.commit()

        # 4. PME / Actions / Activities for Colegio (solo si existe al menos un colegio)
        colegio = db.query(Colegio).filter(Colegio.id_colegio == 1).first() or db.query(Colegio).first()
        if colegio:
            pme = db.query(PME).filter(PME.id_colegio == colegio.id_colegio, PME.year == 2026).first()
            if not pme:
                pme = PME(id_colegio=colegio.id_colegio, year=2026)
                db.add(pme)
                db.flush()
                
                accion = Accion(id_pme=pme.id_pme, nombre_accion="Mejora Aprendizaje Significativo", estado="EN PROCESO")
                db.add(accion)
                db.flush()
                
                act1 = Actividad(id_accion=accion.id_accion, nombre_actividad="Taller de Reforzamiento", dimension="PEDAGÓGICA")
                act2 = Actividad(id_accion=accion.id_accion, nombre_actividad="Adquisición de Materiales", dimension="RECURSOS")
                db.add(act1)
                db.add(act2)
                print("Added PME Structure for 2026")
            db.commit()

        # 5. Dummy Budget Requests - solo si existen los datos necesarios
        user_admin = db.query(User).filter(User.id_user == 1).first()
        sub_ciencia = db.query(Subarea).filter(Subarea.nombre == "Ciencias").first()
        rec_tabs = db.query(Recurso).filter(Recurso.nombre == "Tablets Educativas").first()
        act_mat = db.query(Actividad).filter(Actividad.nombre_actividad == "Adquisición de Materiales").first()

        if (user_admin and sub_ciencia and rec_tabs and act_mat and db.query(SolicitudPresupuesto).count() == 0):
            sol1 = SolicitudPresupuesto(
                id_user=user_admin.id_user,
                id_subarea=sub_ciencia.id_subarea,
                fecha=datetime.now(),
                comentario="Solicitud para renovación de laboratorio"
            )
            db.add(sol1)
            db.flush()
            
            det1 = PresupuestoDetalle(
                id_presupuesto=sol1.id_presupuesto,
                id_recurso=rec_tabs.id_recurso,
                id_actividad=act_mat.id_actividad,
                cantidad=10,
                precio_unitario=150000
            )
            db.add(det1)
            print("Added Sample Budget Request with Details")
        
        db.commit()
        print("\nBudget Seeding Completed Successfully!")

    except Exception as e:
        print(f"Error during seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_budget()
