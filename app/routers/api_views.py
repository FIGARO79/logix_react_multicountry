from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy import text, select
from app.core.db import get_db
from app.utils.auth import get_current_user, login_required
from app.services import db_logs, csv_handler, db_counts
from app.core.config import ASYNC_DB_URL
from app.models.sql_models import PickingAudit, PickingAuditItem, PickingPackageItem, CountSession, CycleCountRecording
import pandas as pd
from typing import List, Optional, Any, Dict
from pydantic import BaseModel

router = APIRouter(prefix="/api/views", tags=["api_views"])

# --- Pydantic Models ---
class MenuItem(BaseModel):
    id: str
    href: str
    text: str
    icon: str

class UserSession(BaseModel):
    username: str
    is_admin: bool = False

class ReconciliationRow(BaseModel):
    GRN: Any
    Codigo_Item: str 
    Descripcion: str
    Ubicacion: str
    Reubicado: str
    Cant_Esperada: int
    Cant_Recibida: int
    Diferencia: int

    class Config:
        populate_by_name = True

class PickingAuditSummary(BaseModel):
    id: int
    order_number: str
    despatch_number: str
    customer_name: Optional[str]
    username: str
    timestamp: str
    status: str
    packages: Optional[int]
    packages_assignment: Optional[Dict[str, Any]] = {}
    items: List[Dict[str, Any]]

class PickingPackageItemModel(BaseModel):
    order_line: Optional[str] = ""
    item_code: str
    description: str
    quantity: int

class PackingListResponse(BaseModel):
    order_number: str
    despatch_number: str
    customer_name: str
    timestamp: str
    total_packages: int
    packages: Dict[str, List[PickingPackageItemModel]]

class InboundLogItem(BaseModel):
    id: int
    timestamp: str
    username: str
    itemCode: str
    description: str
    quantity: int
    cycle_count: int
    binLocation: str
    relocatedBin: str
    qtyReceived: int
    difference: int
    observaciones: Optional[str]

# --- DB Engine for Pandas ---
async_engine = create_async_engine(
    ASYNC_DB_URL,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=280,
)

# --- Endpoints ---

@router.get("/me", response_model=UserSession)
async def get_current_user_info(request: Request, username: str = Depends(login_required)):
    # Simple endpoint to validate session and return user info
    return UserSession(username=username, is_admin=False) # Extend logic as needed

@router.get("/reconciliation", response_model=Dict[str, Any])
async def get_reconciliation_data(
    request: Request,
    archive_date: Optional[str] = None, 
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db)
):
    country = get_current_country(request) or "MX"
    await csv_handler.reload_cache_if_needed(country_code=country)
    
    try:
        archive_versions = await db_logs.get_archived_versions_db_async(db, country_code=country)
        
        async with async_engine.connect() as conn:
            if archive_date:
                query = text('SELECT * FROM logs WHERE archived_at = :date AND country_code = :country')
                logs_df = await conn.run_sync(lambda sync_conn: pd.read_sql_query(query, sync_conn, params={"date": archive_date, "country": country}))
            else:
                query = text('SELECT * FROM logs WHERE archived_at IS NULL AND country_code = :country')
                logs_df = await conn.run_sync(lambda sync_conn: pd.read_sql_query(query, sync_conn, params={"country": country}))
        
        grn_df = csv_handler.df_grn_cache.get(country)
        
        if logs_df.empty or grn_df is None:
            return {
                "data": [],
                "archive_versions": archive_versions,
                "current_archive_date": archive_date
            }
            
        # --- Data Processing Logic (Identical to Original) ---
        # Limpiar comas antes de convertir a numérico
        clean_qty_rec = logs_df['qtyReceived'].astype(str).str.replace(',', '', regex=False)
        logs_df['qtyReceived'] = pd.to_numeric(clean_qty_rec, errors='coerce').fillna(0)
        
        clean_qty_grn = grn_df['Quantity'].astype(str).str.replace(',', '', regex=False)
        grn_df['Quantity'] = pd.to_numeric(clean_qty_grn, errors='coerce').fillna(0)

        items_in_file = grn_df['Item_Code'].unique()
        logs_df_filtered = logs_df[logs_df['itemCode'].isin(items_in_file)]

        item_totals = logs_df_filtered.groupby(['itemCode'])['qtyReceived'].sum().reset_index()
        item_totals = item_totals.rename(columns={'itemCode': 'Item_Code', 'qtyReceived': 'Total_Recibido'})

        item_expected_totals = grn_df.groupby(['Item_Code'])['Quantity'].sum().reset_index()
        item_expected_totals = item_expected_totals.rename(columns={'Quantity': 'Total_Esperado_Item'})

        grn_lines = grn_df[['GRN_Number', 'Item_Code', 'Item_Description', 'Quantity']].copy()
        grn_lines = grn_lines.rename(columns={'Quantity': 'Cant_Esperada_Linea'})

        merged_df = pd.merge(grn_lines, item_totals, on='Item_Code', how='left')
        merged_df = pd.merge(merged_df, item_expected_totals, on='Item_Code', how='left')

        if not logs_df_filtered.empty:
            logs_df_filtered['id'] = pd.to_numeric(logs_df_filtered['id'])
            latest_logs = logs_df_filtered.sort_values('id', ascending=False).drop_duplicates('itemCode')
            
            locations_df = latest_logs[['itemCode', 'binLocation', 'relocatedBin']].rename(
                columns={'itemCode': 'Item_Code', 'binLocation': 'Bin_Original', 'relocatedBin': 'Bin_Reubicado'}
            )
            merged_df = pd.merge(merged_df, locations_df, on='Item_Code', how='left')

        merged_df['Total_Recibido'] = merged_df['Total_Recibido'].fillna(0)
        merged_df['Cant_Esperada_Linea'] = merged_df['Cant_Esperada_Linea'].fillna(0)
        merged_df['Total_Esperado_Item'] = merged_df['Total_Esperado_Item'].fillna(0)
        merged_df['Diferencia'] = merged_df['Total_Recibido'] - merged_df['Total_Esperado_Item']
        
        merged_df.fillna({'Bin_Original': 'N/A', 'Bin_Reubicado': ''}, inplace=True)
        
        merged_df['Total_Recibido'] = merged_df['Total_Recibido'].astype(int)
        merged_df['Cant_Esperada_Linea'] = merged_df['Cant_Esperada_Linea'].astype(int)
        merged_df['Total_Esperado_Item'] = merged_df['Total_Esperado_Item'].astype(int)
        merged_df['Diferencia'] = merged_df['Diferencia'].astype(int)

        merged_df = merged_df.sort_values('GRN_Number', ascending=True)

        # Standardize keys for JSON
        result_data = merged_df.rename(columns={
            'GRN_Number': 'GRN',
            'Item_Code': 'Codigo_Item',
            'Item_Description': 'Descripcion',
            'Bin_Original': 'Ubicacion',
            'Bin_Reubicado': 'Reubicado',
            'Cant_Esperada_Linea': 'Cant_Esperada',
            'Total_Recibido': 'Cant_Recibida',
            'Diferencia': 'Diferencia'
        }).to_dict(orient='records')
        
        return {
            "data": result_data,
            "archive_versions": archive_versions,
            "current_archive_date": archive_date
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get('/view_picking_audits', response_model=List[PickingAuditSummary])
async def view_picking_audits_api(request: Request, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    country = get_current_country(request) or "MX"
    result = await db.execute(select(PickingAudit).where(PickingAudit.country_code == country).order_by(PickingAudit.id.desc()))
    audits_orm = result.scalars().all()
    
    audits = []
    for audit_orm in audits_orm:
        # Load items
        result_items = await db.execute(select(PickingAuditItem).where(PickingAuditItem.audit_id == audit_orm.id, PickingAuditItem.country_code == country))
        items_orm = result_items.scalars().all()
        
        items_data = [
            {
                "id": item.id,
                "item_code": item.item_code,
                "description": item.description,
                "order_line": item.order_line,
                "qty_req": item.qty_req,
                "qty_scan": item.qty_scan,
                "difference": item.difference,
                "edited": item.edited if item.edited else 0
            } for item in items_orm
        ]
        
        # Obtener asignación de bultos
        result_pkgs = await db.execute(
            select(PickingPackageItem).where(
                PickingPackageItem.audit_id == audit_orm.id, 
                PickingPackageItem.country_code == country
            )
        )
        package_items = result_pkgs.scalars().all()
        packages_assignment = {}
        for pi in package_items:
            # Encontrar el order_line si no está en pi
            order_line = pi.order_line
            if not order_line:
                match = next((i for i in items_data if i["item_code"] == pi.item_code), None)
                if match:
                    order_line = match["order_line"]
            
            key = f"{pi.item_code}:{order_line or ''}"
            if key not in packages_assignment:
                packages_assignment[key] = {}
            packages_assignment[key][str(pi.package_number)] = pi.qty_scan

        audits.append({
            "id": audit_orm.id,
            "order_number": audit_orm.order_number,
            "despatch_number": audit_orm.despatch_number,
            "customer_name": audit_orm.customer_name,
            "username": audit_orm.username,
            "timestamp": audit_orm.timestamp,
            "status": audit_orm.status,
            "packages": audit_orm.packages,
            "packages_assignment": packages_assignment,
            "items": items_data
        })

    return audits

@router.get('/view_counts', response_model=Dict[str, Any])
async def get_counts_data(
    request: Request, 
    username: str = Depends(login_required), 
    db: AsyncSession = Depends(get_db)
):
    country = get_current_country(request) or "MX"
    from app.services.csv_handler import master_qty_map
    
    all_counts = await db_counts.load_all_counts_db_async(db, country_code=country)
    
    # Obtener información de sesiones (usuario y etapa)
    session_map = {}
    session_ids = list({c.get('session_id') for c in all_counts if c.get('session_id') is not None})
    if session_ids:
        try:
            result = await db.execute(select(CountSession).where(CountSession.id.in_(session_ids), CountSession.country_code == country))
            sessions = result.scalars().all()
            session_map = {s.id: {'user': s.user_username, 'stage': s.inventory_stage} for s in sessions}
        except Exception:
             # Fallback if session lookup fails
             pass

    
    # Enriquecer los conteos con información del sistema y sesión
    enriched_counts = []
    usernames_set = set()
    
    for count in all_counts:
        item_code = count.get('item_code')
        # Ensure system_qty is an integer or None (handle 'nan' from pandas/csv if any)
        country_master_qty = master_qty_map.get(country, {})
        system_qty_raw = country_master_qty.get(item_code)
        try:
            system_qty = int(float(system_qty_raw)) if system_qty_raw is not None else None
        except (ValueError, TypeError):
             system_qty = None

        counted_qty = int(count.get('counted_qty', 0))
        difference = (counted_qty - system_qty) if system_qty is not None else None
        
        session_info = session_map.get(count.get('session_id'), {})
        user = count.get('username') or session_info.get('user')
        
        if user:
            usernames_set.add(user)
        
        enriched = {
            'id': count.get('id'),
            'session_id': count.get('session_id'),
            'inventory_stage': session_info.get('stage'),
            'username': user,
            'timestamp': count.get('timestamp'),
            'item_code': item_code,
            'item_description': count.get('item_description'),
            'counted_location': count.get('counted_location'),
            'counted_qty': counted_qty,
            'system_qty': system_qty,
            'difference': difference,
            'bin_location_system': count.get('bin_location_system')
        }
        enriched_counts.append(enriched)
    
    return {
        "counts": enriched_counts,
        "usernames": sorted(list(usernames_set))
    }

@router.get('/view_counts/recordings', response_model=List[Dict[str, Any]])
async def get_cycle_count_recordings(
    request: Request, 
    username: str = Depends(login_required), 
    db: AsyncSession = Depends(get_db)
):
    import time
    start_time = time.time()
    from app.models.sql_models import MasterItem
    
    # Cargar registros de la DB
    country = get_current_country(request) or "MX"
    t1 = time.time()
    result = await db.execute(select(CycleCountRecording).where(CycleCountRecording.country_code == country).order_by(CycleCountRecording.id.desc()))
    recordings = result.scalars().all()
    print(f"⏱️ Query recordings: {time.time() - t1:.2f}s")

    if not recordings:
        return []

    # OPTIMIZACIÓN: Batch query para todos los item codes de una vez
    item_codes = list({rec.item_code for rec in recordings})
    
    # Consultar todos los items necesarios en una sola query
    t2 = time.time()
    result_items = await db.execute(
        select(MasterItem).where(MasterItem.item_code.in_(item_codes), MasterItem.country_code == country)
    )
    master_items = result_items.scalars().all()
    print(f"⏱️ Query master_items ({len(item_codes)} codes): {time.time() - t2:.2f}s")
    
    # Crear un mapa para lookup rápido
    t3 = time.time()
    master_map = {item.item_code: item for item in master_items}
    print(f"⏱️ Build master_map: {time.time() - t3:.2f}s")

    data = []
    
    t4 = time.time()
    for rec in recordings:
        # Buscar detalles en el mapa (O(1) lookup)
        master_item = master_map.get(rec.item_code)
        
        # Valores por defecto si no se encuentra
        cost = 0.0
        weight = 0.0
        stockroom = ""
        item_type = ""
        item_class = ""
        group_major = ""
        sic_company = ""
        sic_stockroom = ""

        if master_item:
            # Ahora tenemos todos los campos necesarios en la tabla
            try:
                cost = float(master_item.cost_per_unit) if master_item.cost_per_unit else 0.0
            except (ValueError, TypeError):
                cost = 0.0
            
            try:
                weight = float(master_item.weight_per_unit) if master_item.weight_per_unit else 0.0
            except (ValueError, TypeError):
                weight = 0.0
                
            stockroom = master_item.stockroom or ""
            item_type = master_item.item_type or ""
            item_class = master_item.item_class or ""
            group_major = master_item.item_group_major or ""
            sic_company = master_item.sic_code_company or ""
            sic_stockroom = master_item.sic_code_stockroom or ""

        # Cálculos de valor
        diff = rec.difference if rec.difference is not None else 0
        value_diff = diff * cost
        count_value = (rec.physical_qty) * cost

        data.append({
            "stockroom": stockroom,
            "item_code": rec.item_code,
            "description": rec.item_description,
            "item_type": item_type,
            "item_class": item_class,
            "group_major": group_major,
            "sic_company": sic_company,
            "sic_stockroom": sic_stockroom,
            "weight": weight,
            "abc_code": rec.abc_code,
            "bin_location": rec.bin_location,
            "system_qty": rec.system_qty,
            "physical_qty": rec.physical_qty,
            "difference": rec.difference,
            "value_diff": value_diff,
            "cost": cost,
            "count_value": count_value,
            "executed_date": rec.executed_date,
            "username": rec.username
        })
    
    print(f"⏱️ Build response data: {time.time() - t4:.2f}s")
    print(f"⏱️ TOTAL endpoint time: {time.time() - start_time:.2f}s")

    return data

@router.get('/view_logs', response_model=List[InboundLogItem])
async def get_inbound_logs(
    request: Request, 
    username: str = Depends(login_required), 
    db: AsyncSession = Depends(get_db)
):
    country = get_current_country(request) or "MX"
    all_logs = await db_logs.load_log_data_db_async(db, country_code=country)
    # Convert logs dictionary list to Pydantic models or let FastAPI do it (it validates against response_model)
    # Ensure keys match InboundLogItem
    
    # Simple correction if keys differ
    cleaned_logs = []
    for log in all_logs:
        cleaned_logs.append({
             **log,
             # Ensure numeric fields are actually numbers if they come as strings
             "qtyReceived": int(log.get('qtyReceived')) if str(log.get('qtyReceived')).isdigit() else 0,
             "difference": int(log.get('difference')) if str(log.get('difference')).replace('-','').isdigit() else 0,
             "Quantity": int(log.get('Quantity')) if str(log.get('Quantity')).isdigit() else 0, # Map to quantity if needed
             "quantity": int(log.get('Quantity')) if str(log.get('Quantity')).isdigit() else 0, # Case insensitive fix
        })
        
    return cleaned_logs


@router.get('/packing_list/{audit_id}', response_model=PackingListResponse)
async def get_packing_list_data(
    request: Request, 
    audit_id: int, 
    username: str = Depends(login_required), 
    db: AsyncSession = Depends(get_db)
):
    
    country = get_current_country(request) or "MX"
    # Obtener la auditoría
    result = await db.execute(
        select(PickingAudit).where(PickingAudit.id == audit_id, PickingAudit.country_code == country)
    )
    audit = result.scalar_one_or_none()
    
    if not audit:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada")
    
    # Obtener los items asignados a bultos
    result = await db.execute(
        select(PickingPackageItem)
        .where(PickingPackageItem.audit_id == audit_id, PickingPackageItem.country_code == country)
        .order_by(PickingPackageItem.package_number, PickingPackageItem.item_code)
    )
    package_items = result.scalars().all()
    
    # Organizar por bulto
    packages = {}
    for item in package_items:
        package_num = str(item.package_number)
        if package_num not in packages:
            packages[package_num] = []
        
        packages[package_num].append({
            'item_code': item.item_code,
            'description': item.description,
            'quantity': item.qty_scan
        })
    
    # Preparar datos
    try:
        total_packages = int(audit.packages or 0)
    except Exception:
        total_packages = 0

    def _to_str(v):
        if v is None:
            return ""
        try:
            return v.strftime('%Y-%m-%d %H:%M')  # para datetime
        except Exception:
            return str(v)

    return PackingListResponse(
        order_number=_to_str(audit.order_number),
        despatch_number=_to_str(audit.despatch_number),
        customer_name=_to_str(audit.customer_name),
        timestamp=_to_str(audit.timestamp),
        total_packages=total_packages,
        packages=packages
    )

