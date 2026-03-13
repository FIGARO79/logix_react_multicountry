"""
Router para endpoints de stock/inventario.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.services import csv_handler, db_logs
from app.utils.auth import login_required, permission_required
from app.utils.country import get_current_country

router = APIRouter(prefix="/api", tags=["stock"])


@router.get('/stock')
async def get_stock(request: Request, username: str = Depends(permission_required("stock"))):
    """Obtiene datos de stock desde el CSV."""
    country = get_current_country(request) or "CL"
    stock_data = await csv_handler.get_stock_data(country_code=country)
    if stock_data is not None:
        return JSONResponse(stock_data.to_dict(orient='records'))
    raise HTTPException(status_code=500, detail="No se pudo cargar los datos de stock.")


@router.get('/stock_item/{item_code}')
async def get_stock_item(request: Request, item_code: str, username: str = Depends(permission_required("stock"))):
    """Obtiene información de stock para un item específico."""
    country = get_current_country(request) or "CL"
    item_details = await csv_handler.get_item_details_from_master_csv(item_code, country_code=country)
    if item_details is None:
        raise HTTPException(status_code=404, detail=f"Artículo {item_code} no encontrado.")
    return JSONResponse(item_details)


@router.get('/get_item_details/{item_code}')
async def get_item_details_for_label(request: Request, item_code: str, db: AsyncSession = Depends(get_db), username: str = Depends(permission_required("stock"))):
    """Obtiene detalles de un item para generar etiquetas."""
    country = get_current_country(request) or "CL"
    item_details = await csv_handler.get_item_details_from_master_csv(item_code, country_code=country)
    if not item_details:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")
    
    # Obtener la ubicación efectiva (reubicada si existe, o la original del maestro)
    original_bin = item_details.get('Bin_1', 'N/A')
    latest_relocated_bin = await db_logs.get_latest_relocated_bin_async(db, item_code, country_code=country)
    effective_bin_location = latest_relocated_bin if latest_relocated_bin else original_bin
    
    response_data = {
        'item_code': item_details.get('Item_Code'),
        'description': item_details.get('Item_Description'),
        'bin_location': effective_bin_location,  # Ubicación efectiva
        'additional_bins': item_details.get('Aditional_Bin_Location'),
        'weight_kg': item_details.get('Weight_per_Unit')
    }
    return JSONResponse(content=response_data)
