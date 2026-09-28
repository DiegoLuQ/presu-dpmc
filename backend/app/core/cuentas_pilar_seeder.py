from sqlalchemy import text
from app.db.session import engine
import logging

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# PEGA AQUÍ el JSON de las 103 cuentas cuando lo tengas.
# Formato esperado:
# [
#   { "codigo": "410501", "categoria_pilar": "clases(alumno)",
#     "descripcion_breve": "Asistencia técnico pedagógica (ATE)" },
#   ...
# ]
# ─────────────────────────────────────────────────────────────────────────────
CUENTAS_PILAR: list[dict] = [
    # ← datos aquí
]


def seed_cuentas_pilar():
    if not CUENTAS_PILAR:
        logger.info("cuentas_pilar_seeder: sin datos, omitiendo.")
        return

    with engine.begin() as conn:
        for row in CUENTAS_PILAR:
            conn.execute(
                text(
                    "UPDATE pre_cuenta_matriz_reglas "
                    "SET categoria_pilar = :pilar, descripcion_breve = :desc "
                    "WHERE codigo = :codigo"
                ),
                {
                    "pilar": row["categoria_pilar"],
                    "desc":  row["descripcion_breve"],
                    "codigo": row["codigo"],
                },
            )
    logger.info(f"cuentas_pilar_seeder: {len(CUENTAS_PILAR)} cuentas actualizadas.")