"""
Modelos Pydantic para la aplicación.
"""
from typing import Optional, List
from pydantic import BaseModel


class LogEntry(BaseModel):
    """Modelo para registros de entrada de mercancía."""
    importReference: str
    waybill: str
    itemCode: str
    quantity: int
    relocatedBin: Optional[str] = ''
    observaciones: Optional[str] = ''


class Count(BaseModel):
    """Modelo para conteos básicos."""
    item_code: str
    quantity: int
    location: Optional[str] = 'N/A'


class StockCount(BaseModel):
    """Modelo para conteos de inventario con sesión."""
    session_id: int
    item_code: str
    counted_qty: int
    counted_location: str
    description: Optional[str] = ''
    bin_location_system: Optional[str] = ''


class CloseLocationRequest(BaseModel):
    """Modelo para cerrar una ubicación en conteo."""
    session_id: int
    location_code: str


class PickingAuditItem(BaseModel):
    """Modelo para items en auditoría de picking."""
    code: str
    description: str
    order_line: Optional[str] = ''
    qty_req: int
    qty_scan: int


class PickingAudit(BaseModel):
    """Modelo para auditoría completa de picking."""
    order_number: str
    despatch_number: str
    customer_name: str
    customer_code: Optional[str] = None
    status: str
    items: List[PickingAuditItem]
    packages: Optional[int] = 0  # Cantidad de bultos/paquetes
    packages_assignment: Optional[dict] = {}  # Asignación de artículos a bultos


class CountExecutionItem(BaseModel):
    item_code: str
    description: Optional[str] = None
    bin_location: Optional[str] = None
    system_qty: int
    physical_qty: int
    abc_code: Optional[str] = None

class CountExecutionRequest(BaseModel):
    date: str
    items: List[CountExecutionItem]

class GRNMasterBase(BaseModel):
    import_reference: str
    waybill: str
    grn_number: Optional[str] = None
    packs: Optional[float] = None
    lines: Optional[str] = None
    aaf_date: Optional[str] = None
    grn1_date: Optional[str] = None
    aaf_grn1: Optional[float] = None
    grn3_date: Optional[str] = None
    grn1_grn3: Optional[float] = None
    ct: Optional[str] = None

class GRNMasterCreate(GRNMasterBase):
    pass

class GRNMasterUpdate(BaseModel):
    grn_number: Optional[str] = None
    packs: Optional[float] = None
    lines: Optional[str] = None
    aaf_date: Optional[str] = None
    grn1_date: Optional[str] = None
    aaf_grn1: Optional[float] = None
    grn3_date: Optional[str] = None
    grn1_grn3: Optional[float] = None
    ct: Optional[str] = None

class GRNMasterResponse(GRNMasterBase):
    id: int
    created_at: str

    class Config:
        from_attributes = True


class ShipmentCreate(BaseModel):
    """Modelo para crear un envío consolidado."""
    audit_ids: List[int]
    note: Optional[str] = None
    carrier: Optional[str] = None
