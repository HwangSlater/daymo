"""checklist item and recipe version, longer quantity

Revision ID: b8f4a2d61c39
Revises: e3b7d1c94a58
Create Date: 2026-09-15 21:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'b8f4a2d61c39'
down_revision: str | None = 'e3b7d1c94a58'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('checklist_items', sa.Column('version', sa.Integer(), server_default='1', nullable=False))
    op.add_column('recipes', sa.Column('version', sa.Integer(), server_default='1', nullable=False))
    op.alter_column('checklist_items', 'quantity', type_=sa.String(length=60), existing_type=sa.String(length=20), existing_nullable=True)
    op.alter_column('ingredients', 'quantity', type_=sa.String(length=60), existing_type=sa.String(length=20), existing_nullable=True)


def downgrade() -> None:
    op.alter_column('ingredients', 'quantity', type_=sa.String(length=20), existing_type=sa.String(length=60), existing_nullable=True, postgresql_using='left(quantity, 20)')
    op.alter_column('checklist_items', 'quantity', type_=sa.String(length=20), existing_type=sa.String(length=60), existing_nullable=True, postgresql_using='left(quantity, 20)')
    op.drop_column('recipes', 'version')
    op.drop_column('checklist_items', 'version')
