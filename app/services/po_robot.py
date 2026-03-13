import os
import time
from playwright.sync_api import sync_playwright
from app.core.config import PO_EXTRACTOR_EXCEL_PATH

REPORT_URL = "https://sandvik-controltower.azurewebsites.net/Report/PurchaseOrderExtractor"

def run_po_robot(target_countries: list, start_date: str, end_date: str, base_db_folder: str):
    """
    Ejecuta el robot de Playwright descargando un informe individual por cada país seleccionado.
    """
    COUNTRY_MAP = {
        "AR": "#Form_SelectedCountries_0__IsSelected",
        "BR": "#Form_SelectedCountries_1__IsSelected",
        "CL": "#Form_SelectedCountries_2__IsSelected",
        "CO": "#Form_SelectedCountries_3__IsSelected",
        "PE": "#Form_SelectedCountries_4__IsSelected",
    }

    with sync_playwright() as p:
        print(f"🔧 Iniciando robot secuencial para: {target_countries}", flush=True)
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        try:
            page.goto(REPORT_URL, wait_until="load", timeout=120000)
            time.sleep(5)
            
            # 1. Configurar Fechas
            page.locator("#Form_StartDate").click()
            page.locator("#Form_StartDate").clear()
            page.keyboard.type(start_date, delay=50)
            page.keyboard.press("Enter")

            page.locator("#Form_EndDate").click()
            page.locator("#Form_EndDate").clear()
            page.keyboard.type(end_date, delay=50)
            page.keyboard.press("Enter")

            # 2. Ciclo de descarga por país
            for code in target_countries:
                selector = COUNTRY_MAP.get(code.upper())
                if not selector: continue

                print(f"📦 Procesando {code}...", flush=True)
                
                # Desmarcar todos primero para asegurar informe individual
                for s in COUNTRY_MAP.values():
                    check = page.locator(s)
                    check.scroll_into_view_if_needed()
                    if check.is_checked():
                        check.uncheck(force=True)

                # Marcar el país actual
                target_check = page.locator(selector)
                target_check.scroll_into_view_if_needed()
                target_check.check(force=True)

                # Preparar ruta de guardado: databases/{PAIS}/...
                country_dir = os.path.join(base_db_folder, code.upper())
                os.makedirs(country_dir, exist_ok=True)
                save_path = os.path.join(country_dir, 'Purchase Order Extractor.xlsx')

                # Exportar
                btn = page.locator("input[name='Form.Export']")
                with page.expect_download(timeout=180000) as download_info:
                    btn.click(force=True, no_wait_after=True)
                
                download = download_info.value
                download.save_as(save_path)
                print(f"✅ Descargado {code} en {save_path}", flush=True)
                
                # Pequeña espera para no saturar
                time.sleep(3)

            browser.close()
            return True, "Descarga masiva completada con éxito."

        except Exception as e:
            if browser: browser.close()
            return False, f"Error Robot: {str(e)}"
