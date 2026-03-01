"""
Router para endpoints de envíos consolidados (Shipments).
Permite agrupar múltiples auditorías de picking en un solo envío para un país específico.
"""
import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.sql_models import (
    Shipment, ShipmentAudit,
    PickingAudit as PickingAuditModel,
    PickingPackageItem, PickingAuditItem
)
from app.models.schemas import ShipmentCreate
from app.utils.auth import permission_required
from app.core.db import get_db
from app.utils.country import get_current_country

router = APIRouter(prefix="/api/shipments", tags=["shipments"])


@router.post("/")
async def create_shipment(
    request: Request,
    data: ShipmentCreate,
    username: str = Depends(permission_required("picking")),
    db: AsyncSession = Depends(get_db)
):
    """Crear un envío consolidado a partir de una lista de audit_ids para el país actual."""
    country_code = get_current_country(request)
    if not data.audit_ids:
        raise HTTPException(status_code=400, detail="Debe seleccionar al menos una auditoría")

    # Verificar que todas las auditorías existen y pertenecen al país
    result = await db.execute(
        select(PickingAuditModel).where(
            PickingAuditModel.id.in_(data.audit_ids),
            PickingAuditModel.country_code == country_code
        )
    )
    audits = result.scalars().all()

    if len(audits) != len(data.audit_ids):
        raise HTTPException(status_code=404, detail="Una o más auditorías no fueron encontradas o no pertenecen al país")

    # Crear el envío
    shipment = Shipment(
        country_code=country_code,
        username=username,
        note=data.note,
        carrier=data.carrier,
        created_at=datetime.datetime.now(datetime.timezone.utc).isoformat()
    )
    db.add(shipment)
    await db.flush()  # Para obtener el ID

    # Vincular auditorías
    for audit_id in data.audit_ids:
        link = ShipmentAudit(
            country_code=country_code,
            shipment_id=shipment.id, 
            audit_id=audit_id
        )
        db.add(link)

    await db.commit()

    return {"id": shipment.id, "message": f"Envío #{shipment.id} creado con {len(data.audit_ids)} pedido(s)"}


@router.get("/")
async def list_shipments(
    request: Request,
    username: str = Depends(permission_required("picking")),
    db: AsyncSession = Depends(get_db)
):
    """Listar todos los envíos del país actual con resumen de pedidos."""
    country_code = get_current_country(request)
    result = await db.execute(
        select(Shipment)
        .options(selectinload(Shipment.audit_links).selectinload(ShipmentAudit.audit))
        .where(Shipment.country_code == country_code)
        .order_by(Shipment.id.desc())
    )
    shipments = result.scalars().unique().all()

    response = []
    for s in shipments:
        # Recopilar info de las auditorías vinculadas
        audits_info = []
        for link in s.audit_links:
            audit = link.audit
            audits_info.append({
                "audit_id": audit.id,
                "order_number": audit.order_number,
                "despatch_number": audit.despatch_number,
                "customer_name": audit.customer_name or "N/A",
                "packages": audit.packages or 0
            })

        response.append({
            "id": s.id,
            "created_at": s.created_at,
            "username": s.username,
            "note": s.note or "",
            "carrier": s.carrier or "",
            "status": s.status,
            "total_orders": len(audits_info),
            "audits": audits_info
        })

    return response


@router.get("/{shipment_id}")
async def get_shipment(
    request: Request,
    shipment_id: int,
    username: str = Depends(permission_required("picking")),
    db: AsyncSession = Depends(get_db)
):
    """Obtener detalle de un envío validando el país."""
    country_code = get_current_country(request)
    result = await db.execute(
        select(Shipment)
        .options(selectinload(Shipment.audit_links).selectinload(ShipmentAudit.audit))
        .where(Shipment.id == shipment_id, Shipment.country_code == country_code)
    )
    shipment = result.scalars().unique().first()

    if not shipment:
        raise HTTPException(status_code=404, detail="Envío no encontrado")

    audits_info = []
    for link in shipment.audit_links:
        audit = link.audit
        audits_info.append({
            "audit_id": audit.id,
            "order_number": audit.order_number,
            "despatch_number": audit.despatch_number,
            "customer_name": audit.customer_name or "N/A",
            "packages": audit.packages or 0
        })

    return {
        "id": shipment.id,
        "created_at": shipment.created_at,
        "username": shipment.username,
        "note": shipment.note or "",
        "carrier": shipment.carrier or "",
        "status": shipment.status,
        "audits": audits_info
    }


@router.get("/{shipment_id}/packing_list")
async def get_consolidated_packing_list(
    request: Request,
    shipment_id: int,
    username: str = Depends(permission_required("picking")),
    db: AsyncSession = Depends(get_db)
):
    """Obtener datos del packing list consolidado para el país."""
    country_code = get_current_country(request)
    # Cargar envío con auditorías
    result = await db.execute(
        select(Shipment)
        .options(selectinload(Shipment.audit_links).selectinload(ShipmentAudit.audit))
        .where(Shipment.id == shipment_id, Shipment.country_code == country_code)
    )
    shipment = result.scalars().unique().first()

    if not shipment:
        raise HTTPException(status_code=404, detail="Envío no encontrado")

    if shipment.status != "active":
        raise HTTPException(status_code=400, detail="Envío cancelado")

    orders = []
    for link in shipment.audit_links:
        audit = link.audit

        # Obtener items de auditoría
        audit_items_result = await db.execute(
            select(PickingAuditItem).where(
                PickingAuditItem.audit_id == audit.id,
                PickingAuditItem.country_code == country_code
            )
        )
        audit_items_map = {item.item_code: item.order_line for item in audit_items_result.scalars().all()}

        # Obtener bultos
        packages_result = await db.execute(
            select(PickingPackageItem).where(
                PickingPackageItem.audit_id == audit.id,
                PickingPackageItem.country_code == country_code
            )
        )
        packages = packages_result.scalars().all()

        package_groups = {}
        for p in packages:
            p_num = str(p.package_number)
            if p_num not in package_groups:
                package_groups[p_num] = []
            
            package_groups[p_num].append({
                "item_code": p.item_code,
                "description": p.description,
                "quantity": p.qty_scan,
                "order_line": p.order_line or audit_items_map.get(p.item_code, "")
            })

        orders.append({
            "order_number": audit.order_number,
            "despatch_number": audit.despatch_number,
            "customer_name": audit.customer_name or "N/A",
            "total_packages": audit.packages or 0,
            "packages": package_groups
        })

    return {
        "shipment_id": shipment.id,
        "created_at": shipment.created_at,
        "carrier": shipment.carrier or "N/A",
        "note": shipment.note or "",
        "orders": orders
    }
