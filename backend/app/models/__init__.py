from app.models.base import Base
from app.models.enums import (
    BookingStatus,
    ChecklistKind,
    ExpenseCategory,
    LinkProvider,
    LinkTargetType,
    MembershipRole,
    PlaceProvider,
    Procurement,
    RelationshipType,
    ReservationStatus,
    ReservationTargetType,
    ScheduleItemType,
    SplitMode,
    TagScope,
    TransportDirection,
    TransportMethod,
    TripPlaceStatus,
    TripStatus,
    UserStatus,
)
from app.models.cooking import Checklist, ChecklistItem, Ingredient, Recipe
from app.models.expense import Expense, ExpenseShare, Payment
from app.models.place import Place, TripPlace
from app.models.schedule import Reservation, ScheduleItem, Stay, Transport
from app.models.space import MAX_MEMBERS_PER_SPACE, Membership, RelationshipProfile, Space
from app.models.tag import ExternalLink, Tag, Tagging
from app.models.trip import Trip, TripDay, TripParticipant
from app.models.user import User

# alembic 이 autogenerate 할 때 여기 없는 모델은 보지 못한다.
# 새 모델을 만들면 반드시 이 목록에 추가한다.
__all__ = [
    "MAX_MEMBERS_PER_SPACE",
    "Base",
    "BookingStatus",
    "Checklist",
    "ChecklistItem",
    "ChecklistKind",
    "Expense",
    "ExpenseCategory",
    "ExpenseShare",
    "ExternalLink",
    "LinkProvider",
    "Ingredient",
    "LinkTargetType",
    "Membership",
    "MembershipRole",
    "Payment",
    "Place",
    "PlaceProvider",
    "Procurement",
    "RelationshipProfile",
    "Recipe",
    "RelationshipType",
    "Reservation",
    "ReservationStatus",
    "ReservationTargetType",
    "ScheduleItem",
    "ScheduleItemType",
    "Space",
    "SplitMode",
    "Stay",
    "Tag",
    "TagScope",
    "Tagging",
    "Transport",
    "TransportDirection",
    "TransportMethod",
    "Trip",
    "TripDay",
    "TripParticipant",
    "TripPlace",
    "TripPlaceStatus",
    "TripStatus",
    "User",
    "UserStatus",
]
