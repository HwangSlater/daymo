"""trip keepsake card

Revision ID: b6d1f8c0a274
Revises: c9f2a4d38e61
Create Date: 2026-09-16 11:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'b6d1f8c0a274'
down_revision: str | None = 'c9f2a4d38e61'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The keepsake card was a device-only setting, so there is nothing to
    # backfill: a NULL blob means "the app's defaults".
    op.add_column('trips', sa.Column('card_settings', postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('trips', 'card_settings')
