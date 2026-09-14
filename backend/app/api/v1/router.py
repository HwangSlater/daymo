from fastapi import APIRouter

from app.api.v1 import auth, health, me, trips

# /v1 아래의 라우터를 여기서 모은다. 새 기능은 모듈을 만들어 include 한다.
api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(trips.router)
