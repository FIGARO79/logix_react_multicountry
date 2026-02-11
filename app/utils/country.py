import os
from fastapi import Request
from typing import Optional

def get_current_country(request: Request) -> Optional[str]:
    """
    Obtiene el código de país del contexto de la petición.
    Busca primero en la sesión del usuario.
    """
    # Intentar obtener de la sesión (Flask legacy/Starlette SessionMiddleware)
    country = request.session.get('country_code')
    
    # Si no está en sesión, podría estar en el estado de la petición (inyectado por middleware)
    if not country:
        country = getattr(request.state, 'country_code', None)
        
    return country

def get_country_csv_path(base_folder: str, filename: str, country_code: Optional[str] = None) -> str:
    """
    Construye la ruta al archivo CSV segmentado por país.
    Ej: databases/MX/archivo.csv
    """
    if country_code:
        return os.path.join(base_folder, country_code, filename)
    return os.path.join(base_folder, filename)
