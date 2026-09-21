"""calendar notes

Revision ID: b2e7c4d91f36
Revises: a3f5c81d64b7
Create Date: 2026-09-21 15:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'b2e7c4d91f36'
down_revision: str | None = 'a3f5c81d64b7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 공간 캘린더의 일정과 메모. 여행이 아니라 공간에 붙어서, 공간을 지우면
    # 함께 지워지고 여행을 지워도 남는다.
    op.create_table('calendar_notes',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('space_id', sa.UUID(), nullable=False),
    sa.Column('kind', sa.Enum('schedule', 'memo', name='calendarnotekind', native_enum=False, create_constraint=True, length=20), nullable=False),
    sa.Column('membership_id', sa.UUID(), nullable=True),
    sa.Column('title', sa.String(length=60), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('time', sa.Time(), nullable=True),
    sa.Column('created_by_membership_id', sa.UUID(), nullable=True),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('end_date >= start_date', name=op.f('ck_calendar_notes_dates_in_order')),
    sa.CheckConstraint("kind <> 'memo' OR membership_id IS NULL", name=op.f('ck_calendar_notes_memo_has_no_member')),
    sa.CheckConstraint('char_length(title) BETWEEN 1 AND 60', name=op.f('ck_calendar_notes_title_length')),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_calendar_notes_created_by_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by_membership_id'], ['memberships.id'], name=op.f('fk_calendar_notes_created_by_membership_id_memberships'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['membership_id'], ['memberships.id'], name=op.f('fk_calendar_notes_membership_id_memberships'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['space_id'], ['spaces.id'], name=op.f('fk_calendar_notes_space_id_spaces'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_calendar_notes'))
    )
    op.create_index('ix_calendar_notes_space_start', 'calendar_notes', ['space_id', 'start_date'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_calendar_notes_space_start', table_name='calendar_notes')
    op.drop_table('calendar_notes')
