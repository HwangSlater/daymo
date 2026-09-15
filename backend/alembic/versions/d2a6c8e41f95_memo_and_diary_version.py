"""memo and diary version

Revision ID: d2a6c8e41f95
Revises: b8f4a2d61c39
Create Date: 2026-09-15 23:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'd2a6c8e41f95'
down_revision: str | None = 'b8f4a2d61c39'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('memos', sa.Column('version', sa.Integer(), server_default='1', nullable=False))
    op.add_column('diaries', sa.Column('version', sa.Integer(), server_default='1', nullable=False))


def downgrade() -> None:
    op.drop_column('diaries', 'version')
    op.drop_column('memos', 'version')
