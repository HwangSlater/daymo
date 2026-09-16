"""photo original expiry

Revision ID: d7c5b31e08af
Revises: a2f9c6d08b14
Create Date: 2026-09-16 21:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'd7c5b31e08af'
down_revision: str | None = 'a2f9c6d08b14'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 원본은 30일만 둔다. 기한이 지나면 정리 작업이 원본 파일만 지우고
    # 표시본·썸네일은 남긴다(app/services/photos.py `purge_originals`).
    op.add_column('photos', sa.Column('original_expires_at', sa.DateTime(timezone=True), nullable=True))
    # 이미 올라와 있는 사진은 올린 날이 아니라 **오늘**부터 30일을 준다. 올린 날로
    # 세면 한 달 넘은 사진의 원본이 이 배포 직후 사라진다. 규칙이 생기기 전에 올린
    # 사람은 원본을 받아 둘 기회가 없었으므로, 모두에게 30일을 새로 준다.
    op.execute(
        "UPDATE photos SET original_expires_at = GREATEST(created_at, now()) + INTERVAL '30 days' "
        "WHERE original_path IS NOT NULL"
    )
    op.create_index(
        'ix_photos_original_expiry', 'photos', ['original_expires_at'], unique=False,
        postgresql_where=sa.text('original_path IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('ix_photos_original_expiry', table_name='photos')
    op.drop_column('photos', 'original_expires_at')
