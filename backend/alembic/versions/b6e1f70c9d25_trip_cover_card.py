"""trip cover card

Revision ID: b6e1f70c9d25
Revises: d7c5b31e08af
Create Date: 2026-09-16 10:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'b6e1f70c9d25'
down_revision: str | None = 'd7c5b31e08af'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 홈 화면에 통째로 깐 기념 카드. 사진 한 장(`cover_photo_id`)과 둘 중 하나만 채워진다.
    # 카드가 지워져도 여행은 남아야 해서 SET NULL 이다.
    op.add_column('trips', sa.Column('cover_card_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_trips_cover_card_id',
        'trips',
        'trip_cards',
        ['cover_card_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_trips_cover_card_id', 'trips', type_='foreignkey')
    op.drop_column('trips', 'cover_card_id')
