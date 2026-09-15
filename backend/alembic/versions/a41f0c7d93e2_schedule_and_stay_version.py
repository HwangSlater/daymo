"""schedule item and stay version

Revision ID: a41f0c7d93e2
Revises: 7d2c9e41b5a3
Create Date: 2026-09-15 14:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a41f0c7d93e2'
down_revision: str | None = '7d2c9e41b5a3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('schedule_items', sa.Column('version', sa.Integer(), server_default='1', nullable=False))
    op.add_column('stays', sa.Column('version', sa.Integer(), server_default='1', nullable=False))


def downgrade() -> None:
    op.drop_column('stays', 'version')
    op.drop_column('schedule_items', 'version')
