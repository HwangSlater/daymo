"""expense version and payment deleted_by

Revision ID: e3b7d1c94a58
Revises: c5e8b2a61f07
Create Date: 2026-09-15 18:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'e3b7d1c94a58'
down_revision: str | None = 'c5e8b2a61f07'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('expenses', sa.Column('version', sa.Integer(), server_default='1', nullable=False))
    op.add_column('payments', sa.Column('deleted_by', sa.UUID(), nullable=True))
    op.create_foreign_key(op.f('fk_payments_deleted_by_users'), 'payments', 'users', ['deleted_by'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(op.f('fk_payments_deleted_by_users'), 'payments', type_='foreignkey')
    op.drop_column('payments', 'deleted_by')
    op.drop_column('expenses', 'version')
