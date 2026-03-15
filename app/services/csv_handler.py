import os
import json
import datetime
import pandas as pd
import numpy as np
from starlette.concurrency import run_in_threadpool
from fastapi import HTTPException

# Importaciones de configuración del proyecto
from app.core.config import (
    DATABASE_FOLDER,
    COLUMNS_TO_READ_MASTER,
    COLUMNS_TO_READ_GRN
)
from app.utils.country import get_country_csv_path

# --- Cache de DataFrames en memoria para este módulo (SEGMENTADO POR PAÍS) ---
df_grn_cache = {}          # { 'MX': DataFrame, 'AR': DataFrame }
master_qty_map = {}        # { 'MX': dict, 'AR': dict }
grn_file_mtime = {}        # { 'MX': float, 'AR': float }
master_file_mtime = {}     # { 'MX': float, 'AR': float }

# --- Funciones de Manejo de CSV ---

def _get_json_cache_path(country_code: str, filename: str) -> str:
    """Construye la ruta a la caché JSON en static/json/{country_code}/."""
    from app.core.config import JSON_FOLDER
    country_dir = os.path.join(JSON_FOLDER, country_code)
    os.makedirs(country_dir, exist_ok=True)
    return os.path.join(country_dir, filename)

async def read_csv_safe(file_path: str, columns: list = None):
# ... resto de la función igual ...
    """
    Lee un archivo CSV de forma segura en un subproceso para no bloquear el bucle de eventos.
    Devuelve un DataFrame de pandas o None si hay un error.
    """
    if not os.path.exists(file_path):
        print(f"Error CSV: Archivo no encontrado en {file_path}")
        return None
    try:
        # Usa run_in_threadpool para operaciones de I/O bloqueantes
        df = await run_in_threadpool(pd.read_csv, file_path, usecols=columns, dtype=str, keep_default_na=True)
        # Reemplaza NaN/NaT de pandas con None nativo de Python para compatibilidad con JSON/DB
        df = df.replace({np.nan: None})
        return df
    except Exception as e:
        print(f"Error CSV: Error inesperado leyendo CSV {file_path}: {e}")
        return None

async def load_csv_data(country_code: str = "CL"):
    """
    Carga (o recarga) los datos de los archivos CSV para un país específico.
    """
    global df_grn_cache, master_qty_map, grn_file_mtime, master_file_mtime
    
    # Rutas segmentadas
    item_master_path = get_country_csv_path(DATABASE_FOLDER, 'AURRSGLBD0250.csv', country_code)
    
    print(f"Cargando datos CSV para {country_code}...")

    # --- OPTIMIZACIÓN: Cargar master_qty_map desde JSON si existe y está actualizado ---
    json_cache_path = _get_json_cache_path(country_code, 'stock_qty_cache.json')
    csv_exists = os.path.exists(item_master_path)
    json_exists = os.path.exists(json_cache_path)
    
    should_read_csv = True
    
    # Inicializar caches para este país si no existen
    if country_code not in master_qty_map:
        master_qty_map[country_code] = {}

    if json_exists and csv_exists:
        # Comparar timestamps: solo leer CSV si es más nuevo que el JSON
        csv_mtime = os.path.getmtime(item_master_path)
        json_mtime = os.path.getmtime(json_cache_path)
        
        if json_mtime >= csv_mtime:
            # JSON está actualizado, cargar desde ahí
            try:
                print(f"⚡ [{country_code}] Cargando master_qty_map desde JSON cache...")
                with open(json_cache_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                master_qty_map[country_code].clear()
                master_qty_map[country_code].update(data)
                master_file_mtime[country_code] = csv_mtime
                should_read_csv = False
            except Exception as e:
                print(f"⚠️ [{country_code}] Error leyendo JSON cache, fallback a CSV: {e}")
                should_read_csv = True
    
    if should_read_csv and csv_exists:
        print(f"📖 [{country_code}] Leyendo CSV maestro...")
        df_master = await read_csv_safe(item_master_path, columns=COLUMNS_TO_READ_MASTER)
        
        if df_master is not None:
            master_file_mtime[country_code] = os.path.getmtime(item_master_path)
            master_qty_map[country_code].clear()
            items = df_master['Item_Code'].values
            quantities = pd.to_numeric(df_master['Physical_Qty'], errors='coerce').fillna(0).astype(int).values
            master_qty_map[country_code].update(dict(zip(items, quantities)))

            # Persistir master_qty_map a JSON
            try:
                def numpy_converter(obj):
                    if isinstance(obj, (np.integer, int)): return int(obj)
                    if isinstance(obj, (np.floating, float)): return float(obj)
                    raise TypeError(f"Type {type(obj)} not serializable")

                with open(json_cache_path, 'w', encoding='utf-8') as f:
                    json.dump(master_qty_map[country_code], f, default=numpy_converter)
            except Exception: pass

    # Cargar GRN
    await load_grn_data_optimized(country_code)
    
    # Procesar PO Extractor si existe
    await process_po_extractor(country_code)

async def process_po_extractor(country_code: str):
    """Procesa el Excel del robot y genera po_lookup.json para el país."""
    excel_path = get_country_csv_path(DATABASE_FOLDER, 'Purchase Order Extractor.xlsx', country_code)
    if not os.path.exists(excel_path):
        return

    json_path = _get_json_cache_path(country_code, 'po_lookup.json')
    
    try:
        print(f"📑 [{country_code}] Procesando PO Extractor...")
        df = await run_in_threadpool(pd.read_excel, excel_path, engine='openpyxl')
        
        # Normalizar columnas (limpieza robusta)
        df.columns = [str(c).strip().upper() for c in df.columns]
        
        # Identificar columnas por nombres posibles
        ir_col = next((c for c in df.columns if c in ['IMPORT_REFERENCE', 'IMPORT REFERENCE', 'IMPORT REF CODE']), None)
        grn_col = next((c for c in df.columns if c in ['GRN_NUMBER', 'GRN NUMBER']), None)
        wb_col = next((c for c in df.columns if c in ['WAYBILL', 'WAYBILL NUMBER']), None)
        item_col = next((c for c in df.columns if c in ['ITEM_CODE', 'ITEM CODE']), None)
        qty_col = next((c for c in df.columns if c in ['DESPATCHED_QTY', 'DESPATCHED QTY', 'QUANTITY']), None)

        if not ir_col or not wb_col:
            print(f"⚠️ [{country_code}] Faltan columnas críticas en PO Extractor (IR: {ir_col}, WB: {wb_col})")
            return

        # Limpiar datos
        df = df.fillna("")
        df[ir_col] = df[ir_col].astype(str).str.strip().str.upper()
        df[wb_col] = df[wb_col].astype(str).str.strip().str.upper()
        
        # Filtrar vacíos
        df = df[(df[ir_col] != "") & (df[wb_col] != "") & (df[ir_col] != "NAN") & (df[wb_col] != "NAN")]

        ir_lookup = {}
        wb_lookup = {}

        # Generar ir_to_data
        for ir, group in df.groupby(ir_col):
            first_row = group.iloc[0]
            items_list = []
            for _, row in group.iterrows():
                item_info = {"item_code": str(row.get(item_col, "")).strip().upper()}
                if grn_col: item_info["grn"] = str(row.get(grn_col, "")).replace('.0', '').strip().upper()
                if qty_col: item_info["qty"] = str(row.get(qty_col, ""))
                items_list.append(item_info)
            
            ir_lookup[ir] = {
                "waybill": str(first_row[wb_col]),
                "items": items_list
            }

        # Generar wb_to_data
        for wb, group in df.groupby(wb_col):
            first_row = group.iloc[0]
            items_list = []
            for _, row in group.iterrows():
                item_info = {"item_code": str(row.get(item_col, "")).strip().upper()}
                if grn_col: item_info["grn"] = str(row.get(grn_col, "")).replace('.0', '').strip().upper()
                if qty_col: item_info["qty"] = str(row.get(qty_col, ""))
                items_list.append(item_info)
            
            wb_lookup[wb] = {
                "import_ref": str(first_row[ir_col]),
                "items": items_list
            }

        lookup_data = {
            "wb_to_data": wb_lookup,
            "ir_to_data": ir_lookup,
            "updated_at": datetime.datetime.now().isoformat()
        }

        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(lookup_data, f, indent=4)
        print(f"✅ [{country_code}] po_lookup.json generado con mapas cruzados.")
        
    except Exception as e:
        import traceback
        print(f"⚠️ Error procesando PO Extractor ({country_code}): {e}")
        print(traceback.format_exc())

async def load_grn_data_optimized(country_code: str):
    global df_grn_cache, grn_file_mtime
    
    grn_csv_path = get_country_csv_path(DATABASE_FOLDER, 'AURRSGLBD0280.csv', country_code)
    json_cache_path = _get_json_cache_path(country_code, 'grn_cache.json')
    
    if not os.path.exists(grn_csv_path):
        df_grn_cache[country_code] = None
        return

    current_mtime = os.path.getmtime(grn_csv_path)
    
    # Si el caché en memoria ya es válido, no hacer nada
    if df_grn_cache.get(country_code) is not None and grn_file_mtime.get(country_code) == current_mtime:
        return

    # Intentar cargar desde JSON si el archivo CSV no ha cambiado
    if os.path.exists(json_cache_path):
        try:
            if os.path.getmtime(json_cache_path) >= current_mtime:
                print(f"⚡ [{country_code}] Cargando GRN desde JSON cache...")
                with open(json_cache_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                df_grn_cache[country_code] = pd.DataFrame(data)
                grn_file_mtime[country_code] = current_mtime
                return
        except Exception as e:
            print(f"⚠️ Error cargando JSON cache de GRN: {e}")

    # Si no hay caché o es viejo, leer CSV
    print(f"📖 [{country_code}] Regenerando cache JSON para GRN...")
    # Intentamos leer sin especificar columnas primero para detectar nombres reales
    try:
        df_grn_raw = await run_in_threadpool(pd.read_csv, grn_csv_path, dtype=str)
        if df_grn_raw is not None:
            # Normalizar nombres de columnas (reemplazar espacios por guiones bajos)
            df_grn_raw.columns = [c.strip().replace(' ', '_') for c in df_grn_raw.columns]
            
            # Guardar en caché JSON para rapidez futura
            grn_data = df_grn_raw.to_dict(orient='records')
            with open(json_cache_path, 'w', encoding='utf-8') as f:
                json.dump(grn_data, f)
            
            df_grn_cache[country_code] = df_grn_raw
            grn_file_mtime[country_code] = current_mtime
    except Exception as e:
        print(f"❌ Error fatal leyendo GRN CSV: {e}")
        df_grn_cache[country_code] = None



async def reload_cache_if_needed(country_code: str = "CL"):
    """
    Verifica si los archivos CSV o el Excel cambiaron para un país determinado.
    """
    global grn_file_mtime, master_file_mtime
    
    import time
    current_time = time.time()
    
    # Throttle por país
    check_key = f'_last_check_{country_code}'
    if hasattr(reload_cache_if_needed, check_key) and (current_time - getattr(reload_cache_if_needed, check_key)) < 5:
        return
    setattr(reload_cache_if_needed, check_key, current_time)
    
    item_master_path = get_country_csv_path(DATABASE_FOLDER, 'AURRSGLBD0250.csv', country_code)
    grn_csv_path = get_country_csv_path(DATABASE_FOLDER, 'AURRSGLBD0280.csv', country_code)
    excel_path = get_country_csv_path(DATABASE_FOLDER, 'Purchase Order Extractor.xlsx', country_code)
    
    need_reload = False
    
    if os.path.exists(item_master_path):
        mtime = os.path.getmtime(item_master_path)
        if master_file_mtime.get(country_code) is None or mtime != master_file_mtime.get(country_code):
            need_reload = True
        master_file_mtime[country_code] = mtime
            
    if os.path.exists(grn_csv_path):
        mtime = os.path.getmtime(grn_csv_path)
        if grn_file_mtime.get(country_code) is None or mtime != grn_file_mtime.get(country_code):
            need_reload = True
        grn_file_mtime[country_code] = mtime

    # Detectar cambios en el Excel de PO Extractor
    excel_mtime_key = f'_excel_mtime_{country_code}'
    if os.path.exists(excel_path):
        excel_mtime = os.path.getmtime(excel_path)
        last_excel_mtime = getattr(reload_cache_if_needed, excel_mtime_key, None)
        if last_excel_mtime is None or excel_mtime != last_excel_mtime:
            setattr(reload_cache_if_needed, excel_mtime_key, excel_mtime)
            print(f"🔄 [{country_code}] Excel actualizado, regenerando po_lookup.json...")
            await process_po_extractor(country_code)
    
    if need_reload:
        await load_csv_data(country_code)





def get_df_grn(country_code: str = "CL"):
    """Devuelve el DataFrame de GRN (280) cargado en caché para un país."""
    return df_grn_cache.get(country_code)


async def get_item_details_from_master_csv(item_code: str, country_code: str = "CL"):
    """Busca detalles de un item leyendo el CSV del país correspondiente."""
    if not item_code:
        return None

    item_code = str(item_code).strip()
    item_master_path = get_country_csv_path(DATABASE_FOLDER, 'AURRSGLBD0250.csv', country_code)
    
    if not os.path.exists(item_master_path):
        raise HTTPException(status_code=500, detail=f"Maestro de items ({country_code}) no disponible.")

    def find_item():
        try:
            for chunk in pd.read_csv(
                item_master_path,
                usecols=COLUMNS_TO_READ_MASTER,
                dtype=str,
                keep_default_na=True,
                chunksize=5000
            ):
                chunk = chunk.replace({np.nan: None})
                matches = chunk[chunk['Item_Code'].astype(str).str.strip() == item_code]
                if not matches.empty:
                    return matches.iloc[0].fillna('').to_dict()
        except Exception as e:
            raise e
        return None

    try:
        return await run_in_threadpool(find_item)
    except Exception as e:
        print(f"Error buscando item {item_code} en CSV: {e}")
        raise HTTPException(status_code=500, detail="Error leyendo maestro de items.")

async def get_total_expected_quantity_for_item(item_code_form: str, country_code: str = "CL"):
    """Suma la cantidad esperada para un item desde el archivo GRN cacheado del país."""
    cache = df_grn_cache.get(country_code)
    if cache is None:
        return 0
    
    result_df = cache[cache['Item_Code'] == item_code_form]
    if not result_df.empty:
        numeric_quantities = pd.to_numeric(result_df['Quantity'], errors='coerce').fillna(0)
        return int(numeric_quantities.sum())
    return 0

async def load_master_subset(columns: list, positive_stock_only: bool = False, country_code: str = "CL"):
    """Carga columnas específicas del maestro en memoria temporal para un país."""
    item_master_path = get_country_csv_path(DATABASE_FOLDER, 'AURRSGLBD0250.csv', country_code)
    if not os.path.exists(item_master_path):
        raise HTTPException(status_code=500, detail=f"Maestro de items ({country_code}) no disponible.")

    selected_cols = list(dict.fromkeys(columns + (['Physical_Qty'] if positive_stock_only and 'Physical_Qty' not in columns else [])))

    def load_subset():
        frames = []
        for chunk in pd.read_csv(
            item_master_path,
            usecols=selected_cols,
            dtype=str,
            keep_default_na=True,
            chunksize=5000
        ):
            chunk = chunk.replace({np.nan: None})
            if positive_stock_only and 'Physical_Qty' in chunk.columns:
                qty = pd.to_numeric(chunk['Physical_Qty'], errors='coerce').fillna(0)
                chunk = chunk[qty > 0]
            frames.append(chunk)
        if not frames:
            return pd.DataFrame(columns=selected_cols)
        return pd.concat(frames, ignore_index=True)

    try:
        return await run_in_threadpool(load_subset)
    except Exception as e:
        print(f"Error cargando subconjunto del maestro: {e}")
        raise HTTPException(status_code=500, detail="Error leyendo maestro de items.")


async def get_locations_with_stock_count(country_code: str = "CL"):
    """Calcula cuántas ubicaciones tienen stock físico > 0 para un país."""
    item_master_path = get_country_csv_path(DATABASE_FOLDER, 'AURRSGLBD0250.csv', country_code)
    if not os.path.exists(item_master_path):
        raise HTTPException(status_code=500, detail=f"Maestro de items ({country_code}) no disponible.")

    def compute_bins():
        bins = set()
        for chunk in pd.read_csv(
            item_master_path,
            usecols=['Physical_Qty', 'Bin_1'],
            dtype=str,
            keep_default_na=True,
            chunksize=5000
        ):
            qty = pd.to_numeric(chunk['Physical_Qty'], errors='coerce').fillna(0)
            mask = qty > 0
            if mask.any():
                bins.update(chunk.loc[mask, 'Bin_1'].dropna().astype(str).str.strip())
        # Filtrar vacíos
        return len([b for b in bins if b])

    try:
        return await run_in_threadpool(compute_bins)
    except Exception as e:
        print(f"Error calculando ubicaciones con stock: {e}")
        raise HTTPException(status_code=500, detail="Error leyendo maestro de items.")


async def get_stock_data():
    """Devuelve un DataFrame con las columnas del maestro, cargado on-demand."""
    return await load_master_subset(COLUMNS_TO_READ_MASTER)