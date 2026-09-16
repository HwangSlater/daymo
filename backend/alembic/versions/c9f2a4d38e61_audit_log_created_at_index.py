"""audit log created_at index

Revision ID: c9f2a4d38e61
Revises: d4b7e19a2c83
Create Date: 2026-09-16 10:00:00.000000
"""
from collections.abc import Sequence

from alembic import op


revision: str = 'c9f2a4d38e61'
down_revision: str | None = 'd4b7e19a2c83'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 보유기간 파기가 오래된 줄부터 찾는 길. 있는 (space_id, created_at) 으로는
    # 공간을 가리지 않는 이 질의를 받을 수 없다.
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_audit_logs_created_at', table_name='audit_logs')
