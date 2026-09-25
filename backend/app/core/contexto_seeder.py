from app.db.session import SessionLocal
from app.models import RolContextoDefault

# Default context per role: determines which ReglaMapeoContexto is "suggested"
ROL_CONTEXTOS = [
    {"rol_codigo": "UTP",     "destino_uso": "ESTUDIANTE",    "tipo_transaccion": "COMPRA",    "subvencion": "SEP"},
    {"rol_codigo": "PIE",     "destino_uso": "ESTUDIANTE",    "tipo_transaccion": "COMPRA",    "subvencion": "PIE"},
    {"rol_codigo": "DOC",     "destino_uso": "ESTUDIANTE",    "tipo_transaccion": "COMPRA",    "subvencion": "SEP"},
    {"rol_codigo": "CRA",     "destino_uso": "ESTUDIANTE",    "tipo_transaccion": "COMPRA",    "subvencion": "SEP"},
    {"rol_codigo": "INS",     "destino_uso": "ESTUDIANTE",    "tipo_transaccion": "COMPRA",    "subvencion": "GENERAL"},
    {"rol_codigo": "CON",     "destino_uso": "COMUNIDAD",     "tipo_transaccion": "COMPRA",    "subvencion": "GENERAL"},
    {"rol_codigo": "ORI",     "destino_uso": "COMUNIDAD",     "tipo_transaccion": "COMPRA",    "subvencion": "GENERAL"},
    {"rol_codigo": "EXT",     "destino_uso": "ESTUDIANTE",    "tipo_transaccion": "COMPRA",    "subvencion": "GENERAL"},
    {"rol_codigo": "CDP",     "destino_uso": "COMUNIDAD",     "tipo_transaccion": "COMPRA",    "subvencion": "GENERAL"},
    {"rol_codigo": "TEC",     "destino_uso": "ADMINISTRATIVO","tipo_transaccion": "MANTENCION","subvencion": "GENERAL"},
    {"rol_codigo": "OPE",     "destino_uso": "ADMINISTRATIVO","tipo_transaccion": "MANTENCION","subvencion": "GENERAL"},
    {"rol_codigo": "FIN",     "destino_uso": "ADMINISTRATIVO","tipo_transaccion": "COMPRA",    "subvencion": "GENERAL"},
    {"rol_codigo": "ADM",     "destino_uso": "ADMINISTRATIVO","tipo_transaccion": "COMPRA",    "subvencion": "GENERAL"},
    {"rol_codigo": "GES",     "destino_uso": "ADMINISTRATIVO","tipo_transaccion": "COMPRA",    "subvencion": "GENERAL"},
    {"rol_codigo": "DIR",     "destino_uso": "ESTUDIANTE",    "tipo_transaccion": "COMPRA",    "subvencion": "SEP"},
    {"rol_codigo": "SOS",     "destino_uso": "ESTUDIANTE",    "tipo_transaccion": "COMPRA",    "subvencion": "GENERAL"},
    {"rol_codigo": "GERENTE", "destino_uso": "ADMINISTRATIVO","tipo_transaccion": "COMPRA",    "subvencion": "GENERAL"},
    {"rol_codigo": "ASESOR",  "destino_uso": "ESTUDIANTE",    "tipo_transaccion": "COMPRA",    "subvencion": "GENERAL"},
]


def seed_contextos_rol():
    db = SessionLocal()
    try:
        for data in ROL_CONTEXTOS:
            existe = db.query(RolContextoDefault).filter(
                RolContextoDefault.rol_codigo == data["rol_codigo"]
            ).first()
            if not existe:
                db.add(RolContextoDefault(**data))
        db.commit()
        print("Contextos de rol sincronizados.")
    except Exception as e:
        db.rollback()
        print(f"Warning: contexto seed failed: {e}")
    finally:
        db.close()
