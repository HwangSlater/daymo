from app.models.base import Base
from app.models.enums import MembershipRole, RelationshipType, UserStatus
from app.models.space import MAX_MEMBERS_PER_SPACE, Membership, RelationshipProfile, Space
from app.models.user import User

# alembic 이 autogenerate 할 때 여기 없는 모델은 보지 못한다.
# 새 모델을 만들면 반드시 이 목록에 추가한다.
__all__ = [
    "MAX_MEMBERS_PER_SPACE",
    "Base",
    "Membership",
    "MembershipRole",
    "RelationshipProfile",
    "RelationshipType",
    "Space",
    "User",
    "UserStatus",
]
