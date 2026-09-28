"""Se ejecuta una vez antes de levantar los workers de Uvicorn (ver Dockerfile)."""
from app.core.logging_config import setup_logging
from app.core.startup_tasks import run_startup_tasks

if __name__ == "__main__":
    setup_logging()
    run_startup_tasks()
