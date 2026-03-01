"""
Punto de entrada principal de la aplicación Logix - Refactorizado para Arquitectura Headless (JSON API).
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
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

# Importar routers existentes (que ya eran JSON o mixtos)
from app.routers import (
    sessions, logs, stock, counts, auth, admin, 
    update, picking, inventory, planner, inbound, 
    grn, shipment, integrations
)

# [NUEVO] Importar router refactorizado para vistas convertidas a API
from app.routers import api_views

# --- Eventos de ciclo de vida (Lifespan) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Maneja el ciclo de vida de la aplicación (inicio y cierre)."""
    # Startup
    print("Iniciando aplicación Logix (API Headless)...")
    await run_migrations()
    await load_csv_data()
    print("Aplicación Logix iniciada correctamente.")
    yield
    # Shutdown
    print("Cerrando aplicación Logix...")

# --- Inicialización de FastAPI ---
app = FastAPI(
    title="Logix API V2",
    description="API Headless para gestión de almacén y logística (Backend React)",
    version="2.1.0",
    lifespan=lifespan
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- Configuración de CORS [CRÍTICO PARA REACT] ---
app.add_middleware(
    CORSMiddleware,
    # En producción, reemplazar "*" con el dominio real del frontend (ej. "http://localhost:5173")
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Middleware de recarga automática de CSV ---
# IMPORTANTE: Este middleware debe ir ANTES de los middlewares de seguridad
# para garantizar que los caches se actualicen antes de procesar el request
# OPTIMIZADO: Ahora con throttle de 5 segundos para evitar I/O excesivo
app.add_middleware(CSVCacheReloadMiddleware)

# --- Middleware de aislamiento por País ---
app.add_middleware(CountryMiddleware)

# --- Middlewares de seguridad ---
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])
app.add_middleware(SchemeMiddleware)
app.add_middleware(HSTSMiddleware)
app.add_middleware(
    SessionMiddleware, 
    secret_key=SECRET_KEY, 
    max_age=None,
    https_only=False
)

# --- Montar estáticos (Legacy Support) ---
app.mount("/static", StaticFiles(directory="static"), name="static")

# --- Registro de routers ---
# Routers Principales (JSON)
app.include_router(api_views.router) # [NUEVO] Reemplaza a views.router HTML
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

# --- Endpoint de salud ---
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "mode": "headless",
        "version": "2.1.0"
    }

if __name__ == "__main__":
    import granian
    granian.Granian("main:app", address="0.0.0.0", port=8000, reload=True).run()
