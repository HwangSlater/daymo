import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import WRITERS, membership_for_trip, membership_for_trip_row, require
from app.core.responses import ok, page
from app.models import Reservation, Transport
from app.schemas.booking import (
    ReservationCreateRequest,
    ReservationOut,
    ReservationUpdateRequest,
    TransportCreateRequest,
    TransportOut,
    TransportUpdateRequest,
)
from app.services import bookings

router = APIRouter(tags=["bookings"])


async def _교통_응답(db, trip, transport: Transport) -> dict:
    시각 = await bookings.transport_fields(db, trip, transport)
    return TransportOut(
        id=str(transport.id),
        trip_id=str(transport.trip_id),
        direction=transport.direction,
        method=transport.method,
        date=시각["date"],
        departure_name=transport.departure_name,
        departure_time=시각["departure_time"],
        arrival_name=transport.arrival_name,
        arrival_time=시각["arrival_time"],
        owner_membership_id=str(transport.owner_membership_id) if transport.owner_membership_id else None,
        booking_status=transport.booking_status,
        note=transport.note,
        show_in_schedule=transport.show_in_schedule,
        version=transport.version,
    ).model_dump(by_alias=True, mode="json")


async def _예약_응답(db, trip, reservation: Reservation) -> dict:
    return ReservationOut(
        id=str(reservation.id),
        trip_id=str(reservation.trip_id),
        title=reservation.title,
        date=reservation.reserved_on,
        time=await bookings.reservation_time(db, trip, reservation),
        party_size=reservation.party_size,
        party_label=reservation.party_label,
        status=reservation.status,
        note=reservation.note,
        booking_url=reservation.booking_url,
        show_in_schedule=reservation.show_in_schedule,
        version=reservation.version,
    ).model_dump(by_alias=True, mode="json")


# ---------------------------------------------------------------------------
# 교통편
# ---------------------------------------------------------------------------


@router.get("/trips/{trip_id}/transports")
async def list_transports(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    _, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    return page([await _교통_응답(db, trip, row) for row in await bookings.list_transports(db, trip)])


@router.post("/trips/{trip_id}/transports", status_code=status.HTTP_201_CREATED)
async def create_transport(
    trip_id: uuid.UUID, body: TransportCreateRequest, caller: CurrentCaller, db: DbSession, response: Response
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    transport, 만들었다 = await bookings.create_transport(
        db, trip=trip, actor=membership, transport_id=body.id, values=body.model_dump(exclude={"id"})
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(await _교통_응답(db, trip, transport))


@router.patch("/transports/{transport_id}")
async def update_transport(
    transport_id: uuid.UUID, body: TransportUpdateRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    membership, trip, transport = await membership_for_trip_row(
        db, user_id=caller.user.id, model=Transport, row_id=transport_id
    )
    require(membership, *WRITERS)
    await bookings.update_transport(
        db, trip=trip, transport=transport, version=body.version,
        changes=body.model_dump(exclude_unset=True, exclude={"version"}),
    )
    return ok(await _교통_응답(db, trip, transport))


@router.delete("/transports/{transport_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transport(transport_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    membership, _, transport = await membership_for_trip_row(
        db, user_id=caller.user.id, model=Transport, row_id=transport_id
    )
    require(membership, *WRITERS)
    await bookings.remove_transport(db, transport)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# 예약
# ---------------------------------------------------------------------------


@router.get("/trips/{trip_id}/reservations")
async def list_reservations(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    _, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    return page([await _예약_응답(db, trip, row) for row in await bookings.list_reservations(db, trip)])


@router.post("/trips/{trip_id}/reservations", status_code=status.HTTP_201_CREATED)
async def create_reservation(
    trip_id: uuid.UUID, body: ReservationCreateRequest, caller: CurrentCaller, db: DbSession, response: Response
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    reservation, 만들었다 = await bookings.create_reservation(
        db, trip=trip, actor=membership, reservation_id=body.id, values=body.model_dump(exclude={"id"})
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(await _예약_응답(db, trip, reservation))


@router.patch("/reservations/{reservation_id}")
async def update_reservation(
    reservation_id: uuid.UUID, body: ReservationUpdateRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    membership, trip, reservation = await membership_for_trip_row(
        db, user_id=caller.user.id, model=Reservation, row_id=reservation_id
    )
    require(membership, *WRITERS)
    await bookings.update_reservation(
        db, trip=trip, reservation=reservation, version=body.version,
        changes=body.model_dump(exclude_unset=True, exclude={"version"}),
    )
    return ok(await _예약_응답(db, trip, reservation))


@router.delete("/reservations/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reservation(reservation_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    membership, _, reservation = await membership_for_trip_row(
        db, user_id=caller.user.id, model=Reservation, row_id=reservation_id
    )
    require(membership, *WRITERS)
    await bookings.remove_reservation(db, reservation)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
