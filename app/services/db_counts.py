"""
Servicio de base de datos - Operaciones de conteos y sesiones (Migrado a ORM).
"""
import datetime
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from app.models.sql_models import StockCount, CountSession, AppState, SessionLocation, CycleCount
from typing import List, Dict, Any, Optional

async def load_all_counts_db_async(db: AsyncSession, country_code: str) -> List[Dict[str, Any]]:
    """Carga todos los conteos de stock para el país."""
    try:
        result = await db.execute(select(StockCount).where(StockCount.country_code == country_code).order_by(StockCount.id.desc()))
        counts = result.scalars().all()
        # Convertir a diccionarios
        return [
            {
                "id": c.id,
                "session_id": c.session_id,
                "timestamp": c.timestamp,
                "item_code": c.item_code,
                "item_description": c.item_description,
                "counted_qty": c.counted_qty,
                "counted_location": c.counted_location,
                "bin_location_system": c.bin_location_system,
                "username": c.username
            }
            for c in counts
        ]
    except Exception as e:
        print(f"DB Error (load_all_counts_db_async): {e}")
        return []


async def create_count_session(db: AsyncSession, username: str, country_code: str) -> Dict[str, Any]:
    """Crea una nueva sesión de conteo para un usuario y país."""
    try:
        # Obtener la etapa de inventario global actual para el país
        result = await db.execute(select(AppState).where(AppState.key == 'current_inventory_stage', AppState.country_code == country_code))
        stage_row = result.scalar_one_or_none()
        current_stage = int(stage_row.value) if (stage_row and stage_row.value) else 0

        # Validación de etapa
        if current_stage == 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No se puede iniciar sesión: El administrador aún no ha generado la Etapa 1 del inventario."
            )

        # Finalizar sesiones anteriores del mismo usuario
        stmt = update(CountSession).where(
            CountSession.user_username == username,
            CountSession.status == 'in_progress',
            CountSession.country_code == country_code
        ).values(
            status='completed',
            end_time=datetime.datetime.now().isoformat(timespec='seconds')
        )
        await db.execute(stmt)

        # Crear nueva sesión
        new_session = CountSession(
            user_username=username,
            start_time=datetime.datetime.now().isoformat(timespec='seconds'),
            status='in_progress',
            inventory_stage=current_stage,
            country_code=country_code
        )
        db.add(new_session)
        await db.commit()
        await db.refresh(new_session)
        
        return {"session_id": new_session.id, "inventory_stage": current_stage, "message": f"Sesión {new_session.id} (Etapa {current_stage}) iniciada."}
    
    except Exception as e:
        print(f"Database error in create_count_session: {e}")
        await db.rollback()
        # Re-lanzar excepciones HTTP para que lleguen al cliente
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")


async def get_active_session_for_user(db: AsyncSession, username: str, country_code: str) -> Optional[Dict[str, Any]]:
    """Obtiene la sesión activa de un usuario en un país."""
    result = await db.execute(
        select(CountSession)
        .where(CountSession.user_username == username, CountSession.status == 'in_progress', CountSession.country_code == country_code)
        .order_by(CountSession.start_time.desc())
        .limit(1)
    )
    session = result.scalar_one_or_none()
    if session:
        return {
            "id": session.id,
            "user_username": session.user_username,
            "start_time": session.start_time,
            "end_time": session.end_time,
            "status": session.status,
            "inventory_stage": session.inventory_stage
        }
    return None


async def close_count_session(db: AsyncSession, session_id: int, username: str, country_code: str) -> Dict[str, str]:
    """Cierra una sesión de conteo."""
    # Verificar que la sesión pertenece al usuario y país
    result = await db.execute(select(CountSession).where(CountSession.id == session_id, CountSession.user_username == username, CountSession.country_code == country_code))
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=403, detail="No tienes permiso para cerrar esta sesión o no existe.")

    session.status = 'completed'
    session.end_time = datetime.datetime.now().isoformat(timespec='seconds')
    await db.commit()
    
    return {"message": f"Sesión {session_id} cerrada con éxito."}


async def close_location_in_session(db: AsyncSession, session_id: int, location_code: str, username: str, country_code: str) -> Dict[str, str]:
    """Marca una ubicación como cerrada en una sesión."""
    # Verificar que la sesión existe y pertenece al usuario y está activa para el país
    result = await db.execute(
        select(CountSession)
        .where(CountSession.id == session_id, CountSession.user_username == username, CountSession.status == 'in_progress', CountSession.country_code == country_code)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=403, detail="La sesión no es válida o no te pertenece.")

    # Verificar si ya existe el registro de ubicación
    result_loc = await db.execute(
        select(SessionLocation).where(SessionLocation.session_id == session_id, SessionLocation.location_code == location_code)
    )
    location_entry = result_loc.scalar_one_or_none()

    now_ts = datetime.datetime.now().isoformat(timespec='seconds')

    if location_entry:
        location_entry.status = 'closed'
        location_entry.closed_at = now_ts
    else:
        new_location = SessionLocation(
            session_id=session_id,
            location_code=location_code,
            status='closed',
            closed_at=now_ts
        )
        db.add(new_location)
    
    await db.commit()
    return {"message": f"Ubicación {location_code} cerrada para la sesión {session_id}."}


async def reopen_location_in_session(db: AsyncSession, session_id: int, location_code: str, username: str, country_code: str) -> Dict[str, str]:
    """Reabre una ubicación en una sesión."""
    # Verificar sesión y país
    result = await db.execute(
        select(CountSession)
        .where(CountSession.id == session_id, CountSession.user_username == username, CountSession.status == 'in_progress', CountSession.country_code == country_code)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=403, detail="La sesión no es válida o no te pertenece.")

    # Buscar ubicación
    result_loc = await db.execute(
        select(SessionLocation).where(SessionLocation.session_id == session_id, SessionLocation.location_code == location_code)
    )
    location_entry = result_loc.scalar_one_or_none()
    
    if location_entry:
        location_entry.status = 'open'
        location_entry.closed_at = None
        await db.commit()
        return {"message": f"Ubicación {location_code} reabierta."}
    else:
        raise HTTPException(status_code=404, detail="La ubicación no estaba cerrada.")


async def get_locations_for_session(db: AsyncSession, session_id: int, username: str, country_code: str) -> List[Dict[str, Any]]:
    """Obtiene todas las ubicaciones de una sesión."""
    # Verificar permiso y país
    result = await db.execute(select(CountSession).where(CountSession.id == session_id, CountSession.user_username == username, CountSession.country_code == country_code))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="No tienes permiso para ver esta sesión.")

    result_locs = await db.execute(select(SessionLocation).where(SessionLocation.session_id == session_id, SessionLocation.country_code == country_code))
    locations = result_locs.scalars().all()
    
    return [{"location_code": loc.location_code, "status": loc.status} for loc in locations]


async def get_counts_for_location(db: AsyncSession, session_id: int, location_code: str, username: str, country_code: str) -> List[Dict[str, Any]]:
    """Obtiene todos los conteos para una ubicación específica en un país."""
    # Verificar permiso y país
    result = await db.execute(select(CountSession).where(CountSession.id == session_id, CountSession.user_username == username, CountSession.country_code == country_code))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="No tienes permiso para ver estos datos.")

    result_counts = await db.execute(
        select(StockCount)
        .where(StockCount.session_id == session_id, StockCount.counted_location == location_code, StockCount.country_code == country_code)
        .order_by(StockCount.timestamp.desc())
    )
    counts = result_counts.scalars().all()
    
    return [
        {
            "id": c.id,
            "session_id": c.session_id,
            "timestamp": c.timestamp,
            "item_code": c.item_code,
            "item_description": c.item_description,
            "counted_qty": c.counted_qty,
            "counted_location": c.counted_location,
            "bin_location_system": c.bin_location_system,
            "username": c.username
        } 
        for c in counts
    ]


async def save_stock_count(db: AsyncSession, session_id: int, item_code: str, counted_qty: int, 
                           counted_location: str, description: str, 
                           bin_location_system: str, username: str, country_code: str) -> Optional[int]:
    """Guarda un conteo de stock para un país."""
    try:
        new_count = StockCount(
            session_id=session_id,
            timestamp=datetime.datetime.now().isoformat(timespec='seconds'),
            item_code=item_code,
            item_description=description,
            counted_qty=counted_qty,
            counted_location=counted_location,
            bin_location_system=bin_location_system,
            username=username,
            country_code=country_code
        )
        db.add(new_count)
        await db.commit()
        await db.refresh(new_count)

        # --- NUEVO: Registrar también en CycleCount para el planificador ---
        # Se asume que cada conteo válido cuenta como un "ciclo" completado para ese item
        try:
            new_cycle_entry = CycleCount(
                item_code=item_code,
                timestamp=new_count.timestamp,
                abc_code=None,
                count_id=new_count.id,
                country_code=country_code
            )
            db.add(new_cycle_entry)
            await db.commit()
        except Exception as e_cycle:
            print(f"Advertencia: No se pudo registrar en cycle_counts: {e_cycle}")
            # No hacemos rollback del conteo principal, solo logueamos el error

        return new_count.id
    except Exception as e:
        print(f"DB Error (save_stock_count): {e}")
        await db.rollback()
        return None


async def delete_stock_count(db: AsyncSession, count_id: int, country_code: str) -> bool:
    """Elimina un conteo de stock."""
    try:
        stmt = delete(StockCount).where(StockCount.id == count_id, StockCount.country_code == country_code)
        result = await db.execute(stmt)
        await db.commit()
        return result.rowcount > 0
    except Exception as e:
        print(f"DB Error (delete_stock_count) para ID {count_id}: {e}")
        await db.rollback()
        return False
