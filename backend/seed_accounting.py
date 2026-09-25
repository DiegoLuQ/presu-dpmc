from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models import Contabilidad, Recurso, SolicitudPresupuesto, PresupuestoDetalle, User
import random

def seed_accounting():
    db = SessionLocal()
    try:
        # Get first school and user
        admin = db.query(User).filter(User.rut == "1-9").first()
        if not admin:
            print("Admin user not found. Please run main seed first.")
            return
            
        id_colegio = admin.id_colegio
        
        # --- SEEDING DESHABILITADO PARA PRUEBAS MANUALES ---
        print("Seeding contable deshabilitado temporalmente para pruebas manuales.")
        
        # 1. Create Contabilidad (Centers of Cost)
        # centers = [
        #     {"codigo": "SEP-2026", "centro_costo": "Subvención Escolar Preferencial", "presupuesto": 50000000},
        #     {"codigo": "PIE-2026", "centro_costo": "Proyecto de Integración Escolar", "presupuesto": 25000000},
        #     {"codigo": "MANT-2026", "centro_costo": "Mantenimiento General", "presupuesto": 10000000},
        # ]
        
        # db_centers = []
        # for c in centers:
        #     existing = db.query(Contabilidad).filter(Contabilidad.codigo == c["codigo"]).first()
        #     if not existing:
        #         center = Contabilidad(
        #             id_colegio=id_colegio,
        #             codigo=c["codigo"],
        #             centro_costo=c["centro_costo"],
        #             presupuesto_asignado=c["presupuesto"]
        #         )
        #         db.add(center)
        #         db_centers.append(center)
        #     else:
        #         db_centers.append(existing)
        
        # db.flush()
        
        # 2. Create some Recursos associated with these centers
        # recursos_data = [
        #     {"nombre": "Resma Papel A4", "id_contabilidad": db_centers[0].id_contabilidad},
        #     {"nombre": "Toner Impresora HP", "id_contabilidad": db_centers[0].id_contabilidad},
        #     {"nombre": "Material Didáctico PIE", "id_contabilidad": db_centers[1].id_contabilidad},
        #     {"nombre": "Pintura Muros", "id_contabilidad": db_centers[2].id_contabilidad},
        # ]
        
        # db_recursos = []
        # for r in recursos_data:
        #     rec = Recurso(nombre=r["nombre"], id_contabilidad=r["id_contabilidad"])
        #     db.add(rec)
        #     db_recursos.append(rec)
            
        # db.flush()
        
        # 3. Create an Aprobado Request to test balance calculation
        # solicitud = SolicitudPresupuesto(
        #     id_user=admin.id_user,
        #     id_subarea=admin.id_subarea,
        #     comentario="Compra inicial de materiales",
        #     estado="Aprobado"
        # )
        # db.add(solicitud)
        # db.flush()
        
        # Add details
        # det1 = PresupuestoDetalle(
        #     id_presupuesto=solicitud.id_presupuesto,
        #     id_recurso=db_recursos[0].id_recurso, # Resma Papel (SEP)
        #     id_actividad=1, # Mock activity ID
        #     cantidad=10,
        #     precio_unitario=5000 # 50,000 total
        # )
        # det2 = PresupuestoDetalle(
        #     id_presupuesto=solicitud.id_presupuesto,
        #     id_recurso=db_recursos[2].id_recurso, # Material PIE (PIE)
        #     id_actividad=1,
        #     cantidad=2,
        #     precio_unitario=100000 # 200,000 total
        # )
        # db.add_all([det1, det2])
        
        # db.commit()
        # print("Accounting seed completed successfully!")
        
    except Exception as e:
        print(f"Error seeding accounting: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_accounting()
