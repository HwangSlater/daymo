"""trip cards

Revision ID: a2f9c6d08b14
Revises: b6d1f8c0a274
Create Date: 2026-09-16 13:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a2f9c6d08b14'
down_revision: str | None = 'b6d1f8c0a274'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 기념 카드를 여행마다 한 장이 아니라 여러 장 모아 둔다. 예전에는
    # `trips.card_settings` 한 칸이라 새로 만들면 앞서 만든 카드가 조용히 덮였다.
    op.create_table('trip_cards',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('trip_id', sa.UUID(), nullable=False),
    sa.Column('created_by_membership_id', sa.UUID(), nullable=True),
    sa.Column('settings', postgresql.JSONB(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_trip_cards_created_by_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by_membership_id'], ['memberships.id'], name=op.f('fk_trip_cards_created_by_membership_id_memberships'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], name=op.f('fk_trip_cards_trip_id_trips'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_trip_cards'))
    )
    op.create_index('ix_trip_cards_trip_sort', 'trip_cards', ['trip_id', 'sort_order'], unique=False)

    # 이미 꾸며 둔 카드는 그 여행의 첫 카드 한 줄로 옮긴다. 만든 사람은 알 수 없다.
    # 한 칸뿐이던 값이라 누가 마지막으로 꾸몄는지 남겨 두지 않았다. 비워 두면
    # owner 만 고칠 수 있게 되는데, 카드를 잃는 것보다는 낫다.
    op.execute(
        """
        INSERT INTO trip_cards (id, trip_id, settings, sort_order, version)
        SELECT gen_random_uuid(), id, card_settings, 1, 1
        FROM trips
        WHERE card_settings IS NOT NULL
        """
    )
    op.drop_column('trips', 'card_settings')


def downgrade() -> None:
    op.add_column('trips', sa.Column('card_settings', postgresql.JSONB(), nullable=True))
    # 되돌리면 칸이 하나뿐이라 여행마다 첫 카드만 남는다. 나머지는 버린다.
    op.execute(
        """
        UPDATE trips
        SET card_settings = 첫_카드.settings
        FROM (
            SELECT DISTINCT ON (trip_id) trip_id, settings
            FROM trip_cards
            ORDER BY trip_id, sort_order, created_at, id
        ) AS 첫_카드
        WHERE trips.id = 첫_카드.trip_id
        """
    )
    op.drop_index('ix_trip_cards_trip_sort', table_name='trip_cards')
    op.drop_table('trip_cards')
