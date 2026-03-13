"""
Punto de entrada principal de la aplicación Logix - Refactorizado para Arquitectura Headless (JSON API).
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.sessions import SessionMiddleware

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter

# Importar configuración
from app.core.config import PROJECT_ROOT, SECRET_KEY
from app.middleware.security import SchemeMiddleware, HSTSMiddleware
from app.middleware.csv_cache_reload import CSVCacheReloadMiddleware
from app.middleware.country import CountryMiddleware

# Importar servicios
from app.services.database import run_migrations
from app.services.csv_handler import load_csv_data

# Importar routers
from app.routers import (
    sessions, logs, stock, counts, auth, admin, 
    update, picking, inventory, planner, inbound, 
    grn, shipment, integrations
)
from app.routers import api_views

# --- Eventos de ciclo de vida (Lifespan) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Maneja el ciclo de vida de la aplicación (inicio y cierre)."""
    print("Iniciando aplicación Logix (API Headless)...")
    await run_migrations()
    await load_csv_data()
    print("Aplicación Logix iniciada correctamente.")
    yield
    print("Cerrando aplicación Logix...")

# --- Inicialización de FastAPI ---
app = FastAPI(
    title="Logix API V2",
    description="API Headless para gestión de almacén y logística (Backend React)",
    version="2.1.0",
    lifespan=lifespan
)

# --- CONFIGURACIÓN DE MIDDLEWARES (ORDEN CRÍTICO) ---
# En FastAPI, los middlewares se ejecutan en orden inverso a su registro para la petición.
# El último registrado es el PRIMERO en recibir la petición (capa más externa).

# [1] Capa de Aplicación (Más interna)
app.add_middleware(CSVCacheReloadMiddleware)
app.add_middleware(CountryMiddleware)

# [2] Capa de Seguridad y Red
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])
app.add_middleware(SchemeMiddleware)
app.add_middleware(HSTSMiddleware)

# [3] Capa de Infraestructura (Debe envolver a la de negocio para proveer Session)
app.add_middleware(
    SessionMiddleware, 
    secret_key=SECRET_KEY, 
    session_cookie="logix_session",
    max_age=None,
    same_site="lax",
    https_only=False
)

# [4] Capa de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# [5] Capa de Depuración (Outer-most / La más externa)
@app.middleware("http")
async def error_logging_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        import traceback
        # No loguear errores de iconos favicon faltantes para no ensuciar la consola
        if "favicon.ico" not in str(request.url):
            print(f"❌ ERROR 500 en {request.method} {request.url}")
            traceback.print_exc()
        
        if os.getenv('ENVIRONMENT') == 'development':
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=500,
                content={"error": str(e), "traceback": traceback.format_exc()}
            )
        raise e

# --- Configuración de Limiter ---
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- Montar estáticos ---
app.mount("/static", StaticFiles(directory="static"), name="static")

# --- Registro de routers ---
app.include_router(api_views.router)
app.include_router(auth.router)
app.include_router(stock.router)
app.include_router(picking.router)
app.include_router(counts.router)
app.include_router(planner.router)
app.include_router(logs.router)
app.include_router(sessions.router)
app.include_router(admin.router)
app.include_router(admin.api_router)
app.include_router(update.router)
app.include_router(inventory.router)
app.include_router(inbound.router)
app.include_router(grn.router)
app.include_router(shipment.router)
app.include_router(integrations.router)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "2.1.0"}
