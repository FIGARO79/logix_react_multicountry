"""
Router para endpoints administrativos.
"""
from fastapi import APIRouter, Request, Form, Depends, HTTPException, Body
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from pydantic import BaseModel
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.utils.auth import get_all_users, approve_user_by_id, delete_user_by_id, reset_user_password, get_user_by_id
from app.models.sql_models import User
from sqlalchemy import update
from app.core.config import ADMIN_PASSWORD
from app.core.templates import templates
from app.services.csv_handler import load_csv_data
from app.utils.country import get_current_country

router = APIRouter(prefix="/admin", tags=["admin_html"])
api_router = APIRouter(prefix="/api/admin", tags=["admin_api"])


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
    
    country = get_current_country(request) or "MX"
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
    country = get_current_country(request) or "MX"
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

