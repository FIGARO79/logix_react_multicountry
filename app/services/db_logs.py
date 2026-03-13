"""
Servicio de base de datos - Operaciones de logs (inbound).
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, desc
from app.models.sql_models import Log
from typing import Dict, Any, Optional, List
import datetime
from sqlalchemy import distinct

async def save_log_entry_db_async(db: AsyncSession, entry_data: Dict[str, Any], country_code: str) -> Optional[int]:
    """Guarda una entrada de log en la base de datos."""
    try:
        new_log = Log(
            timestamp=entry_data.get('timestamp'),
            importReference=entry_data.get('importReference', ''),
            waybill=entry_data.get('waybill'),
            itemCode=entry_data.get('itemCode'),
            itemDescription=entry_data.get('itemDescription'),
            binLocation=entry_data.get('binLocation'),
            relocatedBin=entry_data.get('relocatedBin'),
            qtyReceived=entry_data.get('qtyReceived'),
            qtyGrn=entry_data.get('qtyGrn'),
            difference=entry_data.get('difference'),
            country_code=country_code
            # Nota: observaciones se omite porque no existe en tabla MySQL
        )
        db.add(new_log)
        await db.commit()
        await db.refresh(new_log)
        return new_log.id
    except Exception as e:
        print(f"DB Error (save_log_entry_db_async): {e}")
        await db.rollback()
        return None


async def update_log_entry_db_async(db: AsyncSession, log_id: int, entry_data_for_db: Dict[str, Any], country_code: str) -> bool:
    """Actualiza una entrada de log existente."""
    try:
        stmt = update(Log).where(Log.id == log_id, Log.country_code == country_code).values(
            waybill=entry_data_for_db.get('waybill'),
            relocatedBin=entry_data_for_db.get('relocatedBin'),
            qtyReceived=entry_data_for_db.get('qtyReceived'),
            qtyGrn=entry_data_for_db.get('qtyGrn'),
            difference=entry_data_for_db.get('difference'),
            timestamp=entry_data_for_db.get('timestamp')
            # Nota: observaciones se omite porque no existe en tabla MySQL
        )
        result = await db.execute(stmt)
        await db.commit()
        return result.rowcount > 0
    except Exception as e:
        print(f"DB Error (update_log_entry_db_async) para ID {log_id}: {e}")
        await db.rollback()
        return False


async def load_log_data_db_async(db: AsyncSession, country_code: str) -> List[Dict[str, Any]]:
    """Carga todos los logs de la base de datos."""
    try:
        # Default: Cargar solo logs activos (archived_at es NULL)
        stmt = select(Log).where(Log.archived_at.is_(None), Log.country_code == country_code).order_by(Log.id.desc())
        result = await db.execute(stmt)
        logs = result.scalars().all()
        # Convertir a dict explícitamente porque los modelos ORM no son dicts
        return [
            {
                "id": log.id,
                "timestamp": log.timestamp,
                "importReference": log.importReference,
                "waybill": log.waybill,
                "itemCode": log.itemCode,
                "itemDescription": log.itemDescription,
                "binLocation": log.binLocation,
                "relocatedBin": log.relocatedBin,
                "qtyReceived": log.qtyReceived,
                "qtyGrn": log.qtyGrn,
                "difference": log.difference,
                "observaciones": ""  # Columna no existe en tabla MySQL
            }
            for log in logs
        ]
    except Exception as e:
        print(f"DB Error (load_log_data_db_async): {e}")
        return []


async def get_log_entry_by_id_async(db: AsyncSession, log_id: int, country_code: str) -> Optional[Dict[str, Any]]:
    """Obtiene una entrada de log por ID."""
    try:
        result = await db.execute(select(Log).where(Log.id == log_id, Log.country_code == country_code))
        log = result.scalar_one_or_none()
        if log:
            return {
                "id": log.id,
                "timestamp": log.timestamp,
                "importReference": log.importReference,
                "waybill": log.waybill,
                "itemCode": log.itemCode,
                "itemDescription": log.itemDescription,
                "binLocation": log.binLocation,
                "relocatedBin": log.relocatedBin,
                "qtyReceived": log.qtyReceived,
                "qtyGrn": log.qtyGrn,
                "difference": log.difference,
                "observaciones": ""  # Columna no existe en tabla MySQL
            }
        return None
    except Exception as e:
        print(f"DB Error (get_log_entry_by_id_async) para ID {log_id}: {e}")
        return None


async def get_total_received_for_import_reference_async(db: AsyncSession, import_reference: str, item_code: str, country_code: str) -> int:
    """Obtiene el total recibido para una referencia de importación e item."""
    try:
        stmt = select(func.sum(Log.qtyReceived)).where(
            Log.importReference == import_reference,
            Log.itemCode == item_code,
            Log.country_code == country_code,
            Log.archived_at.is_(None)
        )
        result = await db.execute(stmt)
        total_received = result.scalar()
        return int(total_received) if total_received is not None else 0
    except Exception as e: 
        print(f"DB Error (get_total_received_for_import_reference_async): {e}")
        return 0


async def delete_log_entry_db_async(db: AsyncSession, log_id: int, country_code: str) -> bool:
    """Elimina una entrada de log."""
    try:
        stmt = delete(Log).where(Log.id == log_id, Log.country_code == country_code)
        result = await db.execute(stmt)
        await db.commit()
        return result.rowcount > 0
    except Exception as e:
        print(f"DB Error (delete_log_entry_db_async) para ID {log_id}: {e}")
        await db.rollback()
        return False


async def get_latest_relocated_bin_async(db: AsyncSession, item_code: str, country_code: str) -> Optional[str]:
    """Obtiene el último bin de reubicación para un item."""
    try:
        stmt = select(Log.relocatedBin).where(
            Log.itemCode == item_code,
            Log.country_code == country_code,
            Log.relocatedBin.is_not(None),
            Log.relocatedBin != '',
            Log.archived_at.is_(None)
        ).order_by(Log.id.desc()).limit(1)
        
        result = await db.execute(stmt)
        latest_bin = result.scalar_one_or_none()
        return latest_bin
    except Exception as e:
        print(f"DB Error (get_latest_relocated_bin_async): {e}")
        return None

async def archive_current_logs_db_async(db: AsyncSession, country_code: str) -> bool:
    """Archiva todos los logs activos asignándoles la fecha actual."""
    try:
        current_time_iso = datetime.datetime.now().isoformat(timespec='seconds')
        stmt = update(Log).where(Log.archived_at.is_(None), Log.country_code == country_code).values(archived_at=current_time_iso)
        result = await db.execute(stmt)
        await db.commit()
        return True # Always return true, even if 0 rows updated
    except Exception as e:
        print(f"DB Error (archive_current_logs_db_async): {e}")
        await db.rollback()
        return False

async def get_archived_versions_db_async(db: AsyncSession, country_code: str) -> List[str]:
    """Obtiene una lista de las fechas de archivado únicas."""
    try:
        # Fetch all dates (including duplicates)
        stmt = select(Log.archived_at).where(Log.archived_at.is_not(None), Log.country_code == country_code).order_by(Log.archived_at.desc())
        result = await db.execute(stmt)
        dates = result.scalars().all()
        
        # Deduplicate preserving order (Python 3.7+ dict is insertion ordered)
        unique_versions = list(dict.fromkeys([d for d in dates if d]))
        return unique_versions
    except Exception as e:
        print(f"DB Error (get_archived_versions_db_async): {e}")
        return []

async def load_archived_log_data_db_async(db: AsyncSession, country_code: str, version_date: str) -> List[Dict[str, Any]]:
    """Carga los logs de una versión archivada específica (Parámetros estandarizados)."""
    try:
        stmt = select(Log).where(Log.archived_at == version_date, Log.country_code == country_code).order_by(Log.id.desc())
        result = await db.execute(stmt)
        logs = result.scalars().all()
        return [
            {
                "id": log.id,
                "timestamp": log.timestamp,
                "importReference": log.importReference,
                "waybill": log.waybill,
                "itemCode": log.itemCode,
                "itemDescription": log.itemDescription,
                "binLocation": log.binLocation,
                "relocatedBin": log.relocatedBin,
                "qtyReceived": log.qtyReceived,
                "qtyGrn": log.qtyGrn,
                "difference": log.difference,
                "observaciones": ""
            }
            for log in logs
        ]
    except Exception as e:
        print(f"DB Error (load_archived_log_data_db_async): {e}")
        return []

async def load_all_logs_db_async(db: AsyncSession, country_code: str) -> List[Dict[str, Any]]:
    """Carga TODOS los logs de la base de datos (activos y archivados)."""
    try:
        stmt = select(Log).where(Log.country_code == country_code).order_by(Log.id.desc())
        result = await db.execute(stmt)
        logs = result.scalars().all()
        return [
            {
                "id": log.id,
                "timestamp": log.timestamp,
                "importReference": log.importReference,
                "waybill": log.waybill,
                "itemCode": log.itemCode,
                "itemDescription": log.itemDescription,
                "binLocation": log.binLocation,
                "relocatedBin": log.relocatedBin,
                "qtyReceived": log.qtyReceived,
                "qtyGrn": log.qtyGrn,
                "difference": log.difference,
                "archived_at": log.archived_at,
                "observaciones": ""
            }
            for log in logs
        ]
    except Exception as e:
        print(f"DB Error (load_all_logs_db_async): {e}")
        return []
