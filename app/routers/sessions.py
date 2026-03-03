from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.services import db_counts
from app.models.schemas import CloseLocationRequest
from app.utils.auth import login_required
from app.utils.country import get_current_country

router = APIRouter(prefix="/api", tags=["sessions"])


@router.post("/sessions/start", status_code=status.HTTP_201_CREATED)
async def start_new_session(request: Request, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Inicia una nueva sesión de conteo para el usuario actual."""
    country = get_current_country(request) or "MX"
    result = await db_counts.create_count_session(db, username, country_code=country)
    return result


@router.get("/sessions/active")
async def get_active_session(request: Request, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Obtiene la sesión de conteo activa para el usuario."""
    country = get_current_country(request) or "MX"
    session = await db_counts.get_active_session_for_user(db, username, country_code=country)
    if session:
        return session
    from fastapi.responses import JSONResponse
    return JSONResponse(content={"message": "No hay sesión de conteo activa."}, status_code=404)


@router.post("/sessions/{session_id}/close")
async def close_session(request: Request, session_id: int, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Cierra una sesión de conteo."""
    country = get_current_country(request) or "MX"
    return await db_counts.close_count_session(db, session_id, username, country_code=country)


@router.post("/locations/close")
async def close_location(request: Request, data: CloseLocationRequest, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Marca una ubicación como 'cerrada' para una sesión de conteo."""
    country = get_current_country(request) or "MX"
    return await db_counts.close_location_in_session(db, data.session_id, data.location_code, username, country_code=country)


@router.post("/locations/reopen", name="reopen_location")
async def reopen_location(request: Request, data: CloseLocationRequest, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Reabre una ubicación para permitir más conteos."""
    country = get_current_country(request) or "MX"
    return await db_counts.reopen_location_in_session(db, data.session_id, data.location_code, username, country_code=country)


@router.get("/sessions/{session_id}/locations")
async def get_session_locations(request: Request, session_id: int, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Obtiene el estado de todas las ubicaciones para una sesión."""
    country = get_current_country(request) or "MX"
    return await db_counts.get_locations_for_session(db, session_id, username, country_code=country)


@router.get("/sessions/{session_id}/counts/{location_code}")
async def get_counts_for_location(request: Request, session_id: int, location_code: str, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Obtiene todos los conteos para una ubicación específica en una sesión."""
    country = get_current_country(request) or "MX"
    return await db_counts.get_counts_for_location(db, session_id, location_code, username, country_code=country)
