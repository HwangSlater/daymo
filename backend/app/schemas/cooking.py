import uuid

from pydantic import Field

from app.models import Procurement
from app.schemas.auth import _Camel


class ChecklistItemCreateRequest(_Camel):
    """
    준비물 하나. 담당은 사람(`ownerMembershipId`)·공용(`isShared`)·미정(둘 다 비움) 중 하나다.

    `completed` 를 참으로 보내면 체크한 것이다. 누가 언제 체크했는지는 서버가 적는다.

    `sourceIngredientId` 는 요리 재료에서 가져온 준비물일 때 그 재료다. 같은 여행의 재료만
    받는다. 완료 상태는 재료와 따로 간다.
    """

    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=60)
    quantity: str | None = Field(default=None, max_length=60)
    owner_membership_id: uuid.UUID | None = None
    is_shared: bool = False
    completed: bool = False
    tags: list[str] = Field(default_factory=list, max_length=20)
    source_ingredient_id: uuid.UUID | None = None


class ChecklistItemUpdateRequest(_Camel):
    version: int
    name: str | None = Field(default=None, min_length=1, max_length=60)
    quantity: str | None = Field(default=None, max_length=60)
    owner_membership_id: uuid.UUID | None = None
    is_shared: bool | None = None
    completed: bool | None = None
    tags: list[str] | None = Field(default=None, max_length=20)
    # null 을 보내면 연결을 끊는다. 보내지 않으면 그대로 둔다.
    source_ingredient_id: uuid.UUID | None = None


class ChecklistItemOut(_Camel):
    id: str
    trip_id: str
    name: str
    quantity: str | None
    owner_membership_id: str | None
    is_shared: bool
    completed: bool
    tags: list[str]
    source_ingredient_id: str | None
    version: int


class IngredientIn(_Camel):
    """
    재료 하나. `procurement` 가 `bring` 일 때만 챙길 사람이 있다.

    `id` 를 보내면 그 재료를 고치고, 없으면 새로 만든다. 요리를 고칠 때 보내지 않은
    재료는 지운다.
    """

    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=60)
    quantity: str | None = Field(default=None, max_length=60)
    category: str | None = Field(default=None, max_length=30)
    procurement: Procurement = Procurement.UNDECIDED
    owner_membership_id: uuid.UUID | None = None
    ready: bool = False


class RecipeCreateRequest(_Camel):
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=60)
    memo: str | None = Field(default=None, max_length=2000)
    source_url: str | None = Field(default=None, max_length=2048)
    ingredients: list[IngredientIn] = Field(default_factory=list, max_length=100)


class RecipeUpdateRequest(_Camel):
    version: int
    name: str | None = Field(default=None, min_length=1, max_length=60)
    memo: str | None = Field(default=None, max_length=2000)
    source_url: str | None = Field(default=None, max_length=2048)
    ingredients: list[IngredientIn] | None = Field(default=None, max_length=100)


class IngredientOut(_Camel):
    id: str
    name: str
    quantity: str | None
    category: str | None
    procurement: Procurement
    owner_membership_id: str | None
    ready: bool


class RecipeOut(_Camel):
    id: str
    trip_id: str
    name: str
    memo: str | None
    source_url: str | None
    ingredients: list[IngredientOut]
    version: int
