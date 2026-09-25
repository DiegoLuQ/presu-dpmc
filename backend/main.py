import logging
from app.api import auth, catalogos, roles, users, budget, requerimientos, pme, ai_config, convocatorias
from app.core.config import settings
from app.core.roles_seeder import seed_roles
from app.core.budget_seeder import seed_budget
from app.core.contexto_seeder import seed_contextos_rol
from app.core.cuentas_pilar_seeder import seed_cuentas_pilar
from app.db.session import engine
from app.models import Base
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Filtrar peticiones OPTIONS (preflight CORS) para no saturar el terminal
class UvicornAccessFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "OPTIONS" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(UvicornAccessFilter())

app = FastAPI(title=settings.PROJECT_NAME)

@app.on_event("startup")
async def startup_event():
    import time
    for attempt in range(1, 11):
        try:
            Base.metadata.create_all(bind=engine)
            break
        except Exception as e:
            if attempt == 10:
                print(f"[FATAL] Could not connect to database after 10 attempts: {e}")
                raise e
            print(f"Waiting for database to be ready (attempt {attempt}/10)... Error: {e}")
            time.sleep(3)
    seed_roles()
    seed_contextos_rol()
    seed_cuentas_pilar()
    # Seed de presupuesto solo si hay datos mínimos (no sobeescribe datos existentes)
    try:
        seed_budget()
    except Exception as e:
        print(f"Warning: budget seed failed: {e}")

@app.middleware("http")
async def log_errors(request, call_next):
    import traceback
    try:
        return await call_next(request)
    except Exception as e:
        print(f"[ERROR] Exception during {request.method} {request.url}: {e}")
        traceback.print_exc()
        raise e

# CORS Configuration
origins = settings.ALLOW_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=600,
)

# Include Routers
app.include_router(auth.router)
app.include_router(catalogos.router)
app.include_router(roles.router)
app.include_router(users.router)
app.include_router(budget.router)
app.include_router(requerimientos.router)
app.include_router(pme.router)
app.include_router(ai_config.router)
app.include_router(convocatorias.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to MCDP School ERP API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
