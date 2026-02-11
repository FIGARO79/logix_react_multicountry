"""Add country_code to relevant tables

Revision ID: 4c90ea30e477
Revises: 5bb7d61e7826
Create Date: 2026-02-11 12:00:50.780223

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4c90ea30e477'
down_revision: Union[str, Sequence[str], None] = '5bb7d61e7826'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # List of tables that just need a new column and index
    simple_tables = [
        'users', 'logs', 'count_sessions', 'recount_list', 
        'stock_counts', 'cycle_counts', 'picking_audits', 
        'cycle_count_recordings', 'grn_master',
        'picking_audit_items', 'picking_package_items'
    ]
    
    for table in simple_tables:
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.add_column(sa.Column('country_code', sa.String(length=5), nullable=False, server_default='MX'))
            if table != 'users': 
                batch_op.create_index(batch_op.f(f'ix_{table}_country_code'), ['country_code'], unique=False)

    # master_items (Composite Primary Key)
    with op.batch_alter_table('master_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('country_code', sa.String(length=5), nullable=False, server_default='MX'))
    
    # app_state (Composite Primary Key)
    with op.batch_alter_table('app_state', schema=None) as batch_op:
        batch_op.add_column(sa.Column('country_code', sa.String(length=5), nullable=False, server_default='MX'))

def downgrade() -> None:
    """Downgrade schema."""
    simple_tables = [
        'users', 'logs', 'count_sessions', 'recount_list', 
        'stock_counts', 'cycle_counts', 'picking_audits', 
        'cycle_count_recordings', 'grn_master', 
        'master_items', 'app_state',
        'picking_audit_items', 'picking_package_items'
    ]
    
    for table in simple_tables:
        with op.batch_alter_table(table, schema=None) as batch_op:
            if table not in ['users', 'master_items', 'app_state']:
                batch_op.drop_index(batch_op.f(f'ix_{table}_country_code'))
            batch_op.drop_column('country_code')
