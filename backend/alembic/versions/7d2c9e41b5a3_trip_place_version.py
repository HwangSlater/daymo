"""trip place version

Revision ID: 7d2c9e41b5a3
Revises: 38744d13f0c1
Create Date: 2026-09-15 12:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '7d2c9e41b5a3'
down_revision: str | None = '38744d13f0c1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing rows start at 1, the same as a freshly created place.
    op.add_column('trip_places', sa.Column('version', sa.Integer(), server_default='1', nullable=False))


def downgrade() -> None:
    op.drop_column('trip_places', 'version')
