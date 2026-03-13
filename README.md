# Logix ApiRouter - Multicountry Edition

Sistema avanzado de gestión de inventario y API Router diseñado para operar de forma independiente en múltiples países. Esta edición implementa una arquitectura segmentada que permite gestionar datos, configuraciones e inteligencia artificial de forma aislada para cada región.

## 🚀 Arquitectura Multicountry

El sistema utiliza un contexto de país (`country_code`) inyectado mediante middleware para segmentar todas las operaciones:

- **Bases de Datos SQL**: Columna `country_code` en todas las tablas críticas para aislar registros de usuarios, logs y auditorías.
- **Archivos CSV**: Almacenados en `databases/{PAIS}/` (Maestros, GRNs, Picking).
- **Configuraciones JSON**: Almacenadas en `static/json/{PAIS}/` (Memoria de IA, Layout de Almacén, Calendarios).

## 📂 Estructura del Proyecto

```text
/logix_react_multicountry
├── app/                        # Backend Python (FastAPI)
│   ├── core/                   # Configuración, DB y Limiter
│   ├── middleware/             # Gestión de país y recarga de caché
│   ├── models/                 # Modelos SQL (SQLAlchemy) y Schemas (Pydantic)
│   ├── routers/                # Endpoints de API organizados por dominio
│   ├── services/               # Lógica de negocio (IA, Conciliación, Robot)
│   └── utils/                  # Utilidades de autenticación y país
├── frontend/                   # Interfaz de Usuario (React + Vite)
│   ├── src/
│   │   ├── components/         # Layout y Scanner
│   │   ├── pages/              # Vistas principales (Dashboard, Inbound, etc.)
│   │   └── styles/             # Estilos CSS clonados de Logix React
├── databases/                  # Almacenamiento de archivos CSV por país
│   ├── AR/                     # Argentina
│   ├── BR/                     # Brasil
│   ├── CL/                     # Chile
│   ├── CO/                     # Colombia (Datos cargados)
│   └── PE/                     # Perú
├── static/                     # Archivos estáticos
│   ├── images/                 # Logotipos y recursos visuales
│   └── json/                   # Configuraciones dinámicas por país
├── instance/                   # Base de datos SQLite local
├── alembic/                    # Migraciones de base de datos
├── main.py                     # Punto de entrada de la aplicación
└── dev.sh                      # Script de desarrollo optimizado (Granian + Vite)
```

## 🧠 Componentes Inteligentes

### 1. IA de Slotting (`ai_slotting.py`)
Algoritmo de aprendizaje que sugiere ubicaciones óptimas basadas en:
- Decisiones históricas de los operarios por cada ítem.
- Patrones de rotación por categoría (SIC Code).
- Capacidad física y zonas del almacén.

### 2. Conciliación Avanzada (`reconciliation_service.py`)
Motor de cruce de datos que vincula:
- Logs de recepción en tiempo real.
- Archivos GRN (280) maestros.
- **PO Extractor**: Archivos frescos descargados por el robot.
- Generación de **Snapshots** para auditorías históricas.

### 3. Robot de Automatización (`po_robot.py`)
Script de Playwright que automatiza la descarga de datos desde Sandvik Control Tower:
- Selección dinámica de países (AR, BR, CL, CO, PE).
- Descarga secuencial y almacenamiento automático en carpetas nacionales.
- Procesamiento automático de datos tras la descarga.

## 🛠️ Detalle de Módulos y Funciones

### 🧠 Servicios de Backend (`app/services/`)

#### **AI Slotting (`ai_slotting.py`)**
- `learn_from_decision(country_code, item_code, final_bin, sic_code)`: Registra decisiones de ubicación para entrenar el modelo por país.
- `predict_best_bin(country_code, item_code, sic_code, fallback)`: Predice la ubicación más probable usando patrones históricos y categorías SIC.

#### **Reconciliación (`reconciliation_service.py`)**
- `get_reconciliation_calculations(db, country_code, archive_date)`: Cruza logs, GRNs y PO Extractor para calcular diferencias en tiempo real.
- `create_snapshot(db, country_code, data, username)`: Congela el estado actual de la conciliación en una tabla histórica.
- `auto_snapshot_before_update(db, country_code, username)`: Backup automático preventivo antes de cargar nuevos archivos.

#### **Manejo de Datos (`csv_handler.py`)**
- `load_csv_data(country_code)`: Carga masiva de maestros y GRNs con optimización por caché JSON.
- `process_po_extractor(country_code)`: Transforma el Excel del robot en un índice de búsqueda (`po_lookup.json`).
- `get_item_details_from_master_csv(item_code, country_code)`: Búsqueda indexada de ítems en archivos de hasta 6MB.

#### **Robot PO (`po_robot.py`)**
- `run_po_robot(target_countries, start_date, end_date, base_folder)`: Ejecuta ciclo secuencial de Playwright para descargar reportes oficiales de Sandvik.

---

### 🛣️ Routers de API (`app/routers/`)

#### **Logs (`logs.py`)**
- `GET /api/find_item/{item_code}/{ir}`: Localiza ítems e inyecta sugerencias de Slotting (IA + Tradicional).
- `POST /api/add_log`: Registra ingresos de mercancía y dispara el aprendizaje de la IA.
- `GET /api/get_logs`: Listado de ingresos activos o históricos por país.

#### **Vistas Avanzadas (`api_views.py`)**
- `GET /api/views/reconciliation`: Endpoint principal para la tabla de conciliación, soporta versiones y snapshots.
- `GET /api/view_logs`: Devuelve logs limpios y validados para el historial.

#### **Administración (`admin.py`)**
- `GET /api/admin/slotting-summary`: Estadísticas de ocupación, saturación de pasillos y densidad de ítems por zona.
- `POST /api/admin/slotting-config`: Actualiza el layout maestro del almacén y la estrategia de rotación SIC.

#### **Conteos (`counts.py`)**
- `GET /api/counts/dashboard_stats`: Calcula KPIs industriales: ERI (Exactitud de Registro), Ajustes Brutos/Netos y Paretos financieros.

---

### 💻 Frontend (React Pages)

- **Dashboard Inteligencia**: Visualización de KPIs de exactitud y zonas críticas de error.
- **Conciliación Inbound**: Herramienta de cruce de datos para detectar faltantes/sobrantes tras la recepción.
- **Config. Slotting**: Interfaz administrativa para gestionar el mapa de ubicaciones y niveles de stock.
- **Inbound**: Interfaz de operario para escaneo y registro de entradas con asistencia de IA.
- **Update**: Panel de control para carga de ficheros y ejecución del Robot PO.

## 🛠️ Comandos de Desarrollo

Para iniciar el entorno completo (Backend Granian + Frontend Vite):
```bash
./dev.sh
```

El backend corre en `http://127.0.0.1:8000` y el frontend en `http://localhost:5173`.

## 📌 Configuración Inicial
1. Crear entorno virtual: `python -m venv venv`
2. Instalar dependencias: `./instalar_dependencias.sh`
3. Aplicar migraciones: `venv/bin/alembic upgrade head`
4. Configurar variables en `.env` (SECRET_KEY, ADMIN_PASSWORD).
