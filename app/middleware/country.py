from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.utils.country import get_current_country

class CountryMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Asegurarse de que el atributo country_code exista en el estado
        request.state.country_code = "CL" # Valor por defecto seguro
        
        try:
            # Intentar obtener el país de la sesión (si existe)
            if hasattr(request, "session"):
                country = request.session.get('country_code')
                if country:
                    request.state.country_code = country
        except Exception:
            # Si falla el acceso a la sesión, mantenemos el valor por defecto
            pass
        
        response = await call_next(request)
        return response
