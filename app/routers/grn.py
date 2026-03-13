from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, desc
from app.core.db import get_db
from app.models.sql_models import GRNMaster
from app.models.schemas import GRNMasterCreate, GRNMasterUpdate, GRNMasterResponse
from app.utils.auth import permission_required
from app.services.grn_service import seed_grn_from_excel
from app.utils.country import get_current_country
from typing import List, Optional

router = APIRouter(prefix="/api/grn", tags=["grn"])

@router.get("/debug")
async def debug_auth(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Endpoint de diagnóstico para depurar problemas de autenticación."""
    from app.utils.auth import get_current_user
    from app.models.sql_models import User
    from sqlalchemy import select
    
    username = get_current_user(request)
    session_data = dict(request.session)
    
    if not username:
        return {
            "logged_in": False, 
            "session_keys": list(request.session.keys()),
            "session_data": session_data
        }
    
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    
    return {
        "logged_in": True,
        "username": username,
        "user_id": user.id if user else None,
        "is_approved": user.is_approved if user else None,
        "db_permissions": user.permissions if user else None,
        "permissions_list": user.permissions.split(',') if user and user.permissions else [],
        "session_keys": list(request.session.keys()),
        "has_inbound_permission": "inbound" in (user.permissions.split(',') if user and user.permissions else [])
    }

@router.get("", response_model=List[GRNMasterResponse])
async def list_grn_master(
    request: Request,
    import_reference: Optional[str] = None,
    waybill: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    username: str = Depends(permission_required("inbound"))
):
    """Lista los registros del maestro de GRN con filtros opcionales y paginación."""
    country = get_current_country(request) or "CL"
    stmt = select(GRNMaster).where(GRNMaster.country_code == country)
    if import_reference:
        stmt = stmt.where(GRNMaster.import_reference.contains(import_reference))
    if waybill:
        stmt = stmt.where(GRNMaster.waybill.contains(waybill))
    
    stmt = stmt.order_by(desc(GRNMaster.id)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("", response_model=GRNMasterResponse)
async def create_grn_master(
    request: Request,
    data: GRNMasterCreate,
    db: AsyncSession = Depends(get_db),
    username: str = Depends(permission_required("inbound"))
):
    """Crea un nuevo registro en el maestro de GRN."""
    country = get_current_country(request) or "CL"
    new_grn = GRNMaster(**data.dict(), country_code=country)
    db.add(new_grn)
    await db.commit()
    await db.refresh(new_grn)
    return new_grn

@router.put("/{grn_id}", response_model=GRNMasterResponse)
async def update_grn_master(
    request: Request,
    grn_id: int,
    data: GRNMasterUpdate,
    db: AsyncSession = Depends(get_db),
    username: str = Depends(permission_required("inbound"))
):
    """Actualiza un registro existente."""
    country = get_current_country(request) or "CL"
    result = await db.execute(select(GRNMaster).where(GRNMaster.id == grn_id, GRNMaster.country_code == country))
    grn = result.scalar_one_or_none()
    
    if not grn:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(grn, key, value)
    
    await db.commit()
    await db.refresh(grn)
    return grn

@router.delete("/{grn_id}")
async def delete_grn_master(
    request: Request,
    grn_id: int,
    db: AsyncSession = Depends(get_db),
    username: str = Depends(permission_required("inbound"))
):
    """Elimina un registro del maestro."""
    country = get_current_country(request) or "CL"
    result = await db.execute(select(GRNMaster).where(GRNMaster.id == grn_id, GRNMaster.country_code == country))
    grn = result.scalar_one_or_none()
    
    if not grn:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    
    await db.delete(grn)
    await db.commit()
    return {"message": "Registro eliminado"}

@router.post("/sync")
async def sync_grn_master(
    request: Request,
    db: AsyncSession = Depends(get_db),
    username: str = Depends(permission_required("admin"))
):
    """Fuerza la sincronización inicial desde el archivo Excel."""
    country = get_current_country(request) or "CL"
    return await seed_grn_from_excel(db, country_code=country)
