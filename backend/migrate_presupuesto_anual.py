"""Migración: presupuesto anual explícito.

1. Crea la tabla `pre_presupuesto_anual` (si no existe).
2. Agrega la columna `id_presupuesto_anual` a `pre_solicitud` (si no existe).
3. Backfill: enlaza cada solicitud existente al presupuesto anual de su año.
   El presupuesto de un año N se planifica el año anterior, por lo que una
   solicitud creada en el año Y pertenece al presupuesto del año Y+1. Se crean
   los presupuestos anuales necesarios por colegio/año sobre la marcha.
"""
from sqlalchemy import text
from app.db.session import SessionLocal, engine
from app.models import Base, PresupuestoAnual, SolicitudPresupuesto


def run_migration():
    # 1. Crear tablas nuevas declaradas en los modelos (incluye pre_presupuesto_anual)
    print("Creando tablas nuevas (si faltan)...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # 2. Columna id_presupuesto_anual en pre_solicitud
        print("Verificando columna 'id_presupuesto_anual' en pre_solicitud...")
        columns = db.execute(
            text("SHOW COLUMNS FROM pre_solicitud LIKE 'id_presupuesto_anual'")
        ).fetchall()
        if not columns:
            print("Agregando columna 'id_presupuesto_anual'...")
            db.execute(text("""
                ALTER TABLE pre_solicitud
                ADD COLUMN id_presupuesto_anual INT NULL,
                ADD CONSTRAINT fk_solicitud_ppto_anual
                    FOREIGN KEY (id_presupuesto_anual)
                    REFERENCES pre_presupuesto_anual(id_presupuesto_anual);
            """))
            db.commit()
            print("Columna 'id_presupuesto_anual' agregada.")
        else:
            print("La columna 'id_presupuesto_anual' ya existe.")

        # 3. Backfill de las solicitudes sin enlazar
        solicitudes = db.query(SolicitudPresupuesto).filter(
            SolicitudPresupuesto.id_presupuesto_anual.is_(None)
        ).all()
        print(f"Solicitudes sin presupuesto anual: {len(solicitudes)}")

        # cache (id_colegio, year) -> PresupuestoAnual
        cache = {}

        def obtener_ppto(id_colegio: int, year: int) -> PresupuestoAnual:
            key = (id_colegio, year)
            if key in cache:
                return cache[key]
            ppto = db.query(PresupuestoAnual).filter(
                PresupuestoAnual.id_colegio == id_colegio,
                PresupuestoAnual.year == year
            ).first()
            if not ppto:
                ppto = PresupuestoAnual(
                    id_colegio=id_colegio,
                    year=year,
                    nombre=f"Presupuesto {year}",
                    estado="activo",
                )
                db.add(ppto)
                db.flush()
                print(f"  + Presupuesto {year} (colegio {id_colegio}) creado.")
            cache[key] = ppto
            return ppto

        enlazadas = 0
        for sol in solicitudes:
            if not sol.id_colegio or not sol.fecha:
                continue
            year_objetivo = sol.fecha.year + 1
            ppto = obtener_ppto(sol.id_colegio, year_objetivo)
            sol.id_presupuesto_anual = ppto.id_presupuesto_anual
            enlazadas += 1

        db.commit()
        print(f"Solicitudes enlazadas: {enlazadas}")
        print("Migración completada con éxito.")
    except Exception as e:
        print(f"Error ejecutando migración: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_migration()
