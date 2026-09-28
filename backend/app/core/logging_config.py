"""Configuración central de logs y (opcional) Sentry.

Formato: fecha nivel [request_id] logger: mensaje
El request_id se asigna por petición en el middleware de main.py y permite
seguir todas las líneas de una misma petición.
"""
import logging
import sys
from contextvars import ContextVar

from app.core.config import settings

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        return True


def setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(_RequestIdFilter())
    handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)-7s [%(request_id)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.LOG_LEVEL.upper())

    # El access log de uvicorn se reemplaza por el middleware de main.py (incluye duración)
    logging.getLogger("uvicorn.access").disabled = True
    # Ruido de librerías HTTP (p.ej. cada llamada del cliente de IA)
    for name in ("httpx", "httpcore", "openai"):
        logging.getLogger(name).setLevel(logging.WARNING)
    for name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(name).handlers = []
        logging.getLogger(name).propagate = True


def setup_sentry() -> None:
    """Activa Sentry solo si SENTRY_DSN está configurado."""
    if not settings.SENTRY_DSN:
        return
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.SENTRY_ENVIRONMENT,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        send_default_pii=False,  # no enviar IPs, cookies ni cuerpos con datos personales
    )
    logging.getLogger(__name__).info("Sentry activado (entorno=%s)", settings.SENTRY_ENVIRONMENT)
