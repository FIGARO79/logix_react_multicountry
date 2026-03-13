"""
Router para la planificación de conteos de inventario.
Genera un archivo Excel con los conteos sugeridos basado en la clasificación ABC y el historial.
"""
import datetime
import random
from io import BytesIO
from typing import List
import pandas as pd
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.db import get_db
from app.models.schemas import CountExecutionRequest
from app.models.sql_models import CycleCount, CycleCountRecording, MasterItem
from app.services import csv_handler
from app.utils.auth import login_required, permission_required
import json
import os
from pydantic import BaseModel

router = APIRouter(prefix="/api/planner", tags=["planner"])

# --- Modelos Pydantic ---
class PlannerConfigModel(BaseModel):
    start_date: str
    end_date: str
    holidays: List[str]

# --- Configuración de Negocio ---
FREQUENCY_MAP = {
    "A": 3,  # 3 veces al año
    "B": 2,  # 2 veces al año
    "C": 1   # 1 vez al año
}

# --- Persistencia de Configuración ---
from app.core.config import PROJECT_ROOT
from app.utils.country import get_current_country

# Rutas base para JSONs (serán segmentadas por país)
CONFIG_BASE_DIR = os.path.join(PROJECT_ROOT, "static/json")

def get_planner_paths(country_code: str):
    """Obtiene las rutas de archivos para un país específico."""
    country_dir = os.path.join(CONFIG_BASE_DIR, country_code)
    os.makedirs(country_dir, exist_ok=True)
    return {
        "config": os.path.join(country_dir, "planner_config.json"),
        "plan": os.path.join(country_dir, "planner_data.json")
    }

def load_config(country_code: str = "CL"):
    """Carga la configuración desde el archivo JSON del país, o usa defaults."""
    paths = get_planner_paths(country_code)
    config_file = paths["config"]
    
    default_holidays = [
        "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03",
        "2026-05-01", "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29",
        "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02",
        "2026-11-16", "2026-12-08", "2026-12-25"
    ]
    
    default_config = {
        "start_date": f"{datetime.datetime.now().year}-01-01",
        "end_date": f"{datetime.datetime.now().year}-12-31",
        "holidays": default_holidays
    }
    
    config = default_config
    if os.path.exists(config_file):
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
                config.update(loaded)
        except Exception:
            pass
            
    return config

def save_config(config_data, country_code: str = "CL"):
    """Guarda la configuración en el archivo JSON del país."""
    paths = get_planner_paths(country_code)
    config_file = paths["config"]
    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump(config_data, f, indent=4)

def load_plan_data(country_code: str = "CL"):
    """Carga los datos del plan calculeado/guardado para el país."""
    paths = get_planner_paths(country_code)
    plan_file = paths["plan"]
    if not os.path.exists(plan_file):
        return None
    try:
        with open(plan_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None

def save_plan_data(data, country_code: str = "CL"):
    """Guarda los datos del plan en JSON para el país."""
    paths = get_planner_paths(country_code)
    plan_file = paths["plan"]
    with open(plan_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)

def get_working_days(start_date: datetime.date, end_date: datetime.date, holidays: set):
    """Genera una lista de días hábiles, excluyendo festivos del país."""
    working_days = []
    current_date = start_date
    while current_date <= end_date:
        if current_date.weekday() < 5 and current_date not in holidays:
            working_days.append(current_date)
        current_date += datetime.timedelta(days=1)
    return working_days

async def calculate_count_plan_data(start_date: str, end_date: str, db: AsyncSession, country_code: str):
    """
    Lógica central para calcular el plan de conteos filtrado por país.
    """
    config = load_config(country_code)
    holidays = {datetime.datetime.strptime(d, "%Y-%m-%d").date() for d in config.get("holidays", [])}
    try:
        s_date = datetime.datetime.strptime(start_date, '%Y-%m-%d').date()
        e_date = datetime.datetime.strptime(end_date, '%Y-%m-%d').date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD.")

    if s_date > e_date:
        raise HTTPException(status_code=400, detail="La fecha de inicio debe ser anterior a la fecha de fin.")

    # 1. Obtener todos los items del maestro desde DB filtrados por país
    stmt_master = select(MasterItem).where(MasterItem.physical_qty > 0, MasterItem.country_code == country_code)
    result_master = await db.execute(stmt_master)
    items_db = result_master.scalars().all()
    
    if not items_db:
        # Fallback: Si la tabla está vacía, intentar sincronizar al vuelo
        from app.services.csv_to_db import sync_master_csv_to_db
        await sync_master_csv_to_db(db)
        # Re-intentar
        result_master = await db.execute(stmt_master)
        items_db = result_master.scalars().all()

    if not items_db:
         raise HTTPException(status_code=500, detail="El maestro de items está vacío incluso después de intentar sincronizar.")

    # Convertir a DataFrame para procesamiento vectorial (pandas es rápido en memoria con datos limpios)
    # Solo necesitamos columnas clave
    data_list = [{
        'Item_Code': item.item_code, 
        'ABC_Code_stockroom': item.abc_code, 
        'Item_Description': item.description
    } for item in items_db]
    
    items_data = pd.DataFrame(data_list)

    # 2. Consultar conteos realizados en el año actual
    current_year = datetime.datetime.now().year
    start_of_year = f"{current_year}-01-01"
    
    query = (
        select(CycleCount.item_code, func.count(CycleCount.id).label("count"))
        .where(CycleCount.timestamp >= start_of_year, CycleCount.country_code == country_code)
        .group_by(CycleCount.item_code)
    )
    
    result = await db.execute(query)
    counts_db = result.all()
    previous_counts_map = {row.item_code: row.count for row in counts_db}

    # 3. Calcular conteos necesarios
    tasks_to_schedule = []
    
    for _, row in items_data.iterrows():
        item_code = row['Item_Code']
        abc_code = row['ABC_Code_stockroom']
        description = row['Item_Description']
        
        required = FREQUENCY_MAP.get(abc_code, 0)
        done = previous_counts_map.get(item_code, 0)
        pending = max(0, required - done)
        
        for _ in range(pending):
            tasks_to_schedule.append({
                "Item Code": item_code,
                "ABC Code": abc_code,
                "Description": description
            })

    if not tasks_to_schedule:
        return pd.DataFrame(columns=["Item Code", "ABC Code", "Description", "Planned Date"])
    
    # 4. Distribuir en días hábiles
    working_days = get_working_days(s_date, e_date, holidays)
    if not working_days:
        raise HTTPException(status_code=400, detail="No hay días hábiles en el rango seleccionado (revise festivos y fines de semana).")
        
    random.shuffle(tasks_to_schedule)
    
    planned_rows = []
    num_days = len(working_days)
    
    for i, task in enumerate(tasks_to_schedule):
        assigned_date = working_days[i % num_days]
        planned_rows.append({
            "Item Code": task["Item Code"],
            "ABC Code": task["ABC Code"],
            "Description": task["Description"],
            "Planned Date": assigned_date
        })
        
    df_output = pd.DataFrame(planned_rows)
    return df_output.sort_values(by=["Planned Date", "Item Code"])


@router.get("/preview_plan")
async def preview_count_plan(
    start_date: str = Query(..., description="Fecha inicio (YYYY-MM-DD)"),
    end_date: str = Query(..., description="Fecha fin (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    request: Request = None
):
    """Devuelve el plan en formato JSON para previsualización."""
    country = get_current_country(request) or "CL"
    df_output = await calculate_count_plan_data(start_date, end_date, db, country)
    
    # Convertir fechas a string para JSON
    df_output['Planned Date'] = df_output['Planned Date'].astype(str)
    
    # Resumen por fecha
    summary_by_date = df_output.groupby('Planned Date').size().reset_index(name='count')
    
    # Resumen por ABC
    summary_by_abc = df_output.groupby('ABC Code').size().reset_index(name='count')
    
    return {
        "total_items": len(df_output),
        "summary_by_date": summary_by_date.to_dict(orient='records'),
        "summary_by_abc": summary_by_abc.to_dict(orient='records'),
        "details": df_output.to_dict(orient='records')
    }


@router.get("/generate_plan")
async def generate_count_plan(
    start_date: str = Query(..., description="Fecha inicio (YYYY-MM-DD)"),
    end_date: str = Query(..., description="Fecha fin (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    request: Request = None
):
    """Genera y descarga el Excel."""
    country = get_current_country(request) or "CL"
    df_output = await calculate_count_plan_data(start_date, end_date, db, country)
    
    # 5. Generar Excel
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_output.to_excel(writer, index=False, sheet_name='Planificacion')
        
        # Ajustar ancho de columnas
        worksheet = writer.sheets['Planificacion']
        for col in worksheet.columns:
            max_length = 0
            column = col[0].column_letter
            for cell in col:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = (max_length + 2)
            worksheet.column_dimensions[column].width = adjusted_width

    output.seek(0)
    filename = f"plan_conteos_{start_date}_al_{end_date}.xlsx"
    
    return Response(
        content=output.getvalue(),
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/config")
async def get_planner_config(request: Request, username: str = Depends(permission_required("planner"))):
    """Obtiene la configuración actual para el país."""
    country = get_current_country(request) or "CL"
    return load_config(country)

@router.post("/config")
async def update_planner_config(
    request: Request,
    config: PlannerConfigModel,
    username: str = Depends(permission_required("planner"))
):
    """Actualiza la configuración y la guarda para el país."""
    country = get_current_country(request) or "CL"
    try:
        # Validar formato de fechas
        datetime.datetime.strptime(config.start_date, '%Y-%m-%d')
        datetime.datetime.strptime(config.end_date, '%Y-%m-%d')
        for h in config.holidays:
             datetime.datetime.strptime(h, '%Y-%m-%d')
        
        save_config(config.dict(), country)
        return {"message": "Configuración guardada correctamente", "config": config.dict()}
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD.")


@router.get("/current_plan")
async def get_current_plan(request: Request, username: str = Depends(permission_required("planner"))):
    """Obtiene el plan guardado (persistente) para el país."""
    country = get_current_country(request) or "CL"
    data = load_plan_data(country)
    if not data:
        return {}
    return data

@router.post("/update_plan")
async def update_count_plan(
    request: Request,
    start_date: str = Query(..., description="Fecha inicio (YYYY-MM-DD)"),
    end_date: str = Query(..., description="Fecha fin (YYYY-MM-DD)"),
    username: str = Depends(permission_required("planner")),
    db: AsyncSession = Depends(get_db)
):
    """Calcula y guarda el plan para el país."""
    country = get_current_country(request) or "CL"
    df_output = await calculate_count_plan_data(start_date, end_date, db, country)
    
    # 2. Formatear igual que preview
    df_output['Planned Date'] = df_output['Planned Date'].astype(str)
    summary_by_date = df_output.groupby('Planned Date').size().reset_index(name='count')
    summary_by_abc = df_output.groupby('ABC Code').size().reset_index(name='count')
    
    result_data = {
        "total_items": len(df_output),
        "summary_by_date": summary_by_date.to_dict(orient='records'),
        "summary_by_abc": summary_by_abc.to_dict(orient='records'),
        "details": df_output.to_dict(orient='records'),
        "generated_at": datetime.datetime.now().isoformat()
    }
    
    # 3. Guardar
    save_plan_data(result_data, country)
    
    return result_data
    return result_data


# --- Nuevos Endpoints de Ejecución (Conteos Cíclicos) ---

@router.get("/execution/daily_items")
async def get_daily_items_for_execution(
    date: str = Query(..., description="Fecha de ejecución (YYYY-MM-DD)"),
    request: Request = None,
    username: str = Depends(permission_required("planner")),
    db: AsyncSession = Depends(get_db)
):
    """Obtiene los items planificados para el país en la fecha específica."""
    country = get_current_country(request) or "CL"
    plan_data = load_plan_data(country)
    if not plan_data or "details" not in plan_data:
        return {"items": [], "has_previous_counts": False, "previous_count": 0}
    
    # Filtrar items para la fecha
    daily_items = [
        item for item in plan_data["details"] 
        if item.get("Planned Date") == date
    ]
    
    # Verificar si ya existen conteos previos para esta fecha
    from app.models.sql_models import CycleCountRecording
    from sqlalchemy import func
    
    count_check = await db.execute(
        select(func.count(CycleCountRecording.id))
        .where(CycleCountRecording.planned_date == date, CycleCountRecording.country_code == country)
    )
    previous_count = count_check.scalar() or 0
    has_previous = previous_count > 0
    
    # Enriquecer con datos del maestro filtrados por país
    enrich_codes = [item.get("Item Code") for item in daily_items]
    
    stmt = select(MasterItem).where(MasterItem.item_code.in_(enrich_codes), MasterItem.country_code == country)
    result = await db.execute(stmt)
    db_items_map = {item.item_code: item for item in result.scalars().all()}
    
    enriched_items = []
    for item in daily_items:
        item_code = item.get("Item Code")
        db_item = db_items_map.get(item_code)
        
        bin_loc = "N/A"
        system_qty = 0
        additional = ""
        
        if db_item:
             bin_loc = db_item.bin_1 or "N/A"
             system_qty = db_item.physical_qty
             additional = db_item.additional_bin or ""
                 
        enriched_items.append({
            "item_code": item_code,
            "description": item.get("Description"),
            "abc_code": item.get("ABC Code"),
            "bin_location": bin_loc,
            "additional_locations": additional,
            "system_qty": system_qty, 
            "planned_date": date
        })
        
    # Ordenar por ubicación para facilitar el recorrido en bodega
    sorted_items = sorted(enriched_items, key=lambda x: x["bin_location"] or "")
    
    # Contar items con diferencias en conteos previos
    items_with_diff_count = 0
    if has_previous:
        diff_check = await db.execute(
            select(func.count(CycleCountRecording.id))
            .where(
                CycleCountRecording.planned_date == date,
                CycleCountRecording.country_code == country,
                CycleCountRecording.difference != 0
            )
        )
        items_with_diff_count = diff_check.scalar() or 0
    
    return {
        "items": sorted_items,
        "has_previous_counts": has_previous,
        "previous_count": previous_count,
        "items_with_diff_count": items_with_diff_count
    }


@router.get("/execution/items_with_differences")
async def get_items_with_differences(
    date: str = Query(..., description="Fecha planificada (YYYY-MM-DD)"),
    request: Request = None,
    username: str = Depends(permission_required("planner")),
    db: AsyncSession = Depends(get_db)
):
    """Obtiene las diferencias para el país."""
    country = get_current_country(request) or "CL"
    
    # Obtener items con diferencias de conteos previos
    stmt = select(CycleCountRecording).where(
        CycleCountRecording.planned_date == date,
        CycleCountRecording.country_code == country,
        CycleCountRecording.difference != 0
    )
    result = await db.execute(stmt)
    previous_counts = result.scalars().all()
    
    if not previous_counts:
        return {
            "items": [],
            "total_items_with_diff": 0
        }
    
    # Obtener item_codes únicos
    item_codes = list(set([rec.item_code for rec in previous_counts]))
    
    # Enriquecer con datos actuales del maestro del país
    master_stmt = select(MasterItem).where(MasterItem.item_code.in_(item_codes), MasterItem.country_code == country)
    master_result = await db.execute(master_stmt)
    master_map = {item.item_code: item for item in master_result.scalars().all()}
    
    # Crear mapa de conteos previos (último por item)
    prev_map = {}
    for rec in previous_counts:
        if rec.item_code not in prev_map:
            prev_map[rec.item_code] = rec
        elif rec.id > prev_map[rec.item_code].id:  # Más reciente
            prev_map[rec.item_code] = rec
    
    enriched_items = []
    for item_code, prev_rec in prev_map.items():
        master_item = master_map.get(item_code)
        
        bin_loc = prev_rec.bin_location or "N/A"
        current_system_qty = prev_rec.system_qty
        additional = ""
        
        if master_item:
            bin_loc = master_item.bin_1 or bin_loc
            current_system_qty = master_item.physical_qty
            additional = master_item.additional_bin or ""
        
        enriched_items.append({
            "item_code": item_code,
            "description": prev_rec.item_description,
            "bin_location": bin_loc,
            "additional_locations": additional,
            "previous_physical_qty": prev_rec.physical_qty,
            "previous_system_qty": prev_rec.system_qty,
            "previous_difference": prev_rec.difference,
            "system_qty": current_system_qty,
            "abc_code": prev_rec.abc_code or "C",
            "planned_date": date
        })
    
    # Ordenar por ubicación
    sorted_items = sorted(enriched_items, key=lambda x: x["bin_location"] or "")
    
    return {
        "items": sorted_items,
        "total_items_with_diff": len(sorted_items)
    }


@router.post("/execution/save")
async def save_daily_execution(
    request: Request,
    execution_data: CountExecutionRequest,
    username: str = Depends(permission_required("planner")),
    db: AsyncSession = Depends(get_db)
):
    """Guarda los conteos ejecutados del día. Filtra por país."""
    country = get_current_country(request) or "CL"
    try:
        saved_count = 0
        updated_count = 0
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        
        for item in execution_data.items:
            physical = item.physical_qty
            system = item.system_qty
            
            # Buscar si ya existe un registro para este item en la fecha planificada
            existing_query = select(CycleCountRecording).where(
                CycleCountRecording.item_code == item.item_code,
                CycleCountRecording.planned_date == execution_data.date,
                CycleCountRecording.country_code == country
            )
            result = await db.execute(existing_query)
            existing_record = result.scalar_one_or_none()
            
            if existing_record:
                # REEMPLAZAR la cantidad existente (reconteo corrige el valor anterior)
                existing_record.physical_qty = physical
                existing_record.difference = existing_record.physical_qty - existing_record.system_qty
                existing_record.username = username  # Actualizar usuario
                existing_record.executed_date = today  # Actualizar fecha de ejecución
                db.add(existing_record)
                updated_count += 1
            else:
                # Crear nuevo registro
                diff = physical - system
                new_record = CycleCountRecording(
                    planned_date=execution_data.date,
                    executed_date=today,
                    item_code=item.item_code,
                    item_description=item.description,
                    bin_location=item.bin_location,
                    system_qty=system,
                    physical_qty=physical,
                    difference=diff,
                    username=username,
                    abc_code=item.abc_code,
                    country_code=country
                )
                db.add(new_record)
                saved_count += 1
            
        await db.commit()
        
        msg_parts = []
        if saved_count > 0:
            msg_parts.append(f"{saved_count} nuevos")
        if updated_count > 0:
            msg_parts.append(f"{updated_count} actualizados (sumados)")
        
        return {"message": f"Conteos guardados: {', '.join(msg_parts)}.", "success": True}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar ejecución: {str(e)}")


@router.get("/execution/stats")
async def get_execution_stats(
    request: Request,
    year: int = Query(datetime.datetime.now().year),
    username: str = Depends(permission_required("planner")),
    db: AsyncSession = Depends(get_db)
):
    """Estadísticas filtradas por país."""
    country = get_current_country(request) or "CL"
    # Consultar todos los registros del año y país
    query = select(CycleCountRecording).where(
        CycleCountRecording.executed_date.like(f"{year}-%"),
        CycleCountRecording.country_code == country
    )
    result = await db.execute(query)
    records = result.scalars().all()
    
    # Inicializar estructuras de datos
    # Meses 0-11
    executed_grid = {cat: [0]*12 for cat in ['A', 'B', 'C']}
    delta_grid = {cat: [0]*12 for cat in ['A', 'B', 'C']}
    
    for record in records:
        try:
            date_obj = datetime.datetime.strptime(record.executed_date, "%Y-%m-%d")
            month_idx = date_obj.month - 1 # 0-indexed
            
            cat = record.abc_code
            if cat not in executed_grid:
                cat = 'C' # Fallback
                
            # Ejecutado: Conteo de items contados
            executed_grid[cat][month_idx] += 1
            
            # Delta: Suma absoluta de las diferencias (o neta? El usuario dijo "generar diferencias")
            # Para KPI de exactitud, usually absolute. Para ajuste de inventario, net.
            # Visualizaremos discrepancias (diff != 0)
            if record.difference != 0:
                delta_grid[cat][month_idx] += 1
                
        except (ValueError, TypeError):
            continue
            
    return {
        "executed": executed_grid,
        "delta": delta_grid, # Items con diferencia
        "year": year
    }


# --- NUEVOS ENDPOINTS PARA GESTIÓN DE DIFERENCIAS DE CONTEOS CÍCLICOS ---

class CycleCountDifferenceResponse(BaseModel):
    id: int
    item_code: str
    item_description: str | None
    bin_location: str | None
    system_qty: int
    physical_qty: int
    difference: int
    executed_date: str
    username: str
    abc_code: str | None
    planned_date: str


@router.get('/cycle_count_differences')
async def get_cycle_count_differences(
    request: Request,
    year: int = Query(None),
    month: int = Query(None),
    only_differences: bool = Query(True),
    username: str = Depends(permission_required("planner")),
    db: AsyncSession = Depends(get_db)
):
    country = get_current_country(request) or "CL"
    """Listado filtrado por país."""
    query = select(CycleCountRecording).where(CycleCountRecording.country_code == country)
    
    # Filtrar solo si hay diferencias
    if only_differences:
        query = query.where(CycleCountRecording.difference != 0)
    
    if year:
        query = query.where(CycleCountRecording.executed_date.like(f"{year}-%"))
    
    if month:
        month_str = f"{str(month).zfill(2)}"
        if year:
            query = query.where(CycleCountRecording.executed_date.like(f"{year}-{month_str}-%"))
        else:
            query = query.where(CycleCountRecording.executed_date.like(f"%-{month_str}-%"))
    
    query = query.order_by(CycleCountRecording.executed_date.desc(), CycleCountRecording.item_code)
    
    result = await db.execute(query)
    records = result.scalars().all()
    
    return [
        CycleCountDifferenceResponse(
            id=r.id,
            item_code=r.item_code,
            item_description=r.item_description,
            bin_location=r.bin_location,
            system_qty=r.system_qty,
            physical_qty=r.physical_qty,
            difference=r.difference,
            executed_date=r.executed_date,
            username=r.username,
            abc_code=r.abc_code,
            planned_date=r.planned_date
        )
        for r in records
    ]


class UpdateCycleCountDifferenceRequest(BaseModel):
    physical_qty: int


@router.put('/cycle_count_differences/{recording_id}')
async def update_cycle_count_difference(
    recording_id: int,
    data: UpdateCycleCountDifferenceRequest,
    request: Request,
    username: str = Depends(permission_required("planner")),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza diferencia para el país."""
    country = get_current_country(request) or "CL"
    result = await db.execute(
        select(CycleCountRecording).where(
            CycleCountRecording.id == recording_id,
            CycleCountRecording.country_code == country
        )
    )
    record = result.scalar_one_or_none()
    
    if not record:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    
    # Actualizar cantidad física y recalcular diferencia
    record.physical_qty = data.physical_qty
    record.difference = data.physical_qty - record.system_qty
    
    db.add(record)
    await db.commit()
    await db.refresh(record)
    
    return {
        "id": record.id,
        "item_code": record.item_code,
        "physical_qty": record.physical_qty,
        "difference": record.difference,
        "message": "Cantidad verificada actualizada exitosamente"
    }
