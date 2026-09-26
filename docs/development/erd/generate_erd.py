#!/usr/bin/env python3
"""Daymo DB 스키마 스냅샷으로 Graphviz ERD 산출물을 생성한다."""

from __future__ import annotations

import argparse
import html
import json
import subprocess
from pathlib import Path


DOMAINS = {
    "account": ("계정 · 인증", "#DCEBFF", [
        "users", "oauth_accounts", "oauth_states", "oauth_pending_logins", "devices",
        "refresh_tokens", "email_verification_tokens", "password_reset_tokens",
        "email_change_tokens", "reauth_proofs", "throttle_counters",
    ]),
    "space": ("공간 · 운영", "#E4F4E8", [
        "spaces", "memberships", "relationship_profiles", "space_invites",
        "calendar_notes", "feedback", "reports", "user_blocks",
    ]),
    "trip": ("여행 · 일정", "#FFF0D8", [
        "trips", "trip_days", "trip_participants", "schedule_items", "stays",
        "transports", "reservations",
    ]),
    "place": ("장소 · 태그", "#E9E2FA", [
        "places", "trip_places", "tags", "taggings", "external_links",
    ]),
    "cooking": ("준비물 · 요리", "#FCE3EC", [
        "checklists", "checklist_items", "recipes", "ingredients",
    ]),
    "expense": ("비용 · 정산", "#DDF3F4", [
        "expenses", "expense_shares", "payments",
    ]),
    "memory": ("기록 · 추억", "#F3E8D7", [
        "memos", "diaries", "photos", "photo_links", "audit_logs", "trip_cards",
    ]),
}

KEY_BUSINESS_COLUMNS = {
    "name", "title", "email", "status", "role", "date", "start_date", "end_date",
    "starts_at", "ends_at", "amount", "currency", "occurred_at", "created_at",
    "target_type", "target_id", "link_type", "is_completed", "is_active",
}

DELETE_COLORS = {
    "CASCADE": "#C65D3B",
    "SET NULL": "#5575A5",
    "RESTRICT": "#9A6A21",
    "NO ACTION": "#777777",
}


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def port(value: str) -> str:
    return "p_" + "".join(c if c.isalnum() else "_" for c in value)


def domain_for(table: str) -> str:
    for key, (_, _, tables) in DOMAINS.items():
        if table in tables:
            return key
    raise KeyError(table)


def column_flags(table: dict, column: dict) -> str:
    flags = []
    name = column["name"]
    if column["primary_key"]:
        flags.append("PK")
    if column["foreign_keys"]:
        flags.append("FK")
    if any(c["kind"] == "UNIQUE" and c["columns"] == [name] for c in table["constraints"]):
        flags.append("UK")
    if any(i["columns"] == [name] for i in table["indexes"]):
        flags.append("IDX")
    return " · ".join(flags)


def shown_columns(table: dict, mode: str) -> list[dict]:
    if mode == "full":
        return table["columns"]
    picked = []
    for column in table["columns"]:
        if (column["primary_key"] or column["foreign_keys"] or
                column["name"] in KEY_BUSINESS_COLUMNS):
            picked.append(column)
    # 개요도에서도 각 테이블의 의미를 읽을 수 있도록 최소 세 컬럼을 보인다.
    for column in table["columns"]:
        if column not in picked and len(picked) < 3:
            picked.append(column)
    order = {c["name"]: i for i, c in enumerate(table["columns"])}
    return sorted(picked, key=lambda c: order[c["name"]])


def node_label(table: dict, mode: str, *, external: bool = False, only: set[str] | None = None) -> str:
    color = DOMAINS[domain_for(table["name"])][1]
    if external:
        color = "#F2F2F2"
    rows = [
        f'<TR><TD BGCOLOR="{color}" COLSPAN="3" ALIGN="LEFT">'
        f'<FONT POINT-SIZE="13"><B>{esc(table["name"])}</B></FONT></TD></TR>'
    ]
    columns = shown_columns(table, mode)
    if only is not None:
        columns = [column for column in columns if column["name"] in only]
    for column in columns:
        flags = column_flags(table, column)
        flags_markup = f"<B>{esc(flags)}</B>" if flags else "&#160;"
        nullable = "" if not column["nullable"] else "?"
        rows.append(
            f'<TR><TD PORT="{port(column["name"])}" ALIGN="LEFT">{esc(column["name"])}</TD>'
            f'<TD ALIGN="LEFT"><FONT COLOR="#666666">{esc(column["type"])}{nullable}</FONT></TD>'
            f'<TD ALIGN="RIGHT"><FONT COLOR="#8A4F31">{flags_markup}</FONT></TD></TR>'
        )
    if only is not None and len(table["columns"]) > len(columns):
        hidden = len(table["columns"]) - len(columns)
        rows.append(f'<TR><TD COLSPAN="3" ALIGN="LEFT"><FONT COLOR="#888888">… {hidden}개 컬럼</FONT></TD></TR>')
    elif mode == "overview" and len(table["columns"]) > len(shown_columns(table, mode)):
        hidden = len(table["columns"]) - len(shown_columns(table, mode))
        rows.append(f'<TR><TD COLSPAN="3" ALIGN="LEFT"><FONT COLOR="#888888">… {hidden}개 컬럼</FONT></TD></TR>')
    return '<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="5" COLOR="#B8B8B8">' + "".join(rows) + "</TABLE>>"


def relationships(tables: list[dict]) -> list[dict]:
    result = []
    for table in tables:
        for constraint in table["constraints"]:
            if constraint["kind"] != "FK":
                continue
            for source, target in zip(constraint["columns"], constraint["targets"]):
                target_table, target_column = target.split(".", 1)
                result.append({
                    "source_table": table["name"], "source_column": source,
                    "target_table": target_table, "target_column": target_column,
                    "ondelete": constraint.get("ondelete") or "NO ACTION",
                    "name": constraint.get("name") or "",
                })
    return result


def graph(tables: list[dict], *, title: str, mode: str, selected: set[str] | None = None) -> str:
    by_name = {t["name"]: t for t in tables}
    rels = relationships(tables)
    selected = selected or set(by_name)
    external = set()
    if selected != set(by_name):
        for rel in rels:
            if rel["source_table"] in selected or rel["target_table"] in selected:
                external.update((rel["source_table"], rel["target_table"]))
        external -= selected
    visible = selected | external
    lines = [
        "digraph daymo_erd {",
        '  graph [rankdir=LR, bgcolor="#FCFBF8", pad="0.35", nodesep="0.35", ranksep="1.05",',
        '         splines=polyline, overlap=false, newrank=true, fontname="Arial",',
        f'         label="{esc(title)}", labelloc=t, fontsize=22, fontcolor="#292929"];',
        '  node [shape=plain, fontname="Arial", fontsize=10];',
        '  edge [fontname="Arial", fontsize=8, arrowsize=0.7, penwidth=1.2];',
    ]
    for key, (label, color, names) in DOMAINS.items():
        own = [name for name in names if name in selected]
        if not own:
            continue
        lines += [
            f'  subgraph cluster_{key} {{',
            f'    label="{label}"; color="{color}"; penwidth=2; style="rounded";',
            '    fontname="Arial"; fontsize=15;',
        ]
        for name in own:
            lines.append(f'    "{name}" [label={node_label(by_name[name], mode)}];')
        lines.append("  }")
    for name in sorted(external):
        relevant = {"id"}
        for rel in rels:
            if rel["source_table"] in selected and rel["target_table"] == name:
                relevant.add(rel["target_column"])
            if rel["target_table"] in selected and rel["source_table"] == name:
                relevant.add(rel["source_column"])
        lines.append(
            f'  "{name}" [label={node_label(by_name[name], "full", external=True, only=relevant)}, opacity=0.72];'
        )
    for rel in rels:
        if rel["source_table"] not in visible or rel["target_table"] not in visible:
            continue
        if selected != set(by_name) and rel["source_table"] not in selected and rel["target_table"] not in selected:
            continue
        delete = rel["ondelete"]
        color = DELETE_COLORS.get(delete, DELETE_COLORS["NO ACTION"])
        label = f'{rel["source_column"]} · {delete}'
        lines.append(
            f'  "{rel["source_table"]}":{port(rel["source_column"])}:w -> '
            f'"{rel["target_table"]}":{port(rel["target_column"])}:e '
            f'[label="{esc(label)}", color="{color}", fontcolor="{color}", '
            f'arrowhead=teetee, arrowtail=crow, dir=both, tooltip="{esc(rel["name"])}"];'
        )
    # 다형 참조는 물리 FK가 아니므로 오해를 막기 위해 별도 범례로 표시한다.
    lines += [
        '  legend [shape=plain, label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="6" COLOR="#BBBBBB">',
        '    <TR><TD BGCOLOR="#EEEEEE"><B>범례</B></TD></TR>',
        '    <TR><TD ALIGN="LEFT">PK 기본키 · FK 외래키 · UK 고유키 · IDX 단일 컬럼 인덱스 · ? NULL 허용</TD></TR>',
        '    <TR><TD ALIGN="LEFT"><FONT COLOR="#C65D3B">CASCADE</FONT> · <FONT COLOR="#5575A5">SET NULL</FONT> · <FONT COLOR="#9A6A21">RESTRICT</FONT> · 회색 NO ACTION</TD></TR>',
        '    <TR><TD ALIGN="LEFT">target_type + target_id 같은 다형 참조는 DB FK가 아니므로 관계선에서 제외</TD></TR>',
        '  </TABLE>>];',
        "}",
    ]
    return "\n".join(lines) + "\n"


def render(dot_path: Path, formats: tuple[str, ...]) -> None:
    for fmt in formats:
        output = dot_path.with_suffix(f".{fmt}")
        subprocess.run(["dot", f"-T{fmt}", str(dot_path), "-o", str(output)], check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--schema", type=Path, default=Path(__file__).with_name("schema.json"))
    parser.add_argument("--output", type=Path, default=Path(__file__).parent)
    args = parser.parse_args()
    tables = json.loads(args.schema.read_text(encoding="utf-8"))
    args.output.mkdir(parents=True, exist_ok=True)

    specs = [
        ("daymo-erd-overview", "Daymo 운영 DB 전체 ERD · 개요", "overview", None, ("svg", "pdf", "png")),
        ("daymo-erd-full", "Daymo 운영 DB 전체 ERD · 모든 컬럼", "full", None, ("svg", "pdf")),
    ]
    for key, (label, _, names) in DOMAINS.items():
        specs.append((f"daymo-erd-{key}", f"Daymo ERD · {label}", "full", set(names), ("svg", "pdf")))

    for filename, title, mode, selected, formats in specs:
        dot_path = args.output / f"{filename}.dot"
        dot_path.write_text(graph(tables, title=title, mode=mode, selected=selected), encoding="utf-8")
        render(dot_path, formats)

    print(f"테이블 {len(tables)}개, FK {len(relationships(tables))}개를 시각화했습니다.")


if __name__ == "__main__":
    main()
