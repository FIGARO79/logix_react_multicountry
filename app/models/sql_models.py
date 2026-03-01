from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Text, Numeric
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.db import Base
from typing import Optional
import datetime

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_approved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    permissions: Mapped[Optional[str]] = mapped_column(String(500), default="")
    country_code: Mapped[str] = mapped_column(String(5), nullable=False, default="MX")

    reset_tokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "is_approved": self.is_approved,
            "permissions": self.permissions,
            "country_code": self.country_code
        }

class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    expires_at: Mapped[str] = mapped_column(String(50), nullable=False)
    used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[str] = mapped_column(String(50), nullable=False)

    user = relationship("User", back_populates="reset_tokens")

# --- Modelos de Aplicación (Legacy Schema) ---

class Log(Base):
    __tablename__ = "logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    country_code: Mapped[str] = mapped_column(String(5), nullable=False, default="MX", index=True)
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)
    importReference: Mapped[str] = mapped_column(String(100), nullable=False, default='')
    waybill: Mapped[Optional[str]] = mapped_column(String(100))
    itemCode: Mapped[Optional[str]] = mapped_column(String(100)) # Index exists in raw SQL: idx_importReference_itemCode
    itemDescription: Mapped[Optional[str]] = mapped_column(String(255))
    binLocation: Mapped[Optional[str]] = mapped_column(String(100))
    relocatedBin: Mapped[Optional[str]] = mapped_column(String(100))
    qtyReceived: Mapped[Optional[int]] = mapped_column(Integer)
    qtyGrn: Mapped[Optional[int]] = mapped_column(Integer)
    difference: Mapped[Optional[int]] = mapped_column(Integer)
    # Nota: observaciones NO existe en tabla logs en producción (MySQL)
    # observaciones: Mapped[Optional[str]] = mapped_column(String(500))
    archived_at: Mapped[Optional[str]] = mapped_column(String(50), nullable=True) # Para SQLite/MySQL (String o DateTime según config)

class AppState(Base):
    __tablename__ = "app_state"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    country_code: Mapped[str] = mapped_column(String(5), primary_key=True, nullable=False, default="MX")
    value: Mapped[Optional[str]] = mapped_column(String(255))

class CountSession(Base):
    __tablename__ = "count_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    country_code: Mapped[str] = mapped_column(String(5), nullable=False, default="MX", index=True)
    user_username: Mapped[str] = mapped_column(String(100), nullable=False)
    start_time: Mapped[str] = mapped_column(String(50), nullable=False)
    end_time: Mapped[Optional[str]] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50), nullable=False, default='in_progress')
    inventory_stage: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    locations = relationship("SessionLocation", back_populates="session", cascade="all, delete-orphan")
    counts = relationship("StockCount", back_populates="session", cascade="all, delete-orphan")

class SessionLocation(Base):
    __tablename__ = "session_locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("count_sessions.id"), nullable=False)
    location_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default='open')
    closed_at: Mapped[Optional[str]] = mapped_column(String(50))
    # Columna detectada en DB pero no en init_db original
    count_stage: Mapped[Optional[int]] = mapped_column(Integer)

    session = relationship("CountSession", back_populates="locations")

class RecountList(Base):
    __tablename__ = "recount_list"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    country_code: Mapped[str] = mapped_column(String(5), nullable=False, default="MX", index=True)
    item_code: Mapped[str] = mapped_column(String(100), nullable=False)
    stage_to_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default='pending')
    # Index idx_recount_item_stage exists in raw SQL

class StockCount(Base):
    __tablename__ = "stock_counts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    country_code: Mapped[str] = mapped_column(String(5), nullable=False, default="MX", index=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("count_sessions.id"), nullable=False, index=True)
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)
    item_code: Mapped[str] = mapped_column(String(100), nullable=False)
    item_description: Mapped[Optional[str]] = mapped_column(String(255))
    counted_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    counted_location: Mapped[str] = mapped_column(String(100), nullable=False)
    bin_location_system: Mapped[Optional[str]] = mapped_column(String(100))
    username: Mapped[Optional[str]] = mapped_column(String(100))

    session = relationship("CountSession", back_populates="counts")

class CycleCount(Base):
    __tablename__ = "cycle_counts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    country_code: Mapped[str] = mapped_column(String(5), nullable=False, default="MX", index=True)
    item_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)
    abc_code: Mapped[Optional[str]] = mapped_column(String(10))
    count_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("stock_counts.id"))

class PickingAudit(Base):
    __tablename__ = "picking_audits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    country_code: Mapped[str] = mapped_column(String(5), nullable=False, default="MX", index=True)
    order_number: Mapped[str] = mapped_column(String(100), nullable=False)
    despatch_number: Mapped[str] = mapped_column(String(100), nullable=False)
    customer_name: Mapped[Optional[str]] = mapped_column(String(255))
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    # Columna detectada en DB
    packages: Mapped[Optional[int]] = mapped_column(Integer, default=0)

    items = relationship("PickingAuditItem", back_populates="audit", cascade="all, delete-orphan")
    package_items = relationship("PickingPackageItem", back_populates="audit", cascade="all, delete-orphan")
    shipment_links = relationship("ShipmentAudit", back_populates="audit")

class PickingAuditItem(Base):
    __tablename__ = "picking_audit_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    country_code: Mapped[str] = mapped_column(String(5), nullable=False, default="MX", index=True)
    audit_id: Mapped[int] = mapped_column(Integer, ForeignKey("picking_audits.id"), nullable=False, index=True)
    item_code: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))
    order_line: Mapped[Optional[str]] = mapped_column(String(50))
    qty_req: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_scan: Mapped[int] = mapped_column(Integer, nullable=False)
    difference: Mapped[int] = mapped_column(Integer, nullable=False)
    # Columna detectada en DB
    edited: Mapped[Optional[int]] = mapped_column(Integer, default=0)

    audit = relationship("PickingAudit", back_populates="items")

class PickingPackageItem(Base):
    __tablename__ = "picking_package_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    country_code: Mapped[str] = mapped_column(String(5), nullable=False, default="MX", index=True)
    audit_id: Mapped[int] = mapped_column(Integer, ForeignKey("picking_audits.id"), nullable=False, index=True)
    package_number: Mapped[int] = mapped_column(Integer, nullable=False)
    order_line: Mapped[Optional[str]] = mapped_column(String(50))
    item_code: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))
    qty_scan: Mapped[int] = mapped_column(Integer, nullable=False)

    audit = relationship("PickingAudit", back_populates="package_items")


class Shipment(Base):
    """Envío consolidado que agrupa múltiples auditorías de picking."""
    __tablename__ = "shipments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    country_code: Mapped[str] = mapped_column(String(5), nullable=False, default="MX", index=True)
    created_at: Mapped[str] = mapped_column(String(50), nullable=False,
        default=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    carrier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")

    audit_links = relationship("ShipmentAudit", back_populates="shipment", cascade="all, delete-orphan")


class ShipmentAudit(Base):
    """Tabla puente: vincula un envío con una auditoría de picking."""
    __tablename__ = "shipment_audits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    country_code: Mapped[str] = mapped_column(String(5), nullable=False, default="MX", index=True)
    shipment_id: Mapped[int] = mapped_column(Integer, ForeignKey("shipments.id"), nullable=False, index=True)
    audit_id: Mapped[int] = mapped_column(Integer, ForeignKey("picking_audits.id"), nullable=False, index=True)

    shipment = relationship("Shipment", back_populates="audit_links")
    audit = relationship("PickingAudit", back_populates="shipment_links")

class CycleCountRecording(Base):
    __tablename__ = "cycle_count_recordings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    country_code: Mapped[str] = mapped_column(String(5), nullable=False, default="MX", index=True)
    planned_date: Mapped[str] = mapped_column(String(50), nullable=False)
    executed_date: Mapped[str] = mapped_column(String(50), nullable=False)
    item_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    item_description: Mapped[Optional[str]] = mapped_column(String(255))
    bin_location: Mapped[Optional[str]] = mapped_column(String(100))
    system_qty: Mapped[int] = mapped_column(Integer, default=0)
    physical_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    difference: Mapped[int] = mapped_column(Integer, default=0)
    username: Mapped[str] = mapped_column(String(100))
    abc_code: Mapped[Optional[str]] = mapped_column(String(10))


class MasterItem(Base):
    __tablename__ = "master_items"

    item_code: Mapped[str] = mapped_column(String(100), primary_key=True, index=True)
    country_code: Mapped[str] = mapped_column(String(5), primary_key=True, nullable=False, default="MX")
    description: Mapped[Optional[str]] = mapped_column(String(255))
    abc_code: Mapped[Optional[str]] = mapped_column(String(10), index=True)
    physical_qty: Mapped[int] = mapped_column(Integer, default=0)
    bin_1: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    additional_bin: Mapped[Optional[str]] = mapped_column(String(100))
    weight_per_unit: Mapped[Optional[str]] = mapped_column(String(50))
    item_type: Mapped[Optional[str]] = mapped_column(String(50))
    item_class: Mapped[Optional[str]] = mapped_column(String(50))
    item_group_major: Mapped[Optional[str]] = mapped_column(String(50))
    stockroom: Mapped[Optional[str]] = mapped_column(String(50))
    cost_per_unit: Mapped[Optional[float]] = mapped_column(Numeric(10, 2))
    sic_code_company: Mapped[Optional[str]] = mapped_column(String(50))
    sic_code_stockroom: Mapped[Optional[str]] = mapped_column(String(50))
    updated_at: Mapped[str] = mapped_column(String(50), nullable=True)

class GRNMaster(Base):
    __tablename__ = "grn_master"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    country_code: Mapped[str] = mapped_column(String(5), nullable=False, default="MX", index=True)
    import_reference: Mapped[str] = mapped_column(String(100), index=True)
    waybill: Mapped[str] = mapped_column(String(100), index=True)
    grn_number: Mapped[str] = mapped_column(String(255), nullable=True)
    packs: Mapped[Optional[float]] = mapped_column(Numeric(10, 2))
    lines: Mapped[Optional[str]] = mapped_column(String(50))
    aaf_date: Mapped[Optional[str]] = mapped_column(String(50))
    grn1_date: Mapped[Optional[str]] = mapped_column(String(50))
    aaf_grn1: Mapped[Optional[float]] = mapped_column(Numeric(10, 5))
    grn3_date: Mapped[Optional[str]] = mapped_column(String(50))
    grn1_grn3: Mapped[Optional[float]] = mapped_column(Numeric(10, 5))
    ct: Mapped[Optional[str]] = mapped_column(String(50))
    created_at: Mapped[str] = mapped_column(String(50), default=lambda: datetime.datetime.now().isoformat())
