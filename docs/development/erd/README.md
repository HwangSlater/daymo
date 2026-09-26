# Daymo 운영 DB 시각화 ERD

Graphviz로 만든 운영 DB 기준 ERD다. 2026-09-26 기준 업무 테이블 44개, 컬럼 475개, 물리 FK 95개를 담았다.

## 먼저 볼 파일

- [브라우저용 ERD 탐색 화면](./index.html): 전체 개요와 영역별 확대도를 한 화면에서 선택한다.
- [전체 개요 SVG](./daymo-erd-overview.svg): 모든 테이블과 FK를 보되 컬럼을 핵심 정보 위주로 줄였다.
- [전체 상세 SVG](./daymo-erd-full.svg): 475개 컬럼을 전부 표시한다.
- [전체 상세 PDF](./daymo-erd-full.pdf): 큰 화면 또는 인쇄용 벡터 문서다.

SVG와 PDF는 확대해도 글자가 흐려지지 않는다. GitHub에서는 SVG를 열고 원본 보기를 선택하거나 파일을 내려받아 브라우저에서 여는 편이 가장 읽기 쉽다.

## 영역별 확대도

| 영역 | SVG | PDF |
| --- | --- | --- |
| 계정·인증 | [보기](./daymo-erd-account.svg) | [받기](./daymo-erd-account.pdf) |
| 공간·운영 | [보기](./daymo-erd-space.svg) | [받기](./daymo-erd-space.pdf) |
| 여행·일정 | [보기](./daymo-erd-trip.svg) | [받기](./daymo-erd-trip.pdf) |
| 장소·태그 | [보기](./daymo-erd-place.svg) | [받기](./daymo-erd-place.pdf) |
| 준비물·요리 | [보기](./daymo-erd-cooking.svg) | [받기](./daymo-erd-cooking.pdf) |
| 비용·정산 | [보기](./daymo-erd-expense.svg) | [받기](./daymo-erd-expense.pdf) |
| 기록·추억 | [보기](./daymo-erd-memory.svg) | [받기](./daymo-erd-memory.pdf) |

## 읽는 법

- `PK`: 기본키, `FK`: 외래키, `UK`: UNIQUE 제약, `IDX`: 해당 열 하나로 된 인덱스
- 자료형 뒤 `?`: NULL 허용
- 주황색 관계선: `ON DELETE CASCADE`
- 파란색 관계선: `ON DELETE SET NULL`
- 갈색 관계선: `ON DELETE RESTRICT`
- 회색 관계선: 명시적인 삭제 동작 없음
- 영역별 그림의 회색 테이블: 해당 영역이 참조하거나 해당 영역을 참조하는 외부 테이블

`target_type + target_id` 구조의 다형 참조는 DB가 강제하는 FK가 아니므로 물리 관계선으로 그리지 않았다. CHECK 제약, 복합·부분 인덱스와 각 테이블의 전체 명세는 [현재 운영 DB ERD와 키·인덱스 명세](../15-current-database-erd.md)에 있다.

## 다시 생성하기

Graphviz 설치 후 아래 명령을 실행한다.

```bash
python3 docs/development/erd/generate_erd.py
```

`schema.json`은 운영 DB 스키마와 대조한 SQLAlchemy 메타데이터의 시각화용 스냅샷이다. 스키마가 바뀌면 이 파일도 새로 추출해 갱신해야 한다.

