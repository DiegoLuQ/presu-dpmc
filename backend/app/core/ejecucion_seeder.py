"""Valores iniciales del mapeo centro de costo Softland → subvención.

Solo inserta los centros de costo que aún no tienen fila (no pisa lo configurado
en Configuración › Ejecución OC). Los centros sin equivalencia conocida (AUC, REN, ...)
no se insertan: aparecen como "sin equivalencia" hasta que alguien los asigne.
"""
import logging

from app.db.session import SessionLocal
from app.models import MapeoCentroCostoSubvencion, Subvencion

logger = logging.getLogger(__name__)

# centro de costo → nombre_corto de pre_subvencion
CC_SUBVENCION_DEFAULT = {
    "COL": "GENERAL",
    "SEP": "SEP",
    "PIE": "PIE",
    "PRO": "PRO_RETENCION",
    "MAN": "MANTENIMIENTO",
}


def seed_mapeo_cc_subvencion() -> None:
    db = SessionLocal()
    try:
        existentes = {r.centro_costo for r in db.query(MapeoCentroCostoSubvencion.centro_costo).all()}
        subv = {s.nombre_corto.upper(): s.id_subvencion for s in db.query(Subvencion).all()}
        nuevos = 0
        for cc, nombre in CC_SUBVENCION_DEFAULT.items():
            if cc in existentes or nombre not in subv:
                continue
            db.add(MapeoCentroCostoSubvencion(centro_costo=cc, id_subvencion=subv[nombre]))
            nuevos += 1
        if nuevos:
            db.commit()
            logger.info("Mapeo centro de costo → subvención: %s filas iniciales", nuevos)
    except Exception as e:
        db.rollback()
        logger.warning("No se pudo sembrar el mapeo centro de costo → subvención: %s", e)
    finally:
        db.close()
