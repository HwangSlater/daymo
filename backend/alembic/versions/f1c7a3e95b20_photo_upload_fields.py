"""photo upload fields: day, mime, stored bytes, receipt, soft delete, version

Revision ID: f1c7a3e95b20
Revises: d2a6c8e41f95
Create Date: 2026-09-16 01:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'f1c7a3e95b20'
down_revision: str | None = 'd2a6c8e41f95'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('photos', sa.Column('taken_on', sa.Date(), nullable=True))
    op.add_column('photos', sa.Column('original_mime', sa.String(length=30), nullable=True))
    op.add_column('photos', sa.Column('stored_bytes', sa.BigInteger(), nullable=True))
    op.add_column('photos', sa.Column('is_receipt', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('photos', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('photos', sa.Column('deleted_by', sa.UUID(), nullable=True))
    op.add_column('photos', sa.Column('version', sa.Integer(), server_default='1', nullable=False))
    op.create_foreign_key(op.f('fk_photos_deleted_by_memberships'), 'photos', 'memberships', ['deleted_by'], ['id'], ondelete='SET NULL')
    op.create_check_constraint(op.f('ck_photos_deleted_by_needs_time'), 'photos', 'deleted_at IS NOT NULL OR deleted_by IS NULL')


def downgrade() -> None:
    op.drop_constraint(op.f('ck_photos_deleted_by_needs_time'), 'photos', type_='check')
    op.drop_constraint(op.f('fk_photos_deleted_by_memberships'), 'photos', type_='foreignkey')
    op.drop_column('photos', 'version')
    op.drop_column('photos', 'deleted_by')
    op.drop_column('photos', 'deleted_at')
    op.drop_column('photos', 'is_receipt')
    op.drop_column('photos', 'stored_bytes')
    op.drop_column('photos', 'original_mime')
    op.drop_column('photos', 'taken_on')
