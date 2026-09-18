"""transport method: mugunghwa, express bus and intercity bus

Revision ID: a7d3e9c15b48
Revises: c1a7b4e0d962
Create Date: 2026-09-18 10:00:00.000000
"""
from collections.abc import Sequence

from alembic import op


revision: str = 'a7d3e9c15b48'
down_revision: str | None = 'c1a7b4e0d962'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# enum 뒤의 CHECK 제약은 alembic 이 바뀐 것을 못 알아채서 값을 여기에 손으로 적는다
# (38744d13f0c1·d4b7e19a2c83 과 같은 방식).
_METHOD_OLD = ('ktx', 'srt', 'bus', 'flight', 'other')
_METHOD_NEW = ('ktx', 'srt', 'mugunghwa', 'express_bus', 'intercity_bus', 'bus', 'flight', 'other')


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    op.drop_constraint(op.f('ck_transports_transportmethod'), 'transports', type_='check')
    op.create_check_constraint(op.f('ck_transports_transportmethod'), 'transports', _in('method', _METHOD_NEW))


def downgrade() -> None:
    # 새 값으로 저장된 교통편은 지우지 않고 `other` 로 돌린다. 옛 제약이 모르는 값이
    # 남아 있으면 제약을 다시 못 만들기 때문이다. 어떤 수단이었는지는 이 줄만으로는
    # 되살릴 수 없으니, 정말 되돌려야 하면 마이그레이션 전에 떠 둔 백업을 복원한다.
    op.execute("UPDATE transports SET method = 'other' WHERE method IN ('mugunghwa', 'express_bus', 'intercity_bus')")
    op.drop_constraint(op.f('ck_transports_transportmethod'), 'transports', type_='check')
    op.create_check_constraint(op.f('ck_transports_transportmethod'), 'transports', _in('method', _METHOD_OLD))
