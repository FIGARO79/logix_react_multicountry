import json
import os
import datetime
from typing import Dict, Any, Optional, List
from app.core.config import JSON_FOLDER

class AISlottingService:
    def __init__(self):
        self.base_folder = JSON_FOLDER

    def _get_memory_path(self, country_code: str) -> str:
        country_folder = os.path.join(self.base_folder, country_code)
        os.makedirs(country_folder, exist_ok=True)
        return os.path.join(country_folder, 'ai_slotting_memory.json')

    def _ensure_memory_exists(self, path: str):
        if not os.path.exists(path):
            with open(path, 'w') as f:
                json.dump({
                    "item_patterns": {},      # Memoria por Item Code específico
                    "category_patterns": {},  # Memoria por SIC/ABC Code
                    "stats": {"total_learned": 0, "last_update": None}
                }, f, indent=4)

    def _load_memory(self, country_code: str) -> Dict[str, Any]:
        path = self._get_memory_path(country_code)
        self._ensure_memory_exists(path)
        try:
            with open(path, 'r') as f:
                return json.load(f)
        except:
            return {"item_patterns": {}, "category_patterns": {}, "stats": {}}

    def _save_memory(self, country_code: str, memory: Dict[str, Any]):
        path = self._get_memory_path(country_code)
        with open(path, 'w') as f:
            json.dump(memory, f, indent=4)

    def learn_from_decision(self, country_code: str, item_code: str, final_bin: str, sic_code: str):
        """
        Registra una decisión de ubicación exitosa para 'entrenar' al modelo.
        """
        if not final_bin or not item_code or not country_code:
            return

        memory = self._load_memory(country_code)
        item_code = item_code.strip().upper()
        final_bin = final_bin.strip().upper()
        sic_code = sic_code.strip().upper() if sic_code else "N/A"

        # 1. Aprender por Item Específico
        if "item_patterns" not in memory: memory["item_patterns"] = {}
        if item_code not in memory["item_patterns"]:
            memory["item_patterns"][item_code] = {}
        
        memory["item_patterns"][item_code][final_bin] = memory["item_patterns"][item_code].get(final_bin, 0) + 1

        # 2. Aprender por Categoría (SIC Code)
        if "category_patterns" not in memory: memory["category_patterns"] = {}
        if sic_code not in memory["category_patterns"]:
            memory["category_patterns"][sic_code] = {}
        
        memory["category_patterns"][sic_code][final_bin] = memory["category_patterns"][sic_code].get(final_bin, 0) + 1

        # 3. Actualizar Estadísticas
        if "stats" not in memory: memory["stats"] = {"total_learned": 0}
        memory["stats"]["total_learned"] += 1
        memory["stats"]["last_update"] = datetime.datetime.now().isoformat()

        self._save_memory(country_code, memory)

    def predict_best_bin(self, country_code: str, item_code: str, sic_code: str, fallback_bin: Optional[str] = None) -> Optional[str]:
        """
        Predice la ubicación más probable basada en el aprendizaje previo.
        """
        if not country_code: return fallback_bin
        
        memory = self._load_memory(country_code)
        item_code = item_code.strip().upper()
        sic_code = sic_code.strip().upper() if sic_code else "N/A"

        # Prioridad 1: ¿Hemos guardado este item exacto antes? (Alta Confianza)
        if item_code in memory.get("item_patterns", {}):
            bins = memory["item_patterns"][item_code]
            # Devolver el bin con mayor frecuencia de uso
            best_bin = max(bins, key=bins.get)
            if bins[best_bin] >= 2: # Necesitamos al menos 2 evidencias
                return best_bin

        # Prioridad 2: ¿Qué ubicaciones son comunes para esta categoría SIC? (Media Confianza)
        if sic_code in memory.get("category_patterns", {}):
            bins = memory["category_patterns"][sic_code]
            best_bin = max(bins, key=bins.get)
            if bins[best_bin] >= 5: # Necesitamos más evidencias para categorías generales
                return best_bin

        # Prioridad 3: Fallback al algoritmo de Slotting tradicional
        return fallback_bin

ai_slotting = AISlottingService()
