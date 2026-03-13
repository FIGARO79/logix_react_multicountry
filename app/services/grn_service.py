import pandas as pd
import numpy as np
import datetime
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.sql_models import GRNMaster
from app.core.config import PROJECT_ROOT

GRN_EXCEL_PATH = os.path.join(PROJECT_ROOT, "GRN.xlsx")

async def seed_grn_from_excel(db: AsyncSession, country_code: str = "CL"):
    """
    Lee el archivo GRN.xlsx y precarga los datos en la tabla grn_master para un país específico.
    Evita duplicados basados en import_reference, waybill y country_code.
    """
    if not os.path.exists(GRN_EXCEL_PATH):
        print(f"Archivo Excel no encontrado en: {GRN_EXCEL_PATH}")
        return {"error": "Archivo GRN.xlsx no encontrado", "count": 0}

    try:
        # Leer Excel
        df = pd.read_excel(GRN_EXCEL_PATH)
        df = df.replace({np.nan: None})
        
        # Mapeo de columnas
        # ['IMPORT REFERENCE', 'WAYBILL', 'GRN1NUMBER', 'PACKS', 'LINES', 'AAF Date', 'GRN1 Date', 'AAF/GRN1', 'GRN3 Date', 'GRN1/GRN3', 'CT']
        
        records_added = 0
        records_skipped = 0

        for _, row in df.iterrows():
            imp_ref = str(row.get('IMPORT REFERENCE', '')).strip()
            waybill = str(row.get('WAYBILL', '')).strip()
            
            if not imp_ref or not waybill:
                continue

            # Verificar si ya existe para evitar duplicados (aislado por país)
            stmt = select(GRNMaster).where(
                GRNMaster.import_reference == imp_ref,
                GRNMaster.waybill == waybill,
                GRNMaster.country_code == country_code
            )
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                records_skipped += 1
                continue

            # Formatear fechas
            def fmt_date(d):
                if d is None: return None
                if isinstance(d, (datetime.datetime, pd.Timestamp)):
                    return d.isoformat()
                return str(d)

            new_grn = GRNMaster(
                import_reference=imp_ref,
                waybill=waybill,
                grn_number=str(row.get('GRN1NUMBER', '')) if row.get('GRN1NUMBER') else None,
                packs=row.get('PACKS'),
                lines=str(row.get('LINES', '')) if row.get('LINES') else None,
                aaf_date=fmt_date(row.get('AAF Date')),
                grn1_date=fmt_date(row.get('GRN1 Date')),
                aaf_grn1=row.get('AAF/GRN1'),
                grn3_date=fmt_date(row.get('GRN3 Date')),
                grn1_grn3=row.get('GRN1/GRN3'),
                ct=str(row.get('CT', '')) if row.get('CT') else None,
                country_code=country_code
            )
            db.add(new_grn)
            records_added += 1

        await db.commit()
        return {"message": "Sincronización completada", "added": records_added, "skipped": records_skipped}

    except Exception as e:
        await db.rollback()
        print(f"Error seeding GRN: {e}")
        return {"error": str(e), "count": 0}
