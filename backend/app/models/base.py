from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """
    모든 테이블의 바탕.

    아직 테이블이 하나도 없다. 도메인 모델은
    docs/development/02-architecture-and-data-model.md 3장에 적혀 있고,
    거기서부터 옮겨 온다. 여기에 임의로 테이블을 만들지 않는다.
    """
