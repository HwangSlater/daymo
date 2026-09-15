"""transport and reservation dates, party label and versions

Revision ID: c5e8b2a61f07
Revises: a41f0c7d93e2
Create Date: 2026-09-15 16:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'c5e8b2a61f07'
down_revision: str | None = 'a41f0c7d93e2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('transports', sa.Column('travel_on', sa.Date(), nullable=True))
    op.add_column('transports', sa.Column('version', sa.Integer(), server_default='1', nullable=False))
    op.add_column('reservations', sa.Column('party_label', sa.String(length=20), nullable=True))
    op.add_column('reservations', sa.Column('reserved_on', sa.Date(), nullable=True))
    op.add_column('reservations', sa.Column('version', sa.Integer(), server_default='1', nullable=False))


def downgrade() -> None:
    op.drop_column('reservations', 'version')
    op.drop_column('reservations', 'reserved_on')
    op.drop_column('reservations', 'party_label')
    op.drop_column('transports', 'version')
    op.drop_column('transports', 'travel_on')
