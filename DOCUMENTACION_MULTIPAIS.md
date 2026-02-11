# Documentación del Sistema Multi-País

Esta documentación detalla el funcionamiento y la arquitectura del sistema multi-país (multi-tenancy) implementado en la aplicación.

## 🌟 Descripción General

El sistema permite que una única instancia de la aplicación sirva a múltiples países (ej. México, Argentina, Chile) manteniendo el aislamiento total de los datos entre ellos. Cada usuario está asociado a un país y solo puede ver y gestionar los datos correspondientes a ese país.

## 🏗️ Arquitectura de Aislamiento

El aislamiento se logra a través de dos mecanismos principales:

### 1. Aislamiento en Base de Datos (MySQL/MariaDB/SQLite)
Se utiliza un esquema de multi-tenancy basado en columnas. Las tablas críticas contienen una columna `country_code` que actúa como discriminador.

- **Tablas Aisladas:**
  - `users`: Define a qué país pertenece el usuario.
  - `logs`: Registros de operaciones de inbound.
  - `count_sessions`: Sesiones de inventario.
  - `stock_counts`: Conteos individuales de stock.
  - `recount_list`: Lista de productos para reconteo.
- **Funcionamiento:** Cada consulta (SELECT, UPDATE, DELETE) incluye automáticamente una cláusula `WHERE country_code = 'XX'`.

### 2. Aislamiento de Archivos (CSV)
Los datos maestros y reportes diarios provenientes de sistemas externos (SAP/otros) se segmentan por carpetas físicas.

- **Estructura de Carpetas:**
  ```
  databases/
  ├── AR/ (Argentina)
  ├── MX/ (México)
  ├── CL/ (Chile)
  └── ...
  ```
- **Dinámica:** Cuando un usuario de México consulta el stock, la aplicación lee los archivos CSV ubicados específicamente en `databases/MX/`.

---

## 🔑 Autenticación y Sesión

1. **Inicio de Sesión:** El usuario selecciona su país en el formulario de login. Al autenticarse, el `country_code` se guarda en la sesión de Flask.
2. **Middleware:** En cada petición al servidor, un middleware recupera el país de la sesión y lo inyecta en el contexto global de Flask (`g.country_code`).
3. **Seguridad:** El país es inmutable durante la sesión. Para cambiar de país, el usuario debe cerrar sesión e iniciar una nueva.

---

## 🛠️ Guía para el Desarrollador

Para mantener el aislamiento al agregar nuevas funcionalidades, utilice los siguientes helpers definidos en `app/utils/country.py`:

### Obtener el país actual
```python
from app.utils.country import get_current_country

pais = get_current_country()  # Devuelve 'MX', 'AR', etc.
```

### Rutas de archivos por país
Nunca use rutas estáticas a la carpeta `databases/`. Utilice siempre:
```python
from app.core.config import DATABASE_FOLDER
from app.utils.country import get_country_csv_path

# Obtiene la ruta correcta: databases/MX/archivo.csv
path = get_country_csv_path(DATABASE_FOLDER, "AURRSGLBD0250.csv")
```

### Consultas a Base de Datos
Todos los servicios síncronos en `app/services/` ya están preparados para filtrar por país automáticamente. Si crea un nuevo servicio, asegúrese de pasar el `country_code` a las consultas de SQLAlchemy.

---

## 🌍 Países Soportados actualmente

| Código | País |
| :--- | :--- |
| **AR** | Argentina |
| **BR** | Brasil |
| **CL** | Chile |
| **CO** | Colombia |

---

## 🚀 Despliegue y Migración

### Asignación de Usuarios
Si existen usuarios previos sin país asignado, se debe ejecutar el script de migración:

```powershell
python assign_user_countries.py
```

### Preparación del Sistema de Archivos
Es necesario crear las subcarpetas dentro de `databases/` para cada país configurado y colocar allí los CSVs iniciales.

```bash
mkdir databases/AR databases/MX databases/CL
```
