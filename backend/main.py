import logging
import time
import uuid
from app.core.logging_config import setup_logging, setup_sentry, request_id_ctx
from app.api import auth, catalogos, roles, users, budget, requerimientos, pme, ai_config, convocatorias
from app.core.config import settings
from app.core.startup_tasks import run_startup_tasks
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

setup_logging()
setup_sentry()
logger = logging.getLogger("app")
access_logger = logging.getLogger("app.access")

app = FastAPI(title=settings.PROJECT_NAME)

@app.on_event("startup")
def startup_event():
    # Con varios workers (Docker) las tareas corren una sola vez en prestart.py
    if settings.RUN_STARTUP_TASKS:
        run_startup_tasks()

def _pista_error(exc: Exception) -> str:
    """Resumen corto de la excepción (tipo + primera línea), sin traza ni SQL."""
    orig = getattr(exc, "orig", None)  # errores de base de datos (SQLAlchemy)
    base = orig if orig is not None else exc
    args = getattr(base, "args", ()) or ()
    texto = str(args[-1]) if args else str(base)
    texto = texto.splitlines()[0] if texto else ""
    return f"{type(base).__name__}: {texto}"[:180]


@app.middleware("http")
async def log_requests(request, call_next):
    """Asigna un request_id, mide la duración y registra cada petición (sin OPTIONS)."""
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:8]
    token = request_id_ctx.set(rid)
    inicio = time.perf_counter()
    try:
        response = await call_next(request)
        ms = (time.perf_counter() - inicio) * 1000
        response.headers["X-Request-ID"] = rid
        if request.method != "OPTIONS":
            lenta = ms >= settings.SLOW_REQUEST_MS
            nivel = logging.WARNING if (lenta or response.status_code >= 500) else logging.INFO
            access_logger.log(
                nivel, "%s %s -> %s %.0f ms%s",
                request.method, request.url.path, response.status_code, ms, " (LENTA)" if lenta else "",
            )
        return response
    except Exception as exc:
        ms = (time.perf_counter() - inicio) * 1000
        logger.exception("Excepción no controlada en %s %s (%.0f ms)", request.method, request.url.path, ms)
        # Se responde aquí (y no relanzando) para que la respuesta pase por CORS y el
        # frontend pueda leerla: mensaje breve + pista para el programador.
        return JSONResponse(
            status_code=500,
            content={"detail": "Error interno del servidor.", "pista": _pista_error(exc), "request_id": rid},
            headers={"X-Request-ID": rid},
        )
    finally:
        request_id_ctx.reset(token)

# CORS Configuration
origins = settings.ALLOW_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Para que el frontend pueda mostrar la referencia del log en los avisos de error
    expose_headers=["X-Request-ID"],
    max_age=600,
)

# Comprime las respuestas JSON grandes (p.ej. un presupuesto con ~1.600 ítems: ~1,9 MB → pocos cientos de KB).
# Solo se aplica si el cliente envía Accept-Encoding: gzip; las respuestas pequeñas no se tocan.
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Include Routers (se registran con y sin prefijo /api para dar soporte a nginx-proxy y desarrollo local)
all_routers = [
    auth.router,
    catalogos.router,
    roles.router,
    users.router,
    budget.router,
    requerimientos.router,
    pme.router,
    ai_config.router,
    convocatorias.router,
]

for r in all_routers:
    app.include_router(r)
    app.include_router(r, prefix="/api")

@app.get("/")
@app.get("/api")
def read_root():
    return {"message": "Welcome to MCDP School ERP API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
