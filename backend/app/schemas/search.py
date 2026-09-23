from app.schemas.auth import _Camel


class SearchHitOut(_Camel):
    """
    찾은 줄 하나.

    앱의 「찾기」 탭이 한 줄로 그릴 만큼만 담는다. 무엇을 보여 줄지는 앱이 정한다.

    - `type`: `trip`·`place`·`schedule`·`packing`·`recipe`·`expense`·`memo`·`diary`.
      앱 화면의 분류 칩(장소·일정·요리·준비·비용·기록)은 이 값으로 고른다.
    - `destination`: 이 줄을 눌렀을 때 열 여행 상세의 자리
      (`mobile/src/WarmTripDetail.tsx` 의 `TripDetailDestination`).
    - `detail`: 한 줄로 보여 줄 짧은 맥락. 날짜·수량·지은이처럼 종류마다 다르고,
      줄 것이 없으면 빈 글자다.
    """

    type: str
    id: str
    trip_id: str
    trip_title: str
    title: str
    detail: str
    destination: str
