# Documentación Técnica Detallada - Logix ApiRouter

Esta documentación describe la responsabilidad de cada módulo del sistema Logix ApiRouter Multicountry y detalla las funciones clave que permiten su operación.

---

## 🏗️ Capa de Servicios (`app/services/`)

La lógica de negocio reside en esta capa. Todos los servicios son conscientes del país (`country_code`) para garantizar el aislamiento de datos.

### 🧠 `ai_slotting.py` (IA de Ubicaciones)
Encargado del aprendizaje y predicción de ubicaciones en el almacén.
- `learn_from_decision`: Registra cada decisión manual de ubicación para fortalecer el patrón de almacenamiento por país.
- `predict_best_bin`: Devuelve la mejor sugerencia de ubicación cruzando patrones históricos del ítem y su categoría SIC.

### 📑 `reconciliation_service.py` (Cruce de Datos)
Módulo crítico que calcula discrepancias entre lo recibido y lo esperado.
- `get_reconciliation_calculations`: Realiza un merge dinámico de Logs, archivos 280 y el PO Extractor del Robot. Normaliza automáticamente nombres de columnas.
- `create_snapshot`: Persiste el estado actual de la conciliación para auditorías futuras.
- `auto_snapshot_before_update`: Garantiza que nunca se pierdan datos de diferencias al actualizar archivos CSV.

### 📦 `csv_handler.py` (Gestión de Ficheros y Caché)
Capa de abstracción para la lectura de archivos grandes y gestión de cachés JSON.
- `load_csv_data`: Orquestador que carga el maestro y GRN en memoria.
- `process_po_extractor`: Transforma el Excel descargado por el robot en un archivo `po_lookup.json` segmentado por país.
- `reload_cache_if_needed`: Middleware-friendly check que recarga datos solo si el archivo físico ha cambiado.
- `get_item_details_from_master_csv`: Búsqueda ultra-rápida de ítems usando lectura por bloques (*chunking*).

### 🤖 `po_robot.py` (Automatización de Descargas)
Utiliza Playwright para interactuar con el portal externo de Sandvik.
- `run_po_robot`: Ejecuta un ciclo secuencial: entra al portal, configura fechas, y descarga los reportes de AR, BR, CL, CO y PE uno tras otro, guardándolos en sus carpetas respectivas.

### 📊 `db_counts.py` (Gestión de Conteos)
Maneja la persistencia de los inventarios cíclicos y generales.
- `create_count_session`: Inicia una nueva sesión de conteo (Cíclico o W2W).
- `save_stock_count`: Registra un ítem contado, vinculándolo a la sesión y al país.
- `close_location_in_session`: Marca un bin como finalizado para auditoría.

---

## 🛣️ Capa de Routers (`app/routers/`)

Define los endpoints de la API y gestiona la seguridad por permisos.

### 🔐 `auth.py`
Gestión de identidad y acceso.
- `/api/login`: Inicia sesión validando usuario, contraseña y país.
- `/api/register`: Permite nuevos registros que quedan pendientes de aprobación.

### 📝 `logs.py` (Operaciones de Inbound)
- `/api/find_item`: El punto de entrada para escaneo en muelle. Integra IA de Slotting y datos maestros.
- `/api/add_log`: Guarda ingresos y dispara el entrenamiento de la IA.

### 📉 `api_views.py` (Inteligencia de Datos)
- `/api/views/reconciliation`: Devuelve la matriz completa de diferencias, permitiendo filtrar por "Instantáneas" pasadas.
- `/api/view_logs`: Historial detallado de movimientos de almacén.

### ⚙️ `admin.py` (Configuración Maestra)
- `/api/admin/slotting-summary`: Provee el estado de saturación del almacén en tiempo real.
- `/api/admin/slotting-config`: Permite al administrador definir el layout (Zonas, Pasillos, Niveles) por cada país.

### 🔄 `update.py` (Control de Ficheros)
- `/api/update`: Recibe archivos CSV y los distribuye en las carpetas `databases/{PAIS}/`.
- `/api/run_po_robot`: Lanza el robot de descarga en segundo plano y monitorea su progreso.

---

## 🛡️ Capa de Middleware (`app/middleware/`)

### 🌍 `country.py`
Determina el país del usuario analizando la sesión o las cabeceras de la petición, inyectando `country_code` en el estado de FastAPI.

### ⚡ `csv_cache_reload.py`
Asegura que todos los procesos del servidor tengan la versión más reciente de los datos CSV en memoria, sincronizándolos automáticamente tras una subida de archivos.

---

## 📐 Capa de Modelos (`app/models/`)

### `sql_models.py`
Define las tablas de SQLAlchemy. Todas incluyen la columna `country_code` para separación lógica.
- `User`: Usuarios y permisos.
- `Log`: Movimientos de entrada.
- `MasterItem`: Catálogo de productos.
- `ReconciliationHistory`: Historial de Snapshots.
- `CycleCount`: Planificación de conteos.

---

## 💻 Frontend (`frontend/src/pages/`)

- `Login.jsx`: Entrada al sistema con selección obligatoria de país.
- `DashboardInventario.jsx`: Gráficos de exactitud ERI y valorización de ajustes.
- `Reconciliation.jsx`: Tabla maestra de diferencias con soporte de snapshots.
- `Update.jsx`: Centro de carga de datos y control del robot de automatización.
- `SlottingConfig.jsx`: Editor visual del layout del almacén.
