"""expense excluded and transport_id

Revision ID: d8e2f4a61b37
Revises: a7d3e9c15b48
Create Date: 2026-09-18 10:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'd8e2f4a61b37'
# 같은 날 다른 갈래에서 만들어져 둘 다 c1a7b4e0d962 를 가리켰다. 머리가 둘이 되어
# `alembic upgrade head` 가 「Multiple head revisions」로 멈췄다. 먼저 배포된
# a7d3e9c15b48 뒤로 붙여 한 줄로 만든다.
down_revision: str | None = 'a7d3e9c15b48'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 정산에서 뺀 지출. 있던 줄은 전부 정산에 들어 있던 것이니 false 로 채운다.
    op.add_column('expenses', sa.Column('excluded', sa.Boolean(), server_default=sa.false(), nullable=False))
    # 교통편에서 만든 지출의 출처. 외래키 없음(models/expense.py 에 까닭을 적어 뒀다).
    op.add_column('expenses', sa.Column('transport_id', sa.UUID(), nullable=True))


def downgrade() -> None:
    op.drop_column('expenses', 'transport_id')
    op.drop_column('expenses', 'excluded')
