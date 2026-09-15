"""reports and user blocks

Revision ID: e9a4c27d51b3
Revises: c3e81f5a2d64
Create Date: 2026-09-16 10:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'e9a4c27d51b3'
down_revision: str | None = 'c3e81f5a2d64'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('reports',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('reporter_user_id', sa.UUID(), nullable=True),
    sa.Column('space_id', sa.UUID(), nullable=True),
    sa.Column('target_type', sa.Enum('memo', 'diary', 'photo', 'member', 'trip', 'other', name='reporttargettype', native_enum=False, create_constraint=True, length=20), nullable=False),
    sa.Column('target_id', sa.UUID(), nullable=True),
    sa.Column('reason', sa.Enum('spam', 'harassment', 'sexual', 'violence', 'privacy', 'copyright', 'other', name='reportreason', native_enum=False, create_constraint=True, length=20), nullable=False),
    sa.Column('detail', sa.Text(), nullable=True),
    sa.Column('status', sa.Enum('open', 'resolved', name='reportstatus', native_enum=False, create_constraint=True, length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint('detail IS NULL OR char_length(detail) <= 1000', name=op.f('ck_reports_detail_length')),
    sa.ForeignKeyConstraint(['reporter_user_id'], ['users.id'], name=op.f('fk_reports_reporter_user_id_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['space_id'], ['spaces.id'], name=op.f('fk_reports_space_id_spaces'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_reports'))
    )
    op.create_index('ix_reports_reporter_time', 'reports', ['reporter_user_id', 'created_at'], unique=False)
    op.create_index('ix_reports_status_time', 'reports', ['status', 'created_at'], unique=False)
    op.create_table('user_blocks',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('blocker_user_id', sa.UUID(), nullable=False),
    sa.Column('blocked_user_id', sa.UUID(), nullable=False),
    sa.Column('blocked_membership_id', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('blocker_user_id <> blocked_user_id', name=op.f('ck_user_blocks_not_self')),
    sa.ForeignKeyConstraint(['blocked_membership_id'], ['memberships.id'], name=op.f('fk_user_blocks_blocked_membership_id_memberships'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['blocked_user_id'], ['users.id'], name=op.f('fk_user_blocks_blocked_user_id_users'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['blocker_user_id'], ['users.id'], name=op.f('fk_user_blocks_blocker_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_user_blocks'))
    )
    op.create_index('ix_user_blocks_blocked', 'user_blocks', ['blocked_user_id'], unique=False)
    op.create_index('uq_user_blocks_pair', 'user_blocks', ['blocker_user_id', 'blocked_user_id'], unique=True)


def downgrade() -> None:
    op.drop_index('uq_user_blocks_pair', table_name='user_blocks')
    op.drop_index('ix_user_blocks_blocked', table_name='user_blocks')
    op.drop_table('user_blocks')
    op.drop_index('ix_reports_status_time', table_name='reports')
    op.drop_index('ix_reports_reporter_time', table_name='reports')
    op.drop_table('reports')
