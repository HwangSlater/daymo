"""feedback

Revision ID: c4f8a2d6e1b9
Revises: b2e7c4d91f36
Create Date: 2026-09-21 19:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'c4f8a2d6e1b9'
down_revision: str | None = 'b2e7c4d91f36'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 앱 안에서 보내는 의견. 운영자가 읽기만 한다.
    op.create_table('feedback',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('platform', sa.String(length=16), nullable=False),
    sa.Column('app_version', sa.String(length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('char_length(body) BETWEEN 1 AND 2000', name=op.f('ck_feedback_body_length')),
    sa.CheckConstraint("kind IN ('problem', 'idea', 'other')", name=op.f('ck_feedback_kind_known')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_feedback_user_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_feedback'))
    )
    op.create_index('ix_feedback_user_time', 'feedback', ['user_id', 'created_at'], unique=False)
    op.create_index('ix_feedback_time', 'feedback', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_feedback_time', table_name='feedback')
    op.drop_index('ix_feedback_user_time', table_name='feedback')
    op.drop_table('feedback')
