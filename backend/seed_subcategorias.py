from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models import CategoriaRecurso, SubcategoriaRecurso, Recurso, MapeoRecursoSubcategoria

def seed_subcategorias():
    db = SessionLocal()
    try:
        # Asegurar categoría con ID 1 o crear
        cat = db.query(CategoriaRecurso).filter(CategoriaRecurso.id_cat_recurso == 1).first()
        if not cat:
            cat = CategoriaRecurso(
                id_cat_recurso=1,
                nombre="Equipamiento de Apoyo Pedagógico",
                codigo_contable="410700",
                descripcion="Equipos pedagógicos de apoyo",
                estado="Activo",
                destino_gasto="Alumnos"
            )
            db.add(cat)
            db.flush()
        else:
            cat.nombre = "Equipamiento de Apoyo Pedagógico"
            db.flush()

        # Asegurar subcategorías con IDs 10 y 11 o crear
        sub1 = db.query(SubcategoriaRecurso).filter(SubcategoriaRecurso.id_subcat_recurso == 10).first()
        if not sub1:
            sub1 = SubcategoriaRecurso(
                id_subcat_recurso=10,
                id_cat_recurso=1,
                nombre="Equipos Informáticos",
                codigo_cuenta="410703",
                destino_gasto="Alumnos"
            )
            db.add(sub1)
        else:
            sub1.nombre = "Equipos Informáticos"
            sub1.codigo_cuenta = "410703"
            sub1.destino_gasto = "Alumnos"

        sub2 = db.query(SubcategoriaRecurso).filter(SubcategoriaRecurso.id_subcat_recurso == 11).first()
        if not sub2:
            sub2 = SubcategoriaRecurso(
                id_subcat_recurso=11,
                id_cat_recurso=1,
                nombre="Bienes Muebles No Pedagógicos",
                codigo_cuenta="411804",
                destino_gasto="Funcionarios"
            )
            db.add(sub2)
        else:
            sub2.nombre = "Bienes Muebles No Pedagógicos"
            sub2.codigo_cuenta = "411804"
            sub2.destino_gasto = "Funcionarios"

        db.flush()

        # Asegurar Recurso con ID 100 o crear
        rec = db.query(Recurso).filter(Recurso.id_recurso == 100).first()
        if not rec:
            rec = Recurso(
                id_recurso=100,
                nombre="Notebook",
                descripcion="Notebook portátil para uso educativo/administrativo",
                formato="Unidad",
                id_cat_recurso=1,
                estado="ACTIVO"
            )
            db.add(rec)
        else:
            rec.nombre = "Notebook"
            rec.id_cat_recurso = 1
        db.flush()

        # Limpiar mapeos anteriores para el ID 100
        db.query(MapeoRecursoSubcategoria).filter(MapeoRecursoSubcategoria.id_recurso == 100).delete()
        db.flush()

        # Crear nuevos mapeos
        map1 = MapeoRecursoSubcategoria(
            id_recurso=100,
            id_subcat_recurso=10,
            destino_gasto="Alumnos"
        )
        map2 = MapeoRecursoSubcategoria(
            id_recurso=100,
            id_subcat_recurso=11,
            destino_gasto="Funcionarios"
        )
        db.add(map1)
        db.add(map2)
        
        db.commit()
        print("Subcategorías y mapeos sembrados con éxito en la base de datos.")
    except Exception as e:
        print(f"Error sembrando subcategorías: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_subcategorias()
