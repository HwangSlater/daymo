"""메일 생김새. 글 판과 그림 판이 같은 것을 말하는지 본다."""

from app.services.mail_template import 편지_html, 편지_글

문의 = "support@daymo.xyz"
링크 = "https://www.daymo.xyz/auth/verify-email?token=abc123"


def test_링크가_있으면_단추와_주소가_함께_나온다() -> None:
    html = 편지_html("이메일을 확인해 주세요", "아래 단추를 누르면 가입이 끝나요.", 링크, 문의, "이메일 확인하기")

    # 단추는 눌러 주지 않는 메일 앱이 있다. 주소 원문도 함께 있어야 들어갈 수 있다.
    assert html.count(링크) == 2
    assert "이메일 확인하기" in html
    assert "30분 동안 한 번만" in html or "30분 동안 한 번만 쓸 수 있어요" in html
    assert 문의 in html


def test_알리기만_하는_메일에는_단추가_없다() -> None:
    html = 편지_html("비밀번호가 바뀌었어요", "방금 비밀번호를 바꿨어요.", None, 문의, "열어서 확인하기")

    assert "열어서 확인하기" not in html
    assert "단추가 안 눌리면" not in html
    assert "비밀번호가 바뀌었어요" in html


def test_글_판에도_링크가_그대로_있다() -> None:
    글 = 편지_글("이메일을 확인해 주세요", "아래 단추를 누르면 가입이 끝나요.", 링크, 문의)

    assert 링크 in 글
    assert 글.startswith("이메일을 확인해 주세요")
    assert 글.rstrip().endswith(문의)


def test_사용자가_적은_글자는_그대로_새지_않는다() -> None:
    # 제목과 본문에는 공간 이름이나 신고 사유처럼 사람이 적은 글이 실린다.
    html = 편지_html("<script>alert(1)</script> 신고", "그 & 저 <b>굵게</b>", None, 문의, "확인")

    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "&amp;" in html


def test_한_줄_미리보기는_감춘다() -> None:
    html = 편지_html("이메일을 확인해 주세요", "아래 단추를 누르면 가입이 끝나요.", 링크, 문의, "확인하기")

    # 메일함 목록에 제목 옆으로 보이는 줄. 화면에는 안 나와야 한다.
    앞 = html.index("아래 단추를 누르면 가입이 끝나요.")
    assert "display:none" in html[:앞]
