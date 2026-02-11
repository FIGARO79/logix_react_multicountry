from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.utils.country import get_current_country

class CountryMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Intentar obtener el país de la sesión o del header
        country = request.session.get('country_code')
        
        # Inyectar en el estado de la petición
        request.state.country_code = country
        
        response = await call_next(request)
        return response
