import uuid
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedByMixin, TimestampMixin, uuid_pk
from app.models.enums import PlaceProvider, TripPlaceStatus, enum_column


class Place(Base, TimestampMixin):
    """
    지도 위의 한 곳.

    공간에 속하지 않는다. 같은 식당을 여러 공간이 각각 저장해도 실체는
    하나이고, 좌표와 주소는 누가 저장했든 같은 값이다. 공간마다 다른 것
    (분류, 메모, 진행 상태)은 `trip_places` 가 가진다.

    사용자가 쓴 글이 여기 들어가지 않는 것이 중요하다. 이 행은 여러 공간이
    함께 보는 것이라, 메모를 여기 두면 남의 공간에 내 메모가 보인다.
    """

    __tablename__ = "places"
    __table_args__ = (
        # 같은 제공자의 같은 장소를 두 번 만들지 않는다. 손으로 적은 장소
        # (provider_place_id 가 없는 것)는 중복을 막지 않는다. 같은 이름의
        # 다른 곳일 수 있어서다.
        Index(
            "uq_places_provider_place",
            "provider",
            "provider_place_id",
            unique=True,
            postgresql_where=("provider_place_id IS NOT NULL"),
        ),
        CheckConstraint(
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)",
            name="latitude_in_range",
        ),
        CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="longitude_in_range",
        ),
        # 좌표는 둘 다 있거나 둘 다 없다. 하나만 있으면 지도에 찍을 수 없는데
        # 값이 있는 것처럼 보여서 더 나쁘다.
        CheckConstraint(
            "(latitude IS NULL) = (longitude IS NULL)",
            name="coordinates_together",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # 위도는 ±90, 경도는 ±180 이라 정수 자리가 다르다.
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)

    provider: Mapped[PlaceProvider] = mapped_column(
        enum_column(PlaceProvider), nullable=False, default=PlaceProvider.MANUAL
    )
    provider_place_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Place {self.id}>"


class TripPlace(Base, TimestampMixin, CreatedByMixin):
    """
    어떤 여행이 그 장소를 어떻게 쓰고 있는지.

    분류와 메모와 진행 상태가 여기 있는 이유는 같은 곳이라도 여행마다 다르게
    쓰이기 때문이다. 작년에 숙소였던 곳이 올해는 구경거리일 수 있다.

    `category` 는 열거값이 아니라 자유 문구다. 네이버가 주는 분류를 그대로
    받는데(`숙소`, `식당`, `구경`) 목록이 정해져 있지 않다. 우리가 고른 값만
    허용하면 네이버에서 가져온 장소가 분류 없이 들어온다.
    """

    __tablename__ = "trip_places"
    __table_args__ = (
        # 한 여행에 같은 장소를 두 번 담지 않는다.
        Index("uq_trip_places_place", "trip_id", "place_id", unique=True),
        Index("ix_trip_places_trip_status", "trip_id", "status"),
        # 아무 여행에도 안 남은 손수 적은 장소를 매일 지운다. 위의 둘은 `trip_id` 가
        # 앞이라 장소 쪽에서 되짚을 수 없다.
        Index("ix_trip_places_place_id", "place_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()

    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    # 장소 실체는 여러 여행이 함께 쓰므로 지워지면 안 된다.
    place_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("places.id", ondelete="RESTRICT"), nullable=False
    )

    category: Mapped[str | None] = mapped_column(String(30), nullable=True)
    status: Mapped[TripPlaceStatus] = mapped_column(
        enum_column(TripPlaceStatus), nullable=False, default=TripPlaceStatus.SAVED
    )
    # 지도에서 고른 시도. 앱의 지역 판정이 어림이라 값이 없을 수 있다.
    area: Mapped[str | None] = mapped_column(String(30), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 두 사람이 같은 장소를 동시에 고치면 나중 저장이 앞사람 것을 덮는다. 고칠
    # 때마다 올려서 어긋나면 409 로 돌려준다(여행의 version 과 같은 규칙).
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<TripPlace {self.id}>"
