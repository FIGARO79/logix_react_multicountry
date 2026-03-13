import json
import os
import pandas as pd
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.models.sql_models import MasterItem, Log
from app.core.config import JSON_FOLDER

class SlottingService:
    def __init__(self):
        self.base_folder = JSON_FOLDER

    def _get_params_path(self, country_code: str) -> str:
        return os.path.join(self.base_folder, country_code, 'slotting_parameters.json')

    def _load_params(self, country_code: str) -> Dict[str, Any]:
        path = self._get_params_path(country_code)
        try:
            if os.path.exists(path):
                with open(path, 'r') as f:
                    return json.load(f)
        except Exception as e:
            print(f"Error cargando slotting_parameters.json ({country_code}): {e}")
        return {"turnover": {}, "storage": {}}

    async def get_suggested_bin(self, db: AsyncSession, country_code: str, item_details: Dict[str, Any]) -> Optional[str]:
        # Recargar parámetros por si cambiaron en admin
        params = self._load_params(country_code)
        storage = params.get('storage', {})
        current_bin = str(item_details.get('Bin_1', '')).strip().upper()

        if current_bin in storage:
            return None

        occupancy = await self._get_bins_occupancy(db, country_code)
        
        target_zone = None
        target_levels = None
        forbidden_zones = []
        description = str(item_details.get('Item_Description', '')).upper()
        sic_code = str(item_details.get('SIC_Code_stockroom', '')).strip().upper()
        
        weight = 0.0
        try:
            weight_val = item_details.get('Weight_per_Unit', '0')
            weight = float(str(weight_val).replace(',', '')) if weight_val else 0.0
        except: pass

        if "ROD" in description or "INTEGRAL STEEL" in description:
            target_zone = "Cantilever"
        elif 0 < weight < 0.1:
            target_zone = "Minuteria"
        elif sic_code in ['W', 'Z'] and weight > 10:
            target_levels = [2, 3, 4, 5]
            target_zone = "Rack"
        
        if target_zone is None:
            forbidden_zones = ["Cantilever", "Minuteria"]

        candidates = []
        for bin_code, info in storage.items():
            zone = info.get('zone')
            level = info.get('level')
            if zone in forbidden_zones: continue
            if target_zone and zone != target_zone: continue
            if target_levels and level not in target_levels: continue

            current_items = occupancy.get(bin_code.upper(), 0)
            limit = 3 if zone == "Minuteria" else 4
            
            if current_items < limit:
                candidates.append({
                    'bin': bin_code,
                    'occupancy': current_items,
                    'spot': info.get('spot', 'Cold').lower()
                })

        turnover_map = params.get('turnover', {})
        ideal_spot = turnover_map.get(sic_code, {}).get('spot', 'cold').lower()

        if sic_code in ['Y', 'K', 'L', 'Z', '0']:
            exact_matches = [c for c in candidates if c['spot'] == ideal_spot]
            if exact_matches: candidates = exact_matches

        candidates.sort(key=lambda x: (x['spot'] != ideal_spot, x['occupancy']))
        return candidates[0]['bin'] if candidates else None

    async def _get_bins_occupancy(self, db: AsyncSession, country_code: str) -> Dict[str, int]:
        """Calcula cuántos SKUs hay en cada bin."""
        occupancy = {}
        try:
            # 1. Master Items
            master_stmt = select(MasterItem.bin_1, func.count(MasterItem.item_code)).where(and_(
                MasterItem.physical_qty > 0,
                MasterItem.country_code == country_code
            )).group_by(MasterItem.bin_1)
            master_res = await db.execute(master_stmt)
            for bin_code, count in master_res.all():
                if bin_code:
                    code = str(bin_code).strip().upper()
                    occupancy[code] = occupancy.get(code, 0) + count

            # 2. Logs Activos (Reubicaciones pendientes)
            logs_stmt = select(Log.relocatedBin, func.count(func.distinct(Log.itemCode))).where(and_(
                Log.archived_at == None, 
                Log.relocatedBin != '', 
                Log.relocatedBin != None,
                Log.country_code == country_code
            )).group_by(Log.relocatedBin)
            logs_res = await db.execute(logs_stmt)
            for bin_code, count in logs_res.all():
                if bin_code:
                    code = str(bin_code).strip().upper()
                    occupancy[code] = occupancy.get(code, 0) + count
        except Exception as e:
            print(f"Error calculando ocupación ({country_code}): {e}")
        return occupancy

slotting_service = SlottingService()
