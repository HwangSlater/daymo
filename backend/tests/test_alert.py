from datetime import UTC, datetime

import pytest

from app.jobs.alert import ALERT_TO, letter_for


def test_실패한_작업과_시각만_알린다():
    편지 = letter_for("daymo-backup.service", now=datetime(2026, 9, 15, 19, 0, tzinfo=UTC))

    assert 편지.to == ALERT_TO
    assert 편지.subject == "[Daymo 운영] daymo-backup.service 실패"
    assert "2026-09-15 19:00 UTC" in 편지.body
    assert 편지.link is None


@pytest.mark.parametrize("unit", ["", "a b", "x;rm -rf /", "가" * 3, "a" * 81])
def test_unit_이름이_아니면_거부한다(unit):
    with pytest.raises(ValueError):
        letter_for(unit)
