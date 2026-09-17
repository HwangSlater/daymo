"""cascade and purge indexes

Revision ID: c1a7b4e0d962
Revises: b6e1f70c9d25
Create Date: 2026-09-17 12:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'c1a7b4e0d962'
down_revision: str | None = 'b6e1f70c9d25'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# 이름은 app/models/base.py 의 규칙(`ix_<표>_<열>`)을 그대로 따른다.
# (이름, 표, 열, 부분 조건)
_인덱스 = [
    # 일정 탭을 열 때마다 여행의 일정을 통째로 읽는데 `trip_id` 로 들어갈 길이 없다.
    # 있는 `ix_schedule_items_day` 는 `trip_day_id` 가 앞이라 이 질의를 받지 못한다.
    # 여행이나 공간을 파기할 때 CASCADE 가 따라 지울 줄을 찾는 것도 같은 길을 쓴다.
    ('ix_schedule_items_trip_id', 'schedule_items', ['trip_id'], None),
    # 아무 여행에도 안 남은 손수 적은 장소를 매일 지운다(`purge_orphan_manual_places`).
    # `uq_trip_places_place` 는 `trip_id` 가 앞이라 장소 쪽에서 되짚을 수 없다.
    ('ix_trip_places_place_id', 'trip_places', ['place_id'], None),
    # `memberships` 를 지울 때 RESTRICT 가 "이 멤버가 낸 지출이 있는가" 를 본다.
    ('ix_expenses_payer_membership_id', 'expenses', ['payer_membership_id'], None),
    # 레시피 재료를 지울 때 거기서 가져온 준비물을 찾는 길.
    ('ix_checklist_items_source_ingredient_id', 'checklist_items', ['source_ingredient_id'], None),
    # 지운 지 7일 지난 것을 매일 찾는 파기 작업용. 지워진 줄은 전체의 일부라
    # 부분 인덱스로 두면 살아 있는 줄만큼은 인덱스가 커지지 않는다.
    # `ix_photos_trip_status`·`ix_memos_trip_alive` 는 `trip_id` 가 앞이라 못 쓴다.
    ('ix_photos_deleted_at', 'photos', ['deleted_at'], 'deleted_at IS NOT NULL'),
    ('ix_memos_deleted_at', 'memos', ['deleted_at'], 'deleted_at IS NOT NULL'),
]


def upgrade() -> None:
    # 운영 DB 에는 이미 사용자 데이터가 있다. 그냥 CREATE INDEX 하면 그동안 그 표에
    # 아무도 못 쓰므로 CONCURRENTLY 로 만든다. CONCURRENTLY 는 transaction 안에서
    # 돌 수 없어서 이 블록 동안만 alembic 의 transaction 을 끊는다.
    with op.get_context().autocommit_block():
        for 이름, 표, 열, 조건 in _인덱스:
            op.create_index(
                이름,
                표,
                열,
                unique=False,
                postgresql_concurrently=True,
                postgresql_where=sa.text(조건) if 조건 else None,
            )


def downgrade() -> None:
    # 지울 때도 마찬가지다. DROP INDEX 는 표를 잠근다.
    with op.get_context().autocommit_block():
        for 이름, 표, _열, _조건 in reversed(_인덱스):
            op.drop_index(이름, table_name=표, postgresql_concurrently=True)
