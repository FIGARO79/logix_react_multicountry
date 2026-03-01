import os
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Header, Query
from app.core.config import DATABASE_FOLDER, INTEGRATION_API_KEY
from app.utils.country import get_country_csv_path

# Router dedicado a integraciones con sistemas externos como Power Automate
router = APIRouter(
    prefix="/api/integrations",
    tags=["Integrations"]
)

def verify_api_key(x_api_key: str = Header(..., description="API Key para integradores")):
    """Verifica el token de autorización enviado por Power Automate"""
    if x_api_key != INTEGRATION_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return x_api_key

@router.post("/upload/csv")
async def upload_ssrs_csv(
    report_name: str, 
    country_code: str = Query("MX", description="Código de país (MX, PE, CL, etc.)"),
    file: UploadFile = File(...), 
    api_key: str = Depends(verify_api_key)
):
    """
    Endpoint diseñado para recibir archivos CSV directamente desde Microsoft Power Automate.
    
    - **report_name**: Nombre del reporte (ej: 'AURRSGLBD0240').
    - **country_code**: Código del país al que pertenece el reporte.
    - **file**: El contenido del archivo CSV exportado desde SSRS.
    """
    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="El archivo debe tener extensión .csv")
        
    # Limpiar el nombre ingresado
    base_name = report_name.replace(".csv", "").strip() + ".csv"
    
    # Obtener la ruta específica del país usando la utilidad existente
    file_path = get_country_csv_path(DATABASE_FOLDER, base_name, country_code)
    
    try:
        contents = await file.read()
        
        # Asegurar que el directorio existe
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        with open(file_path, "wb") as f:
            f.write(contents)
            
        print(f"📥 Archivo recibido ({country_code}) desde Power Automate: {base_name} ({len(contents)} bytes)")
        return {
            "status": "success",
            "message": f"Archivo para {country_code} actualizado correctamente", 
            "file": os.path.basename(file_path), 
            "size_bytes": len(contents)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar archivo: {str(e)}")
