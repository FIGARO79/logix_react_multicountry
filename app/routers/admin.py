"""
Router para endpoints administrativos unificado.
"""
import json
import os
import pandas as pd
from io import BytesIO
from fastapi import APIRouter, Request, Form, Depends, HTTPException, Body, UploadFile, File, Response
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from pydantic import BaseModel
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update, text
from app.core.db import get_db
from app.utils.auth import get_all_users, approve_user_by_id, delete_user_by_id, reset_user_password, get_user_by_id
from app.models.sql_models import User
from app.core.config import ADMIN_PASSWORD, JSON_FOLDER
from app.core.templates import templates
from app.services.csv_handler import load_csv_data
from app.utils.country import get_current_country

# UNIFICADO: Todas las rutas administrativas colgarán de /api/admin
router = APIRouter(prefix="/api/admin", tags=["admin"])

def get_slotting_params_path(country_code: str) -> str:
    return os.path.join(JSON_FOLDER, country_code, 'slotting_parameters.json')

# --- Verificación de Sesión ---

@router.get('/verify')
async def verify_admin_session(request: Request):
    """Verifica si hay una sesión activa de administrador."""
    if request.session.get("admin_logged_in"):
        return JSONResponse({"success": True})
    return JSONResponse({"success": False}, status_code=401)

@router.post('/login')
async def admin_login_api(request: Request, data: dict):
    """Login de administrador."""
    password = data.get('password')
    target_pass = ADMIN_PASSWORD if ADMIN_PASSWORD else "Admin"
    
    if password == target_pass:
        request.session['admin_logged_in'] = True
        return JSONResponse(content={"message": "Login correcto", "success": True})
    else:
        return JSONResponse(content={"message": "Contraseña incorrecta", "success": False}, status_code=401)

@router.post('/logout')
async def admin_logout(request: Request):
    """Cierra la sesión administrativa."""
    request.session.pop("admin_logged_in", None)
    return JSONResponse({"success": True})

# --- Gestión de Usuarios ---

@router.get('/users')
async def get_admin_users_api(request: Request, db: AsyncSession = Depends(get_db)):
    """Obtiene lista de usuarios."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    try:
        users = await get_all_users(db)
        return JSONResponse(content=users)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@router.post('/approve/{user_id}')
async def approve_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    success = await approve_user_by_id(db, user_id)
    return JSONResponse({'success': success})

@router.post('/delete/{user_id}')
async def delete_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    success = await delete_user_by_id(db, user_id)
    return JSONResponse({'success': success})

@router.post('/reset_password/{user_id}')
async def reset_password(request: Request, user_id: int, new_password: str = Form(...), db: AsyncSession = Depends(get_db)):
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    success = await reset_user_password(db, user_id, new_password)
    return JSONResponse({'success': success})

class PermissionUpdate(BaseModel):
    permissions: List[str]

@router.post('/permissions/{user_id}')
async def update_user_permissions(user_id: int, request: Request, data: PermissionUpdate, db: AsyncSession = Depends(get_db)):
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    permissions_str = ",".join(data.permissions)
    stmt = update(User).where(User.id == user_id).values(permissions=permissions_str)
    await db.execute(stmt)
    await db.commit()
    return JSONResponse({'success': True})

# --- Slotting ---

@router.get("/slotting-summary")
async def get_slotting_summary(request: Request, db: AsyncSession = Depends(get_db)):
    """Genera estadísticas reales cruzando el JSON con la DB."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    
    country = get_current_country(request) or "CL"
    params_path = get_slotting_params_path(country)
    
    try:
        if not os.path.exists(params_path):
            return {"total": 0, "in_use": 0, "free": 0, "occupancy_pct": 0, "by_zone": {}}
            
        with open(params_path, 'r') as f:
            config = json.load(f)
        
        storage = config.get("storage", {})
        total_locations = len(storage)
        
        # Desglose por zona
        zones = {}
        for info in storage.values():
            z = info.get("zone", "Otras")
            zones[z] = zones.get(z, 0) + 1

        # Ocupación REAL: Bins con stock > 0 y total de ítems por bin
        query = text("SELECT bin_1, COUNT(*) as item_count FROM master_items WHERE physical_qty > 0 AND bin_1 IS NOT NULL AND country_code = :cc GROUP BY bin_1")
        res = await db.execute(query, {"cc": country})
        rows = res.all()
        bins_in_db = {str(row[0]).strip().upper(): row[1] for row in rows}

        # Cruzar con layout maestro (normalizar claves)
        storage_upper = {k.strip().upper(): v for k, v in storage.items()}
        matched_bins = {b: c for b, c in bins_in_db.items() if b in storage_upper}
        in_use_count = len(matched_bins)
        total_items_in_bins = sum(matched_bins.values())
        avg_items_per_bin = round(total_items_in_bins / in_use_count, 1) if in_use_count > 0 else 0

        # Saturación por zona y pasillo (contando ítems, no bins)
        zone_items = {}
        aisle_items = {}
        for bin_code, item_count in matched_bins.items():
            info = storage_upper.get(bin_code, {})
            z = info.get("zone", "Otras")
            a = info.get("aisle", "?")
            zone_items[z] = zone_items.get(z, 0) + item_count
            if a and a != "nan":
                aisle_items[a] = aisle_items.get(a, 0) + item_count

        # Top 5 pasillos más saturados
        top_aisles = sorted(aisle_items.items(), key=lambda x: x[1], reverse=True)[:5]
        # Zonas ordenadas por saturación
        zones_by_items = sorted(zone_items.items(), key=lambda x: x[1], reverse=True)

        return {
            "total": total_locations,
            "in_use": in_use_count,
            "free": total_locations - in_use_count,
            "occupancy_pct": round((in_use_count / total_locations * 100), 1) if total_locations > 0 else 0,
            "by_zone": zones,
            "avg_items_per_bin": avg_items_per_bin,
            "total_items_in_bins": total_items_in_bins,
            "zones_by_items": dict(zones_by_items),
            "top_aisles": dict(top_aisles)
        }
    except Exception as e:
        print(f"ERROR SUMMARY ({country}): {e}")
        return {"total": 0, "in_use": 0, "free": 0, "occupancy_pct": 0, "by_zone": {}}

@router.get("/slotting-config")
async def get_slotting_config(request: Request):
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    country = get_current_country(request) or "CL"
    params_path = get_slotting_params_path(country)
    if not os.path.exists(params_path): return {"turnover": {}, "storage": {}}
    with open(params_path, 'r') as f: return json.load(f)

@router.post("/slotting-config")
async def update_slotting_config(request: Request, data: dict = Body(...)):
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    country = get_current_country(request) or "CL"
    params_path = get_slotting_params_path(country)
    os.makedirs(os.path.dirname(params_path), exist_ok=True)
    with open(params_path, 'w') as f: json.dump(data, f, indent=4)
    return {"message": "Guardado"}

@router.post("/system/reload-data")
async def admin_reload_data(request: Request):
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    country = get_current_country(request) or "CL"
    await load_csv_data(country_code=country)
    return JSONResponse({'message': f'Datos para {country} recargados.'})
