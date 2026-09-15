"""user terms consent version and time

Revision ID: c3e81f5a2d64
Revises: fa90b80b73f2
Create Date: 2026-09-15 17:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'c3e81f5a2d64'
down_revision: str | None = 'fa90b80b73f2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('terms_version', sa.String(length=20), nullable=True))
    op.add_column('users', sa.Column('terms_agreed_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'terms_agreed_at')
    op.drop_column('users', 'terms_version')
