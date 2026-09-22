"""trip card image

Revision ID: d3a8f1c6b2e4
Revises: c4f8a2d6e1b9
Create Date: 2026-09-22 10:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'd3a8f1c6b2e4'
down_revision: str | None = 'c4f8a2d6e1b9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 카드를 완료할 때 앱이 원본 화질로 그려 올리는 이미지. 지금까지 만든 카드에는
    # 이미지가 없으므로 채울 것이 없다. 비어 있으면 앱이 예전처럼 그때그때 그린다.
    op.add_column('trip_cards', sa.Column('image_path', sa.String(length=500), nullable=True))
    op.add_column('trip_cards', sa.Column('image_version', sa.Integer(), nullable=True))
    op.add_column('trip_cards', sa.Column('image_bytes', sa.BigInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column('trip_cards', 'image_bytes')
    op.drop_column('trip_cards', 'image_version')
    op.drop_column('trip_cards', 'image_path')
