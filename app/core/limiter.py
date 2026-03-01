from slowapi import Limiter
from slowapi.util import get_remote_address

# Limitador global basado en la IP del cliente
limiter = Limiter(key_func=get_remote_address)
