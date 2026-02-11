from fastapi import Request, status, HTTPException, Depends
from starlette.responses import RedirectResponse
from werkzeug.security import generate_password_hash, check_password_hash
from typing import List, Dict, Any, Optional, Callable
import secrets
import datetime
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from app.models.sql_models import User, PasswordResetToken
from app.core.db import get_db

# --- Funciones de Lógica de Usuario ---

async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[Dict[str, Any]]:
    """Obtiene un usuario por su ID usando ORM."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    return user.to_dict() if user else None

async def create_user(db: AsyncSession, username: str, password: str, country_code: str = "MX", is_approved: int = 0, permissions: str = "") -> bool:
    """
    Crea un nuevo usuario en la base de datos.
    Devuelve True si se creó con éxito, False si el usuario ya existe.
    """
    if not is_strong_password(password):
        return False

    # Verificar si existe
    result = await db.execute(select(User).where(User.username == username))
    if result.scalar_one_or_none():
        return False

    hashed_password = generate_password_hash(password)
    new_user = User(
        username=username, 
        password_hash=hashed_password, 
        country_code=country_code,
        is_approved=is_approved, 
        permissions=permissions
    )
    
    db.add(new_user)
    await db.commit()
    return True

async def verify_user(db: AsyncSession, username: str, password: str, country_code: str) -> tuple[bool, str]:
    """
    Verifica las credenciales del usuario.
    Devuelve una tupla: (True/False si es válido, 'approved'/'pending'/'invalid' como estado).
    """
    result = await db.execute(select(User).where(User.username == username, User.country_code == country_code))
    user = result.scalar_one_or_none()

    if user and check_password_hash(user.password_hash, password):
        if user.is_approved == 1:
            return True, "approved"
        else:
            return True, "pending"
    return False, "invalid"

def is_strong_password(password: str) -> bool:
    """Verifica que la contraseña cumple con los criterios de seguridad."""
    if len(password) < 8:
        return False
    if not re.search(r"[a-zA-Z]", password):
        return False
    if not re.search(r"[0-9]", password):
        return False
    return True

# --- Funciones de Lógica de Administrador y Reseteo de Contraseña ---

async def get_all_users(db: AsyncSession) -> List[Dict[str, Any]]:
    """Obtiene todos los usuarios de la base de datos."""
    result = await db.execute(select(User).order_by(User.id.desc()))
    users = result.scalars().all()
    return [user.to_dict() for user in users]

async def approve_user_by_id(db: AsyncSession, user_id: int) -> bool:
    """Aprueba un usuario por su ID."""
    stmt = update(User).where(User.id == user_id).values(is_approved=1)
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount > 0

async def delete_user_by_id(db: AsyncSession, user_id: int) -> bool:
    """Elimina un usuario por su ID."""
    stmt = delete(User).where(User.id == user_id)
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount > 0

async def reset_user_password(db: AsyncSession, user_id: int, new_password: str) -> bool:
    """Restablece la contraseña de un usuario por su ID."""
    if not is_strong_password(new_password):
        return False
    new_hashed_password = generate_password_hash(new_password)
    
    stmt = update(User).where(User.id == user_id).values(password_hash=new_hashed_password)
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount > 0

async def generate_password_reset_token(db: AsyncSession, user_id: int) -> str:
    """Genera y guarda un token de reseteo de contraseña."""
    token = secrets.token_urlsafe(32)
    now = datetime.datetime.now(datetime.timezone.utc)
    expires = now + datetime.timedelta(hours=1)
    
    new_token = PasswordResetToken(
        user_id=user_id,
        token=token,
        expires_at=expires.isoformat(),
        created_at=now.isoformat(),
        used=0
    )
    db.add(new_token)
    await db.commit()
    return token

async def get_token_data(db: AsyncSession, token: str) -> Optional[PasswordResetToken]:
    """Helper para obtener datos del token."""
    result = await db.execute(select(PasswordResetToken).where(PasswordResetToken.token == token))
    return result.scalar_one_or_none()

async def mark_token_as_used(db: AsyncSession, token: str):
    stmt = update(PasswordResetToken).where(PasswordResetToken.token == token).values(used=1)
    await db.execute(stmt)
    await db.commit()

# --- Dependencias de Autenticación (Sin cambios en firmas, solo lógica interna si aplica) ---

def get_current_user(request: Request) -> str | None:
    """
    Obtiene el nombre de usuario de la sesión segura.
    Devuelve el nombre de usuario o None si no está logueado.
    """
    return request.session.get("user")

def login_required(request: Request) -> str | RedirectResponse:
    """
    Dependencia de FastAPI que verifica si un usuario está logueado.
    Si el usuario no está en la sesión, redirige a la página de login.
    Si está logueado, devuelve el nombre de usuario.
    """
    username = get_current_user(request)
    if not username:
        try:
            login_url = request.app.url_path_for('login')
            return RedirectResponse(url=login_url, status_code=status.HTTP_302_FOUND)
        except Exception:
            return RedirectResponse(url='/login', status_code=status.HTTP_302_FOUND)
    return username

def admin_login_required(request: Request) -> bool | RedirectResponse:
    """
    Dependencia que verifica si el flag de administrador está en la sesión segura.
    """
    if not request.session.get("admin_logged_in"):
        try:
            admin_login_url = request.app.url_path_for('admin_login_get')
            return RedirectResponse(url=admin_login_url, status_code=status.HTTP_302_FOUND)
        except Exception:
            return RedirectResponse(url='/admin/login', status_code=status.HTTP_302_FOUND)
    return True

def api_login_required(request: Request) -> str:
    """
    Dependencia de FastAPI para APIs que verifica si un usuario está logueado.
    Si el usuario no está en la sesión, lanza una excepción HTTP 401.
    Si está logueado, devuelve el nombre de usuario.
    """
    username = get_current_user(request)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado"
        )
    return username

def permission_required(module: str | List[str]) -> Callable:
    """
    Dependencia factory para verificar permisos de módulo.
    Si module es str: requiere ese permiso específico.
    Si module es list: requiere AL MENOS UNO de los permisos en la lista.
    """
    async def _check_permission(request: Request, db: AsyncSession = Depends(get_db)):
        username = api_login_required(request) # Verifica login y obtiene username
        
        # Obtener usuario y permisos
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
            
        # Si es admin, permitir todo
        if username == 'admin':
            return username

        perms = user.permissions.split(',') if user.permissions else []
        
        required_modules = [module] if isinstance(module, str) else module
        
        # Verificar si tiene AL MENOS UNO de los requeridos
        has_permission = any(m in perms for m in required_modules)
        
        if not has_permission:
            detail_msg = f"Acceso denegado: Se requiere permiso '{module}'" if isinstance(module, str) else f"Acceso denegado: Se requiere uno de los permisos {required_modules}"
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail=detail_msg
            )
        return username
        
    return _check_permission
