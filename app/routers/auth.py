"""
Router para endpoints de autenticación y gestión de contraseñas (API ONLY).
"""
from fastapi import APIRouter, Request, Form, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.utils.auth import (
    create_user,
    verify_user,
    is_strong_password,
    generate_password_reset_token,
    get_user_by_id,
    admin_login_required,
    get_token_data,
    mark_token_as_used,
    reset_user_password
)
from app.models.sql_models import User
from sqlalchemy import select
import datetime
from typing import Optional

router = APIRouter(tags=["auth"])


@router.post('/api/register')
async def register_api(request: Request, username: str = Form(...), password: str = Form(...), country: Optional[str] = Form("CL"), db: AsyncSession = Depends(get_db)):
    """API: Procesa el registro de un nuevo usuario."""
    # ... rest of code
    if not is_strong_password(password):
        return JSONResponse(status_code=400, content={"error": "La contraseña debe tener al menos 8 caracteres, incluir letras y dígitos."})

    success = await create_user(db, username, password, country_code=country, is_approved=0)
    if success:
        return JSONResponse(content={"message": "Registro exitoso. Espera la aprobación del administrador."})
    else:
        return JSONResponse(status_code=400, content={"error": "El nombre de usuario ya existe."})


@router.post('/api/login')
async def login_api(request: Request, username: str = Form(...), password: str = Form(...), country: Optional[str] = Form("CL"), db: AsyncSession = Depends(get_db)):
    """API: Procesa el login de un usuario y retorna JSON."""
    valid, status_msg = await verify_user(db, username, password, country_code=country)
    
    if status_msg == "approved":
        request.session['user'] = username
        request.session['country_code'] = country
        # Obtener detalles del usuario para enviarlos al frontend (frontend permissions)
        result = await db.execute(select(User).where(User.username == username))
        user_obj = result.scalar_one_or_none()
        user_data = user_obj.to_dict() if user_obj else {"username": username, "permissions": ""}
        
        return JSONResponse(content={"message": "Login successful", "user": user_data})
    elif status_msg == "pending":
        return JSONResponse(status_code=403, content={"error": "Tu cuenta está pendiente de aprobación por el administrador."})
    else:
        return JSONResponse(status_code=401, content={"error": "Nombre de usuario o contraseña incorrectos."})


@router.post('/api/logout')
async def logout_api(request: Request):
    """API: Cierra la sesión del usuario."""
    user = request.session.pop('user', None)
    return JSONResponse(content={"message": "Logout successful", "username": user})


@router.post('/api/set_password')
async def set_password_api(token: str = Form(...), new_password: str = Form(...), confirm_password: str = Form(...), db: AsyncSession = Depends(get_db)):
    """API: Procesa el cambio de contraseña."""
    token_data = await get_token_data(db, token)

    if not token_data or token_data.used or datetime.datetime.fromisoformat(token_data.expires_at) < datetime.datetime.now(datetime.timezone.utc):
        return JSONResponse(status_code=400, content={"error": "Token inválido o expirado."})

    if new_password != confirm_password:
        return JSONResponse(status_code=400, content={"error": "Las contraseñas no coinciden."})

    if not is_strong_password(new_password):
        return JSONResponse(status_code=400, content={"error": "La contraseña debe tener al menos 8 caracteres, incluir letras y dígitos."})
    
    success = await reset_user_password(db, token_data.user_id, new_password)
    if success:
        await mark_token_as_used(db, token)
        return JSONResponse(content={"message": "Contraseña actualizada con éxito."})
    
    return JSONResponse(status_code=500, content={"error": "Ocurrió un error al actualizar la contraseña."})


@router.post('/api/admin/generate_reset_token/{user_id}')
async def admin_generate_reset_token_api(request: Request, user_id: int, admin: bool = Depends(admin_login_required), db: AsyncSession = Depends(get_db)):
    """API: Genera un token de reseteo para un usuario (requiere admin)."""
    if not admin:
        raise HTTPException(status_code=403, detail="No autorizado")

    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    token = await generate_password_reset_token(db, user_id)
    
    return JSONResponse(content={
        "message": f"Token generado correctamente.",
        "reset_token": token,
        "reset_user": user['username'],
        "reset_link": f"/set_password?token={token}" # Frontend URL suggestion
    })
