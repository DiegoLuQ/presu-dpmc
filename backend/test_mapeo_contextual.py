import sys
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models import Recurso, ReglaMapeoContexto, PresupuestoDetalle, SolicitudPresupuesto, CategoriaRecurso
from app.schemas.budget import ResolverCodigoRequest, AprobarRecursoRequest
from app.api.budget import api_resolver_codigo, aprobar_y_clasificar_recurso

def test_mappings():
    print("=== INICIANDO PRUEBAS DE MAPEO CONTEXTUAL ===")
    db = SessionLocal()
    try:
        # 1. Buscar o Crear un recurso de prueba "Computador notebook"
        # Primero buscamos si ya existe por el seed
        recurso = db.query(Recurso).filter(Recurso.nombre.ilike("%Computador notebook%")).first()
        if not recurso:
            print("Computador notebook no encontrado. Creando recurso y reglas de prueba...")
            categoria = db.query(CategoriaRecurso).first()
            if not categoria:
                categoria = CategoriaRecurso(nombre="Prueba Cat", codigo_contable="410700", estado="Activo")
                db.add(categoria)
                db.flush()
                
            recurso = Recurso(
                nombre="Computador notebook",
                descripcion="Notebook para pruebas",
                formato="Unidad",
                id_cat_recurso=categoria.id_cat_recurso,
                estado="ACTIVO"
            )
            db.add(recurso)
            db.flush()

            # Crear reglas para este recurso
            regla_compra_est = ReglaMapeoContexto(
                id_recurso=recurso.id_recurso,
                codigo_cuenta="410703", # Adquisición de Equipos
                destino_uso="ESTUDIANTE",
                tipo_transaccion="COMPRA",
                subvencion="GENERAL"
            )
            regla_arriendo_adm = ReglaMapeoContexto(
                id_recurso=recurso.id_recurso,
                codigo_cuenta="411501", # Arriendo Equipos
                destino_uso="ADMINISTRATIVO",
                tipo_transaccion="ARRIENDO",
                subvencion="GENERAL"
            )
            db.add(regla_compra_est)
            db.add(regla_arriendo_adm)
            db.commit()

        # 2. Probar la resolución: Notebook + COMPRA + ESTUDIANTE -> 410703
        req_compra = ResolverCodigoRequest(
            id_recurso=recurso.id_recurso,
            destino_uso="ESTUDIANTE",
            tipo_transaccion="COMPRA",
            subvencion="GENERAL"
        )
        res_compra = api_resolver_codigo(req=req_compra, db=db)
        print(f"Respuesta Compra Estudiante: {res_compra}")
        assert res_compra["codigo_cuenta"] == "410703", f"Se esperaba 410703, obtenido {res_compra['codigo_cuenta']}"
        print("[OK] Notebook Compra Estudiante resolvio correctamente a 410703")

        # 3. Probar la resolución: Notebook + ARRIENDO + ADMINISTRATIVO -> 411501
        req_arriendo = ResolverCodigoRequest(
            id_recurso=recurso.id_recurso,
            destino_uso="ADMINISTRATIVO",
            tipo_transaccion="ARRIENDO",
            subvencion="GENERAL"
        )
        res_arriendo = api_resolver_codigo(req=req_arriendo, db=db)
        print(f"Respuesta Arriendo Adm: {res_arriendo}")
        assert res_arriendo["codigo_cuenta"] == "411501", f"Se esperaba 411501, obtenido {res_arriendo['codigo_cuenta']}"
        print("[OK] Notebook Arriendo Administrativo resolvio correctamente a 411501")

        # 4. Probar creación de recurso PENDIENTE, creación de presupuesto detalle sin código, y aprobación con bulk update silencioso
        print("\n=== PROBANDO FLUJO DE APROBACIÓN Y BULK UPDATE ===")
        
        # Crear recurso sugerido en estado PENDIENTE_APROBACION
        recurso_sugerido = Recurso(
            nombre="Impresora 3D Avanzada",
            descripcion="Sugerido para taller tecnologico",
            formato="Unidad",
            id_cat_recurso=recurso.id_cat_recurso,
            estado="PENDIENTE_APROBACION",
            descripcion_solicitud="Para taller PME de robótica"
        )
        db.add(recurso_sugerido)
        db.flush()

        # Crear una solicitud de presupuesto ficticia
        solicitud = SolicitudPresupuesto(
            codigo="SP-TEST-999",
            id_user=1,
            id_subarea=1,
            id_colegio=1,
            comentario="Solicitud de test",
            estado="Pendiente"
        )
        db.add(solicitud)
        db.flush()

        # Crear detalle de presupuesto asociado al recurso sugerido, sin código de cuenta aún
        detalle = PresupuestoDetalle(
            id_presupuesto=solicitud.id_presupuesto,
            nombre_producto="Impresora 3D Avanzada",
            id_recurso=recurso_sugerido.id_recurso,
            codigo_cuenta=None, # Vacío hasta que se apruebe
            formato_unidad="unidad",
            cantidad=1.0,
            valor_unitario_iva=500000.0,
            total_iva=500000.0,
            fecha_ejecucion="2026-06-01",
            tipo_fecha="mensual",
            motivo="Taller robótica",
            estado_aprobacion="Pendiente"
        )
        db.add(detalle)
        db.commit()

        print(f"Creado detalle de presupuesto ID {detalle.id_pre_detalle} con codigo_cuenta=None")

        # Llamar a aprobar_y_clasificar_recurso
        req_aprobacion = AprobarRecursoRequest(
            codigo_cuenta="410703", # Asignar a Equipos de apoyo pedagógico
            destino_uso="ESTUDIANTE",
            tipo_transaccion="COMPRA",
            subvencion="SEP"
        )
        
        res_aprobacion = aprobar_y_clasificar_recurso(
            id_recurso=recurso_sugerido.id_recurso,
            req=req_aprobacion,
            db=db,
            current_user=None # Mocking current_user since we're calling directly
        )
        print(f"Respuesta aprobación: {res_aprobacion}")
        
        # Validar que se actualizó el detalle de presupuesto
        db.refresh(detalle)
        db.refresh(recurso_sugerido)
        
        assert recurso_sugerido.estado == "ACTIVO", "El recurso debería haber cambiado a estado ACTIVO"
        assert detalle.codigo_cuenta == "410703", f"El detalle debería haber sido actualizado a 410703, obtenido {detalle.codigo_cuenta}"
        assert res_aprobacion["detalles_actualizados"] >= 1, "Se debería haber reportado al menos 1 detalle actualizado"
        print("[OK] Aprobación, Clasificación y Bulk Update Silencioso funcionan correctamente!")

        # Limpiar registros creados para el test de aprobación
        db.delete(detalle)
        db.delete(solicitud)
        # Limpiar regla creada por la aprobación
        regla_creada = db.query(ReglaMapeoContexto).filter(
            ReglaMapeoContexto.id_recurso == recurso_sugerido.id_recurso
        ).first()
        if regla_creada:
            db.delete(regla_creada)
        db.delete(recurso_sugerido)
        db.commit()
        print("[OK] Limpieza de datos de prueba completada.")
        
        print("\n=== TODAS LAS PRUEBAS PASARON EXITOSAMENTE ===")
        
    except Exception as e:
        print(f"\n[ERROR] EN LAS PRUEBAS: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    test_mappings()
