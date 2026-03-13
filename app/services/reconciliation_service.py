"""
Servicio para la lógica de conciliación de Inbound y snapshots (Multicountry).
"""
import datetime
import json
import os
import pandas as pd
from typing import List, Optional, Dict, Any
from sqlalchemy import select, distinct, desc, func, text, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import db_logs, csv_handler
from app.models.sql_models import ReconciliationHistory, GRNMaster
from app.core.config import JSON_FOLDER
from starlette.concurrency import run_in_threadpool

def _get_country_json_path(country_code: str, filename: str) -> str:
    return os.path.join(JSON_FOLDER, country_code, filename)

async def get_reconciliation_calculations(db: AsyncSession, country_code: str, archive_date: Optional[str] = None) -> List[Dict[str, Any]]:
    """Ejecuta los cálculos de conciliación en tiempo real."""
    await csv_handler.reload_cache_if_needed(country_code)
    
    # 1. Obtener Logs
    if archive_date:
        logs_list = await db_logs.load_archived_log_data_db_async(db, country_code, archive_date)
    else:
        logs_list = await db_logs.load_log_data_db_async(db, country_code)
        
    if not logs_list:
        return []
        
    logs_df = pd.DataFrame(logs_list)
    grn_df = csv_handler.get_df_grn(country_code)
    
    if logs_df.empty:
        return []

    # Normalización de Logs
    logs_df['importReference'] = logs_df['importReference'].astype(str).str.strip().str.upper()
    logs_df['itemCode'] = logs_df['itemCode'].astype(str).str.strip().str.upper()
    logs_df['waybill'] = logs_df['waybill'].astype(str).str.strip().str.upper()

    grn_df = csv_handler.get_df_grn(country_code)
    if grn_df is None:
        return []

    # 2. Cargar Fuentes de Asociación FILTRADAS
    active_irs = set(logs_df['importReference'].unique())
    ir_to_grns_map = {}

    # A. po_lookup.json
    po_lookup_path = _get_country_json_path(country_code, 'po_lookup.json')
    if os.path.exists(po_lookup_path):
        try:
            with open(po_lookup_path, 'r', encoding='utf-8') as f:
                po_cache = json.load(f)
                po_ir_data = po_cache.get("ir_to_data", {})
                for ir_in_logs in active_irs:
                    data = po_ir_data.get(ir_in_logs)
                    if data:
                        grns = set(g.strip().upper() for item in data.get("items", []) if item.get("grn") for g in str(item["grn"]).split(',') if g.strip())
                        if grns:
                            if ir_in_logs not in ir_to_grns_map: ir_to_grns_map[ir_in_logs] = {"grns": set(), "wb": data.get("waybill")}
                            ir_to_grns_map[ir_in_logs]["grns"].update(grns)
        except: pass

    # B. grn_master_data.json
    grn_master_path = _get_country_json_path(country_code, 'grn_master_data.json')
    if os.path.exists(grn_master_path):
        try:
            with open(grn_master_path, 'r', encoding='utf-8') as f:
                inbound_data = json.load(f)
                for row in inbound_data:
                    ir = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                    if ir in active_irs:
                        grn = str(row.get("GRN_Number", row.get("grn_number", ""))).strip().upper()
                        if ir and grn:
                            if ir not in ir_to_grns_map: ir_to_grns_map[ir] = {"grns": set(), "wb": row.get("Waybill", row.get("waybill", ""))}
                            ir_to_grns_map[ir]["grns"].add(grn)
        except: pass

    # C. DB Maestro
    try:
        stmt = select(GRNMaster).where(and_(
            func.upper(GRNMaster.import_reference).in_(list(active_irs)),
            GRNMaster.country_code == country_code
        ))
        db_res = await db.execute(stmt)
        for g_master in db_res.scalars().all():
            ir_key = str(g_master.import_reference).strip().upper()
            if g_master.grn_number:
                grns_set = set(g.strip().upper() for g in str(g_master.grn_number).split(',') if g.strip())
                if ir_key not in ir_to_grns_map: ir_to_grns_map[ir_key] = {"grns": grns_set, "wb": g_master.waybill}
                else: ir_to_grns_map[ir_key]["grns"].update(grns_set)
    except: pass

    # D. Purchase Order Extractor.xlsx (Robot)
    # Definir ruta de forma absoluta para evitar NameErrors por importaciones circulares o fallos de carga
    base_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'databases')
    excel_path = os.path.join(base_path, country_code, 'Purchase Order Extractor.xlsx')
    if os.path.exists(excel_path):
        try:
            # Leer excel en subproceso para no bloquear
            df_excel = await run_in_threadpool(pd.read_excel, excel_path, engine='openpyxl')
            # Normalizar columnas (limpiar espacios y mayúsculas)
            df_excel.columns = [str(c).strip().upper() for c in df_excel.columns]
            
            ir_col = 'IMPORT_REFERENCE' if 'IMPORT_REFERENCE' in df_excel.columns else 'IMPORT REFERENCE'
            grn_col = 'GRN_NUMBER' if 'GRN_NUMBER' in df_excel.columns else 'GRN NUMBER'
            wb_col = 'WAYBILL' if 'WAYBILL' in df_excel.columns else 'WAYBILL NUMBER'

            if ir_col in df_excel.columns and grn_col in df_excel.columns:
                for _, row in df_excel.iterrows():
                    ir = str(row.get(ir_col, "")).strip().upper()
                    if ir in active_irs:
                        raw_grn = row.get(grn_col, "")
                        # Limpiar .0 de los números en Excel
                        grn = str(raw_grn).replace('.0', '').strip().upper()
                        wb = str(row.get(wb_col, ""))
                        if ir and grn and grn != 'NAN':
                            if ir not in ir_to_grns_map: ir_to_grns_map[ir] = {"grns": set(), "wb": wb}
                            ir_to_grns_map[ir]["grns"].add(grn)
        except Exception as e:
            print(f"⚠️ Error leyendo Excel de PO para conciliación: {e}")

    # 3. Procesamiento Pandas
    logs_df['qtyReceived'] = pd.to_numeric(logs_df['qtyReceived'].astype(str).str.replace(',', ''), errors='coerce').fillna(0)
    
    # Normalizar nombres de columnas en grn_df para evitar KeyErrors
    grn_df.columns = [c.replace(' ', '_') for c in grn_df.columns]
    
    # Identificar nombres de columnas reales en GRN (case-insensitive)
    col_map = {c.upper(): c for c in grn_df.columns}
    grn_item_col = col_map.get('ITEM_CODE', 'Item_Code')
    grn_desc_col = col_map.get('ITEM_DESCRIPTION', 'Item_Description')
    grn_num_col = col_map.get('GRN_NUMBER', 'GRN_Number')
    grn_qty_col = col_map.get('QUANTITY', 'Quantity')

    # Limpiar strings en GRN_DF
    grn_df[grn_item_col] = grn_df[grn_item_col].astype(str).str.strip().str.upper()
    grn_df[grn_num_col] = grn_df[grn_num_col].astype(str).str.strip().str.upper()

    # Extraer ubicaciones antes del groupby
    loc_cols = [c for c in ['binLocation', 'relocatedBin'] if c in logs_df.columns]
    if loc_cols:
        df_locations = logs_df.groupby(['importReference', 'itemCode'])[loc_cols].last().reset_index()
    else:
        df_locations = logs_df[['importReference', 'itemCode']].drop_duplicates()
        df_locations['binLocation'] = ''
        df_locations['relocatedBin'] = ''
    
    logs_grouped = logs_df.groupby(['importReference', 'waybill', 'itemCode'])['qtyReceived'].sum().reset_index()

    mapping_rows = []
    for ir, info in ir_to_grns_map.items():
        for grn in info["grns"]:
            mapping_rows.append({"ir_map": ir, "wb_map": info["wb"], "grn_map": grn})
    
    df_mapping = pd.DataFrame(mapping_rows) if mapping_rows else pd.DataFrame(columns=["ir_map", "wb_map", "grn_map"])
    
    grn_df[grn_qty_col] = pd.to_numeric(grn_df[grn_qty_col].astype(str).str.replace(',', ''), errors='coerce').fillna(0)
    df_expected_lines = pd.merge(df_mapping, grn_df, left_on='grn_map', right_on=grn_num_col, how='inner')
    
    if df_expected_lines.empty:
        # Fallback si no hay merge exitoso: intentar conciliación simplificada solo con logs
        logs_grouped['Diferencia'] = logs_grouped['qtyReceived']
        logs_grouped = logs_grouped.rename(columns={
            "importReference": "Import_Reference", "waybill": "Waybill", "itemCode": "Codigo_Item", "qtyReceived": "Cant_Recibida"
        })
        logs_grouped['GRN'] = "SIN ASOC"
        logs_grouped['Cant_Esperada'] = 0
        logs_grouped['Descripcion'] = "Sin datos en GRN"
        return logs_grouped.to_dict(orient='records')

    total_exp_per_ir_item = df_expected_lines.groupby(['ir_map', grn_item_col])[grn_qty_col].sum().reset_index()
    total_exp_per_ir_item = total_exp_per_ir_item.rename(columns={grn_qty_col: 'Total_Esperado_IR'})

    merged = pd.merge(df_expected_lines, total_exp_per_ir_item, on=['ir_map', grn_item_col], how='left')
    
    final_merge = pd.merge(
        merged, 
        logs_grouped, 
        left_on=['ir_map', grn_item_col], 
        right_on=['importReference', 'itemCode'], 
        how='outer'
    )

    final_merge['qtyReceived'] = final_merge['qtyReceived'].fillna(0).astype(int)
    final_merge[grn_qty_col] = final_merge[grn_qty_col].fillna(0).astype(int)
    final_merge['Total_Esperado_IR'] = final_merge['Total_Esperado_IR'].fillna(0).astype(int)
    
    final_merge['importReference'] = final_merge['importReference'].fillna(final_merge['ir_map'])
    final_merge['waybill'] = final_merge['waybill'].fillna(final_merge['wb_map'])
    final_merge['itemCode'] = final_merge['itemCode'].fillna(final_merge[grn_item_col])
    final_merge[grn_desc_col] = final_merge[grn_desc_col].fillna("No en sistema 280")
    final_merge[grn_num_col] = final_merge[grn_num_col].fillna("SIN GRN")
    final_merge['Diferencia'] = final_merge['qtyReceived'] - final_merge['Total_Esperado_IR']

    final_merge = pd.merge(
        final_merge,
        df_locations,
        left_on=['importReference', 'itemCode'],
        right_on=['importReference', 'itemCode'],
        how='left'
    )

    df_final = final_merge.rename(columns={
        "importReference": "Import_Reference",
        "waybill": "Waybill",
        grn_num_col: "GRN",
        "itemCode": "Codigo_Item",
        grn_desc_col: "Descripcion",
        grn_qty_col: "Cant_Esperada",
        "qtyReceived": "Cant_Recibida",
        "binLocation": "Ubicacion",
        "relocatedBin": "Reubicado"
    })

    if 'Ubicacion' not in df_final.columns: df_final['Ubicacion'] = ''
    if 'Reubicado' not in df_final.columns: df_final['Reubicado'] = ''

    return df_final[[
        "Import_Reference", "Waybill", "GRN", "Codigo_Item",
        "Descripcion", "Ubicacion", "Reubicado", "Cant_Esperada", "Cant_Recibida", "Diferencia"
    ]].fillna("").to_dict(orient='records')

async def create_snapshot(db: AsyncSession, country_code: str, data: List[dict], username: str, is_auto: bool = False):
    """Guarda un snapshot de conciliación en la DB."""
    prefix = "AUTO-" if is_auto else ""
    archive_date = f"{prefix}{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    
    records = [
        ReconciliationHistory(
            country_code=country_code,
            archive_date=archive_date,
            import_reference=row.get('Import_Reference', ''),
            waybill=row.get('Waybill', ''),
            grn=row.get('GRN', ''),
            item_code=row.get('Codigo_Item', ''),
            description=row.get('Descripcion', ''),
            bin_location=row.get('Ubicacion', '') or '',
            relocated_bin=row.get('Reubicado', '') or '',
            qty_expected=int(row.get('Cant_Esperada', 0)),
            qty_received=int(row.get('Cant_Recibida', 0)),
            difference=int(row.get('Diferencia', 0)),
            username=username
        ) for row in data
    ]
    
    db.add_all(records)
    await db.commit()
    return archive_date

async def auto_snapshot_before_update(db: AsyncSession, country_code: str, username: str):
    """Realiza un snapshot automático si hay datos pendientes de conciliación."""
    try:
        current_data = await get_reconciliation_calculations(db, country_code)
        if not current_data: return None
        
        if len(current_data) > 0:
            user_str = username if isinstance(username, str) else getattr(username, 'username', str(username))
            archive_date = await create_snapshot(db, country_code, current_data, f"AUTO({user_str})", is_auto=True)
            return archive_date
        return None
    except Exception as e:
        print(f"❌ Error en snapshot automático ({country_code}): {e}")
        return None
