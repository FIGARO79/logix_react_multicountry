"""
Middlewares de seguridad para la aplicación.
"""
import os
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, status
from starlette.responses import RedirectResponse


class SchemeMiddleware(BaseHTTPMiddleware):
    """Middleware para manejar el esquema HTTP/HTTPS y forzar HTTPS en producción."""
    
    async def dispatch(self, request: Request, call_next):
        # 1. Determinar el 'scheme' correcto (http o https)
        scheme = request.scope.get('scheme', 'http')
        
        # Si la cabecera 'x-forwarded-proto' existe, esa es la verdad
        if "x-forwarded-proto" in request.headers:
            scheme = request.headers['x-forwarded-proto']
        
        # 2. Actualizar el scope con el scheme correcto
        request.scope['scheme'] = scheme
        
        # 3. Continuar con la solicitud
        response = await call_next(request)
        return response


class HSTSMiddleware(BaseHTTPMiddleware):
    """Middleware para añadir cabecera HSTS en producción."""
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Saltarse HSTS en desarrollo para evitar problemas con proxy
        if os.getenv('ENVIRONMENT') == 'development':
            return response

        # Añadir HSTS si la petición es HTTPS
        scheme = request.scope.get('scheme', 'http')
        if scheme == 'https':
            # 2 años en segundos
            response.headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload'
        return response
