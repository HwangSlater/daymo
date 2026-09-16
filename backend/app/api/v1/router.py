from fastapi import APIRouter

from app.api.v1 import (
    auth,
    bookings,
    client_errors,
    cooking,
    expenses,
    health,
    me,
    members,
    memories,
    oauth,
    photos,
    places,
    reports,
    schedule,
    trash,
    trips,
)

# /v1 아래의 라우터를 여기서 모은다. 새 기능은 모듈을 만들어 include 한다.
api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(oauth.router)
api_router.include_router(me.router)
api_router.include_router(trips.router)
api_router.include_router(members.router)
api_router.include_router(places.router)
api_router.include_router(schedule.router)
api_router.include_router(bookings.router)
api_router.include_router(expenses.router)
api_router.include_router(cooking.router)
api_router.include_router(memories.router)
api_router.include_router(photos.router)
api_router.include_router(reports.router)
api_router.include_router(trash.router)
api_router.include_router(client_errors.router)
