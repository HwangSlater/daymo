from datetime import date

import pytest
from sqlalchemy import func, select

from app.core import passwords
from app.core.config import get_settings
from app.core.errors import AppError
from app.jobs.seed_demo import (
    DEMO_MEMBER_EMAILS,
    DEMO_SPACE_NAME,
    NotADemoAccount,
    read_password,
    seed,
)
from app.models import Membership, MembershipRole, Photo, PhotoStatus, Place, Space, Trip, TripStatus, User
from app.services.accounts import TERMS_VERSION
from tests.factories import 공간과_멤버_하나, 멤버를_넣는다, 사람을_넣는다, 여행을_넣는다

pytestmark = pytest.mark.anyio

# 테스트용 값. 실제 데모 계정 비밀번호가 아니다.
비밀번호 = "심사용-테스트-비밀번호-42"
이메일 = "review-demo@example.com"
오늘 = date(2026, 9, 15)


@pytest.fixture(autouse=True)
def 사진_폴더(tmp_path, monkeypatch):
    """운영 경로나 다른 테스트의 사진 폴더를 건드리지 않게 빈 폴더에 둔다."""
    monkeypatch.setattr(get_settings(), "upload_root", str(tmp_path))
    return tmp_path


async def _세기(db, model, *조건) -> int:
    return await db.scalar(select(func.count()).select_from(model).where(*조건)) or 0


async def test_두_번_돌려도_데모_공간은_하나이고_여행이_셋이다(db, 사진_폴더):
    첫번째 = await seed(db, email=이메일, password=비밀번호, today=오늘)
    첫_여행_ids = set((await db.execute(select(Trip.id).where(Trip.space_id == 첫번째.space_id))).scalars())
    assert 첫번째.reset is False

    두번째 = await seed(db, email=이메일, password=비밀번호, today=오늘)
    await db.flush()

    assert 두번째.reset is True
    assert 두번째.user_id == 첫번째.user_id
    assert await _세기(db, User, User.email == 이메일) == 1
    assert await _세기(db, User, User.email.in_(DEMO_MEMBER_EMAILS)) == 2

    # 계정이 들어가 있는 공간은 새로 만든 데모 공간 하나뿐이다.
    assert await _세기(db, Space, Space.id == 첫번째.space_id) == 0
    assert await _세기(db, Membership, Membership.user_id == 두번째.user_id) == 1
    space = await db.get(Space, 두번째.space_id)
    assert space.name == DEMO_SPACE_NAME and space.owner_id == 두번째.user_id

    멤버들 = (await db.execute(select(Membership).where(Membership.space_id == space.id))).scalars().all()
    assert sorted(m.role for m in 멤버들) == sorted([MembershipRole.OWNER, MembershipRole.EDITOR, MembershipRole.EDITOR])

    여행들 = (await db.execute(select(Trip).where(Trip.space_id == space.id))).scalars().all()
    assert len(여행들) == 두번째.trip_count == 3
    assert {t.status for t in 여행들} == {TripStatus.PLANNING, TripStatus.ONGOING, TripStatus.COMPLETED}
    다가올 = next(t for t in 여행들 if t.status is TripStatus.PLANNING)
    assert (다가올.start_date - 오늘).days == 14
    지금 = next(t for t in 여행들 if t.status is TripStatus.ONGOING)
    assert 지금.start_date <= 오늘 <= 지금.end_date

    # 첫 실행의 여행과 사진 파일은 남지 않는다.
    assert 첫_여행_ids.isdisjoint({t.id for t in 여행들})
    for 여행_id in 첫_여행_ids:
        assert not (사진_폴더 / "trips" / str(여행_id)).exists()
    사진들 = (
        await db.execute(select(Photo).join(Trip, Trip.id == Photo.trip_id).where(Trip.space_id == space.id))
    ).scalars().all()
    assert len(사진들) == 두번째.photo_count > 0
    for 사진 in 사진들:
        assert 사진.status is PhotoStatus.READY
        assert (사진_폴더 / 사진.thumbnail_path).is_file()


async def test_다시_돌려도_손_장소가_쌓이지_않는다(db):
    await seed(db, email=이메일, password=비밀번호, today=오늘)
    한_번 = await _세기(db, Place)
    await seed(db, email=이메일, password=비밀번호, today=오늘)
    assert await _세기(db, Place) == 한_번


async def test_다른_사람의_공간은_건드리지_않는다(db):
    남의_공간, _ = await 공간과_멤버_하나(db)
    남의_여행 = await 여행을_넣는다(db, 남의_공간)

    await seed(db, email=이메일, password=비밀번호, today=오늘)
    await seed(db, email=이메일, password=비밀번호, today=오늘)

    assert await db.get(Space, 남의_공간.id) is not None
    assert await db.get(Trip, 남의_여행.id) is not None


async def test_보통_계정의_이메일이면_멈추고_아무것도_바꾸지_않는다(db):
    사람 = await 사람을_넣는다(db, "새봄")
    원래_해시 = passwords.hash_password("원래-쓰던-비밀번호-7")
    사람.password_hash = 원래_해시
    await db.flush()

    with pytest.raises(NotADemoAccount):
        await seed(db, email=사람.email, password=비밀번호, today=오늘)

    await db.refresh(사람)
    assert 사람.password_hash == 원래_해시
    assert 사람.display_name == "새봄"
    assert 사람.email_verified_at is None
    assert await _세기(db, Space, Space.owner_id == 사람.id) == 0


async def test_보통_계정이_공간을_가지고_있어도_멈춘다(db):
    space, owner = await 공간과_멤버_하나(db)
    사람 = await db.get(User, owner.user_id)

    with pytest.raises(NotADemoAccount):
        await seed(db, email=사람.email, password=비밀번호, today=오늘)

    assert await db.get(Space, space.id) is not None


async def test_데모_공간에_다른_사람이_들어와_있으면_멈춘다(db):
    결과 = await seed(db, email=이메일, password=비밀번호, today=오늘)
    진짜_사람 = await 사람을_넣는다(db, "새봄")
    space = await db.get(Space, 결과.space_id)
    await 멤버를_넣는다(db, space, 진짜_사람)

    with pytest.raises(NotADemoAccount):
        await seed(db, email=이메일, password=비밀번호, today=오늘)

    assert await db.get(Space, 결과.space_id) is not None


async def test_데모_멤버_주소로_가입한_계정이_있으면_멈춘다(db):
    누군가 = User(email=sorted(DEMO_MEMBER_EMAILS)[0], display_name="새봄", password_hash=passwords.hash_password("누군가의-비밀번호-9"))
    db.add(누군가)
    await db.flush()

    with pytest.raises(NotADemoAccount):
        await seed(db, email=이메일, password=비밀번호, today=오늘)
    assert await _세기(db, User, User.email == 이메일) == 0


async def test_비밀번호는_해시로만_남고_계정은_확인과_동의가_끝나_있다(db):
    결과 = await seed(db, email=이메일, password=비밀번호, today=오늘)
    user = await db.get(User, 결과.user_id)

    assert user.password_hash != 비밀번호
    assert 비밀번호 not in user.password_hash
    assert user.password_hash.startswith("$argon2id$")
    assert passwords.verify(user.password_hash, 비밀번호)
    assert user.email_verified_at is not None
    assert user.terms_version == TERMS_VERSION and user.terms_agreed_at is not None
    assert user.display_name == "하늘"

    # 가짜 멤버는 로그인할 수 없다.
    멤버들 = (await db.execute(select(User).where(User.email.in_(DEMO_MEMBER_EMAILS)))).scalars().all()
    assert all(멤버.password_hash is None for 멤버 in 멤버들)


async def test_다시_돌리면_새_비밀번호로_바뀐다(db):
    await seed(db, email=이메일, password=비밀번호, today=오늘)
    결과 = await seed(db, email=이메일, password="바꾼-심사용-비밀번호-43", today=오늘)
    user = await db.get(User, 결과.user_id)
    assert passwords.verify(user.password_hash, "바꾼-심사용-비밀번호-43")
    assert not passwords.verify(user.password_hash, 비밀번호)


async def test_약한_비밀번호는_받지_않는다(db):
    with pytest.raises(AppError):
        await seed(db, email=이메일, password="짧음", today=오늘)
    assert await _세기(db, User, User.email == 이메일) == 0


async def test_데모_계정으로_로그인하면_여행과_사진이_보인다(api, db):
    await seed(db, email=이메일, password=비밀번호)

    응답 = await api.post(
        "/v1/auth/login",
        json={"email": 이메일, "password": 비밀번호, "device": {"installationId": "심사-기기", "platform": "ios"}},
    )
    assert 응답.status_code == 200, 응답.text
    headers = {"Authorization": f"Bearer {응답.json()['data']['accessToken']}"}

    공간들 = (await api.get("/v1/spaces", headers=headers)).json()["data"]
    assert [s["name"] for s in 공간들] == [DEMO_SPACE_NAME]
    여행들 = (await api.get(f"/v1/spaces/{공간들[0]['id']}/trips", headers=headers)).json()["data"]
    assert len(여행들) == 3

    사진_수 = 0
    for 여행 in 여행들:
        사진들 = (await api.get(f"/v1/trips/{여행['id']}/photos", headers=headers)).json()["data"]
        사진_수 += len(사진들)
        for 사진 in 사진들:
            파일 = await api.get(f"/v1/photos/{사진['id']}/content?variant=thumbnail", headers=headers)
            assert 파일.status_code == 200
    assert 사진_수 > 0


def test_비밀번호_파일은_끝의_줄바꿈만_뗀다(tmp_path, monkeypatch):
    파일 = tmp_path / "demo-password"
    파일.write_text("공백 포함 비밀번호 \n", encoding="utf-8")
    assert read_password(str(파일)) == "공백 포함 비밀번호 "

    monkeypatch.setenv("DEMO_PASSWORD", "환경-변수-비밀번호")
    assert read_password(None) == "환경-변수-비밀번호"
