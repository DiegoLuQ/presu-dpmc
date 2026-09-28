"""Tareas de arranque: crear tablas, migraciones automáticas y seeders.

Deben correr UNA sola vez por despliegue. Con varios workers de Uvicorn, el evento
"startup" se ejecuta en cada proceso a la vez (migraciones en paralelo, seeders
duplicados), por eso en Docker se ejecutan antes desde `prestart.py` y los workers
arrancan con RUN_STARTUP_TASKS=false.
"""
import logging
import time

from app.db.session import engine
from app.models import Base
from app.core.roles_seeder import seed_roles
from app.core.budget_seeder import seed_budget
from app.core.contexto_seeder import seed_contextos_rol
from app.core.cuentas_pilar_seeder import seed_cuentas_pilar

logger = logging.getLogger(__name__)


def run_startup_tasks() -> None:
    for attempt in range(1, 11):
        try:
            Base.metadata.create_all(bind=engine)
            break
        except Exception as e:
            if attempt == 10:
                logger.critical("No se pudo conectar a la BD tras 10 intentos: %s", e)
                raise
            logger.warning("Esperando la BD (intento %s/10): %s", attempt, e)
            time.sleep(3)

    # Ejecución automática de migraciones pendientes (ALTER TABLE y seeds)
    try:
        from apply_migrations import apply_migrations
        apply_migrations()
    except Exception as e:
        logger.exception("Error al ejecutar migraciones automáticas en startup: %s", e)

    seed_roles()
    seed_contextos_rol()
    seed_cuentas_pilar()
    # Seed de presupuesto solo si hay datos mínimos (no sobrescribe datos existentes)
    try:
        seed_budget()
    except Exception as e:
        logger.warning("Budget seed falló: %s", e)
    logger.info("Tareas de arranque completadas")
