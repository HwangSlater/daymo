"""space invites

Revision ID: a93d5e27c1b8
Revises: f1c7a3e95b20
Create Date: 2026-09-16 03:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a93d5e27c1b8'
down_revision: str | None = 'f1c7a3e95b20'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('space_invites',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('space_id', sa.UUID(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('created_by_membership_id', sa.UUID(), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('max_uses', sa.Integer(), nullable=False),
    sa.Column('used_count', sa.Integer(), server_default='0', nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('used_count >= 0 AND used_count <= max_uses', name=op.f('ck_space_invites_uses_within_limit')),
    sa.ForeignKeyConstraint(['created_by_membership_id'], ['memberships.id'], name=op.f('fk_space_invites_created_by_membership_id_memberships'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['space_id'], ['spaces.id'], name=op.f('fk_space_invites_space_id_spaces'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_space_invites')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_space_invites_token_hash'))
    )
    op.create_index('ix_space_invites_space', 'space_invites', ['space_id', 'revoked_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_space_invites_space', table_name='space_invites')
    op.drop_table('space_invites')
