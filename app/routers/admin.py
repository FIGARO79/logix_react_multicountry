"""
Router para endpoints administrativos.
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

router = APIRouter(prefix="/admin", tags=["admin_html"])
api_router = APIRouter(prefix="/api/admin", tags=["admin_api"])

def get_slotting_params_path(country_code: str) -> str:
    return os.path.join(JSON_FOLDER, country_code, 'slotting_parameters.json')

# --- Endpoints de Slotting ---

@api_router.get("/slotting-summary")
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

@api_router.get("/slotting-config")
async def get_slotting_config(request: Request):
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    
    country = get_current_country(request) or "CL"
    params_path = get_slotting_params_path(country)
    
    if not os.path.exists(params_path): return {"turnover": {}, "storage": {}}
    with open(params_path, 'r') as f: return json.load(f)

@api_router.post("/slotting-config")
async def update_slotting_config(request: Request, data: dict = Body(...)):
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    
    country = get_current_country(request) or "CL"
    params_path = get_slotting_params_path(country)
    os.makedirs(os.path.dirname(params_path), exist_ok=True)
    
    with open(params_path, 'w') as f: json.dump(data, f, indent=4)
    return {"message": "Guardado"}

@api_router.get("/slotting-template")
async def get_slotting_template(request: Request):
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    
    country = get_current_country(request) or "CL"
    params_path = get_slotting_params_path(country)
    
    data_list = []
    try:
        if os.path.exists(params_path):
            with open(params_path, 'r') as f:
                storage = json.load(f).get('storage', {})
                for b, i in storage.items():
                    data_list.append({"BIN": b, "ZONA": i.get('zone',''), "PASILLO": i.get('aisle',''), "NIVEL": i.get('level',0), "SPOT": i.get('spot','')})
    except: pass
    df = pd.DataFrame(data_list if data_list else [{"BIN":"EJM"}]).sort_values(by="BIN")
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer: df.to_excel(writer, index=False)
    output.seek(0)
    return Response(content=output.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={"Content-Disposition": f"attachment; filename=layout_{country}.xlsx"})

@api_router.post("/slotting-upload")
async def upload_slotting_config(request: Request, file: UploadFile = File(...)):
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    
    country = get_current_country(request) or "CL"
    params_path = get_slotting_params_path(country)
    
    try:
        df = pd.read_excel(BytesIO(await file.read()))
        new_storage = {}
        for _, r in df.iterrows():
            b = str(r.get("BIN", "")).strip().upper()
            if b and b.lower() != "nan":
                new_storage[b] = {
                    "zone": str(r.get("ZONA", "")), 
                    "aisle": str(r.get("PASILLO", "")), 
                    "level": int(r.get("NIVEL", 0)), 
                    "spot": str(r.get("SPOT", "Cold")).capitalize()
                }
        
        current_config = {"turnover": {}, "storage": {}}
        if os.path.exists(params_path):
            with open(params_path, 'r') as f:
                current_config = json.load(f)
        
        current_config["storage"] = new_storage
        os.makedirs(os.path.dirname(params_path), exist_ok=True)
        with open(params_path, 'w') as f: json.dump(current_config, f, indent=4)
        
        return {"message": f"Layout para {country} actualizado con {len(new_storage)} ubicaciones."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- End de Endpoints de Slotting ---

@router.get('/login', response_class=HTMLResponse, name='admin_login_get')
async def admin_login_get(request: Request):
    """Página de login de administrador."""
    return templates.TemplateResponse('admin_login.html', {'request': request})


@router.post('/login', response_class=HTMLResponse, name='admin_login_post')
async def admin_login_post(request: Request, password: str = Form(...)):
    """Procesa el login de administrador."""
    if password == ADMIN_PASSWORD:
        request.session['admin_logged_in'] = True
        response = RedirectResponse(url='/admin/users', status_code=302)
        return response
    else:
        return templates.TemplateResponse('admin_login.html', {
            'request': request,
            'error': 'Contraseña incorrecta.'
        })


@router.get('/users', response_class=HTMLResponse, name='admin_users_get')
async def admin_users_get(request: Request, db: AsyncSession = Depends(get_db)):
    """Página de gestión de usuarios."""
    if not request.session.get("admin_logged_in"):
        return RedirectResponse(url='/admin/login', status_code=302)
    
    users = await get_all_users(db)
    return templates.TemplateResponse('admin_users.html', {
        'request': request,
        'users': users
    })


@router.post('/system/reload-data', name='admin_reload_data')
async def admin_reload_data(request: Request):
    """Endpoint para recargar los datos CSV en memoria (Hot Reload)."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    country = get_current_country(request) or "CL"
    await load_csv_data(country_code=country)
    return JSONResponse({'message': f'Datos CSV para {country} recargados correctamente en memoria.'})


@router.post('/approve/{user_id}')
async def approve_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Aprueba un usuario."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    success = await approve_user_by_id(db, user_id)
    if success:
        return JSONResponse({'message': f'Usuario {user_id} aprobado.'})
    raise HTTPException(status_code=500, detail="Error al aprobar usuario.")


@router.post('/delete/{user_id}')
async def delete_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Elimina un usuario."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    success = await delete_user_by_id(db, user_id)
    if success:
        return JSONResponse({'message': f'Usuario {user_id} eliminado.'})
    raise HTTPException(status_code=404, detail="Usuario no encontrado.")


@router.post('/reset_password/{user_id}')
async def reset_password(request: Request, user_id: int, new_password: str = Form(...), db: AsyncSession = Depends(get_db)):
    """Restablece la contraseña de un usuario."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    success = await reset_user_password(db, user_id, new_password)
    if success:
        return JSONResponse({'message': f'Contraseña del usuario {user_id} restablecida.'})
    raise HTTPException(status_code=500, detail="Error al restablecer contraseña.")



# ===== APIs FOR REACT ADMIN =====

@api_router.post('/system/reload-data')
async def admin_reload_data_api(request: Request):
    """API: Recarga datos CSV (Hot Reload)."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=403, detail="No autorizado.")
    country = get_current_country(request) or "CL"
    await load_csv_data(country_code=country)
    return JSONResponse({'message': f'Datos CSV para {country} recargados correctamente en memoria.'})
@api_router.post('/approve/{user_id}')
async def approve_user_api(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """API: Aprueba un usuario."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    success = await approve_user_by_id(db, user_id)
    if success:
        return JSONResponse({'message': f'Usuario {user_id} aprobado.'})
    raise HTTPException(status_code=500, detail="Error al aprobar usuario.")

@api_router.post('/delete/{user_id}')
async def delete_user_api(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """API: Elimina un usuario."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    success = await delete_user_by_id(db, user_id)
    if success:
        return JSONResponse({'message': f'Usuario {user_id} eliminado.'})
    raise HTTPException(status_code=404, detail="Usuario no encontrado.")

@api_router.post('/reset_password/{user_id}')
async def reset_password_api(request: Request, user_id: int, new_password: str = Form(...), db: AsyncSession = Depends(get_db)):
    """API: Restablece contraseña."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    success = await reset_user_password(db, user_id, new_password)
    if success:
        return JSONResponse({'message': f'Contraseña del usuario {user_id} restablecida.'})
    raise HTTPException(status_code=500, detail="Error al restablecer contraseña.")

class PermissionUpdate(BaseModel):
    permissions: List[str]

@api_router.post('/permissions/{user_id}')
async def update_user_permissions(user_id: int, request: Request, data: PermissionUpdate, db: AsyncSession = Depends(get_db)):
    """API: Actualiza los permisos de un usuario."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    permissions_list = data.permissions
    permissions_str = ",".join(permissions_list)
    
    stmt = update(User).where(User.id == user_id).values(permissions=permissions_str)
    result = await db.execute(stmt)
    await db.commit()
    
    return JSONResponse({'message': f'Permisos actualizados para usuario {user_id}'})


# ===== APIs FOR REACT ADMIN =====

# ===== APIs FOR REACT ADMIN =====

@api_router.get('/users')
async def get_admin_users_api(request: Request, db: AsyncSession = Depends(get_db)):
    """API: Obtiene lista de usuarios."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=401, detail="No autorizado")
    
    try:
        users = await get_all_users(db)
        # get_all_users returns a list of dictionaries (from .to_dict())
        # Debug logging
        print(f"DEBUG: get_admin_users_api returning {len(users)} users")
        return JSONResponse(content=users)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": str(e), "detail": traceback.format_exc()}, status_code=500)

@api_router.post('/login')
async def admin_login_api(request: Request, data: dict):
    """API: Login de administrador."""
    password = data.get('password')
    if password == ADMIN_PASSWORD:
        request.session['admin_logged_in'] = True
        return JSONResponse(content={"message": "Login correcto", "success": True})
    else:
        return JSONResponse(content={"message": "Contraseña incorrecta", "success": False}, status_code=401)

