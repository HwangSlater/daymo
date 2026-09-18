"""transport stops

Revision ID: e1f6b93d2a70
Revises: d8e2f4a61b37
Create Date: 2026-09-18 14:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e1f6b93d2a70'
down_revision: str | None = 'd8e2f4a61b37'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 갈아타는 곳. 진주 → (동대구에서 갈아탐) → 대전 처럼 중간에 서는 곳을
    # 차례대로 담는다. 있던 줄은 갈아타는 곳이 없던 것이니 빈 목록으로 채운다.
    op.add_column(
        'transports',
        sa.Column(
            'stops',
            postgresql.JSONB(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('transports', 'stops')
