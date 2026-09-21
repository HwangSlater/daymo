"""trip cover focus

Revision ID: a3f5c81d64b7
Revises: e1f6b93d2a70
Create Date: 2026-09-21 10:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a3f5c81d64b7'
down_revision: str | None = 'e1f6b93d2a70'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 대표 사진에서 홈 카드 틀에 보여 줄 부분. 있던 줄은 지금까지 가운데를
    # 잘라 보여 주고 있었으니 그 모습 그대로인 0.5/0.5/1.0 으로 채운다.
    op.add_column(
        'trips',
        sa.Column('cover_focus_x', sa.Float(), server_default=sa.text('0.5'), nullable=False),
    )
    op.add_column(
        'trips',
        sa.Column('cover_focus_y', sa.Float(), server_default=sa.text('0.5'), nullable=False),
    )
    op.add_column(
        'trips',
        sa.Column('cover_zoom', sa.Float(), server_default=sa.text('1.0'), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('trips', 'cover_zoom')
    op.drop_column('trips', 'cover_focus_y')
    op.drop_column('trips', 'cover_focus_x')
