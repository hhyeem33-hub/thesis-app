"""한국외대 논문 양식(assets/template.hwpx) 그대로 hwpx 를 만드는 생성기.

양식 파일의 글꼴·크기·여백·스타일(header.xml)과 쪽 설정은 손대지 않고, 양식에 있는
문단(제목, 이름, 목차 표, 장·절·목 제목, 본문, 각주, 예문, 표, 참고문헌)을 복제해
내용만 바꿔 끼운다. 원고 형식은 SKILL.md 와 references/sample-manuscript.json 참고.

사용법:
  python make_hwpx.py 원고.json --project "프로젝트 이름"   # 드라이브 AI 작성글 폴더에 저장
  python make_hwpx.py 원고.json --out 결과.hwpx               # 지정한 경로에 저장 (테스트용)
"""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import random
import re
import sys
import zipfile
from pathlib import Path

from lxml import etree

SKILL_DIR = Path(__file__).resolve().parents[1]
TEMPLATE = SKILL_DIR / "assets" / "template.hwpx"
REPO_ROOT = SKILL_DIR.parents[2]
APP_FOLDER = "논문작업실"
AI_FOLDER = "AI 작성글"

HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"
OPF = "http://www.idpf.org/2007/opf/"


def q(tag: str) -> str:
    return f"{{{HP}}}{tag}"


# ── 양식 문단 찾기 (styleIDRef 는 양식 header.xml 의 스타일 번호) ─────────────────
STYLE = {
    "title": "35",       # 论文题目
    "name": "37",        # 이름
    "toc": "38",         # 目录
    "h1": "43",          # 1._大标题
    "h2": "44",          # 1.1._小标题
    "h3": "45",          # 1.1.1._标题
    "body": "39",        # 正文_韩文
    "body_cn": "41",     # 正文(简体) - 표 앞 빈 줄
    "example": "42",     # 例句
    "ref_head": "49",    # 参考文献/标题
    "ref": "50",         # 참고문헌내용_국문
    "normal": "52",      # Normal
    "plain": "0",        # 바탕글
}


def text_of(p) -> str:
    return "".join(t.text or "" for t in p.iter(q("t")))


def has(p, tag: str) -> bool:
    return p.find(f".//{q(tag)}") is not None


class Template:
    def __init__(self, path: Path) -> None:
        with zipfile.ZipFile(path) as z:
            self.parts = {name: z.read(name) for name in z.namelist()}
        self.root = etree.fromstring(self.parts["Contents/section0.xml"])
        paras = list(self.root)

        def find(style: str, pred=lambda p: True):
            for p in paras:
                if p.get("styleIDRef") == style and pred(p):
                    return p
            raise SystemExit(f"양식에서 스타일 {style} 문단을 찾지 못했어요. assets/template.hwpx 를 확인해 주세요.")

        filled = lambda p: text_of(p).strip() != ""
        empty = lambda p: not filled(p) and not has(p, "tbl") and not has(p, "footNote")
        self.first = paras[0]  # 제목 문단: 쪽 설정(secPr)·쪽 번호를 담고 있다
        if self.first.get("styleIDRef") != STYLE["title"] or not has(self.first, "secPr"):
            raise SystemExit("양식 첫 문단이 제목 문단이 아니에요.")
        self.proto = {
            "after_title": find(STYLE["ref"], empty),
            "name": find(STYLE["name"], lambda p: has(p, "footNote")),
            "blank": find(STYLE["plain"], empty),
            "toc": find(STYLE["toc"], lambda p: has(p, "tbl")),
            "after_toc": find(STYLE["ref"], empty),
            "h1": find(STYLE["h1"], filled),
            "blank_h1": find(STYLE["h1"], empty),
            "h2": find(STYLE["h2"], filled),
            "h3": find(STYLE["h3"], filled),
            "blank_h3": find(STYLE["h3"], empty),
            "body": find(STYLE["body"], lambda p: filled(p) and not has(p, "footNote")),
            "body_fn": find(STYLE["body"], lambda p: has(p, "footNote")),
            "example": find(STYLE["example"], filled),
            "blank_example": find(STYLE["example"], empty),
            "before_table": find(STYLE["body_cn"], empty),
            "table": find(STYLE["plain"], lambda p: has(p, "tbl")),
            "ref_head": find(STYLE["ref_head"]),
            "ref_blank": find(STYLE["normal"]),
            "ref": find(STYLE["ref"], filled),
        }
        # 본문 각주 run 과 일반 글자 run
        fn_p = self.proto["body_fn"]
        self.fn_run = next(r for r in fn_p.iter(q("run")) if r.find(f".//{q('footNote')}") is not None)
        self.body_run = next(r for r in self.proto["body"].iter(q("run")) if r.find(q("t")) is not None)
        # 표 칸 모양: (첫 행 여부, 열 위치 0=왼쪽 1=가운데 2=오른쪽) → 양식 칸
        tbl = self.proto["table"].find(f".//{q('tbl')}")
        self.cells = {}
        for tc in tbl.iter(q("tc")):
            addr = tc.find(q("cellAddr"))
            r, c = int(addr.get("rowAddr")), int(addr.get("colAddr"))
            last = int(tbl.get("colCnt")) - 1
            key = (min(r, 1), 0 if c == 0 else 2 if c == last else 1)
            self.cells.setdefault(key, tc)


# ── 문단 만들기 ───────────────────────────────────────────────────────────────
def clean(el):
    """복제한 문단에서 줄 배치 캐시를 지운다 (한글이 열 때 다시 계산)."""
    for lsa in list(el.iter(q("linesegarray"))):
        lsa.getparent().remove(lsa)
    return el


def clone(p):
    return clean(copy.deepcopy(p))


def set_text(p, text: str):
    """문단의 첫 글자 run 에 글을 넣고 나머지 글자는 비운다."""
    ts = [t for t in p.iter(q("t"))]
    ts[0].text = text
    for child in list(ts[0]):
        ts[0].remove(child)
    for t in ts[1:]:
        t.text = ""
    return p


class ThesisBuilder:
    def __init__(self, tpl: Template) -> None:
        self.tpl = tpl
        self.out: list = []
        self.fn_no = 0
        self.ex_no = 0
        self.tbl_no = 0

    def add(self, p) -> None:
        self.out.append(p)

    def proto(self, key: str):
        return clone(self.tpl.proto[key])

    # 제목·이름·목차
    def front(self, m: dict) -> None:
        first = copy.deepcopy(self.tpl.first)
        clean(first)
        set_text(first, m["title"])
        self.add(first)
        self.add(self.proto("after_title"))

        name = self.proto("name")
        set_text(name, f"{m['author']}＊")
        note = name.find(f".//{q('footNote')}")
        self.fn_no += 1
        note.set("number", str(self.fn_no))
        note_ts = list(note.iter(q("t")))
        note_ts[0].text = f"＊ {m.get('author_note', '')}".rstrip() + " "
        self.add(name)
        self.add(self.proto("blank"))

        toc = self.proto("toc")
        cell = next(tc for tc in toc.iter(q("tc")) if tc.find(q("cellAddr")).get("rowAddr") == "2")
        sub = cell.find(q("subList"))
        line_proto = sub.find(q("p"))
        for p in list(sub):
            sub.remove(p)
        for i, ch in enumerate(m["chapters"], 1):
            sub.append(set_text(copy.deepcopy(line_proto), f"{i}. {ch['title']}"))
        self.add(toc)
        self.add(self.proto("blank"))
        self.add(self.proto("after_toc"))

    # 본문 문단: "[^각주 내용]" 은 그 자리에 각주로 들어간다
    def body(self, text: str) -> None:
        p = self.proto("body")
        for r in list(p.iter(q("run"))):
            r.getparent().remove(r)
        # 각주 안에 [예시] 같은 대괄호가 한 겹 들어가도 된다
        parts = re.split(r"\[\^((?:[^\[\]]|\[[^\[\]]*\])+)\]", text)
        for i, part in enumerate(parts):
            if i % 2 == 0:
                if part:
                    r = copy.deepcopy(self.tpl.body_run)
                    r.find(q("t")).text = part
                    p.append(r)
            else:
                self.fn_no += 1
                r = clean(copy.deepcopy(self.tpl.fn_run))
                note = r.find(f".//{q('footNote')}")
                note.set("number", str(self.fn_no))
                auto = r.find(f".//{q('autoNum')}")
                if auto is not None:
                    auto.set("num", str(self.fn_no))
                list(note.iter(q("t")))[0].text = f" {part.strip()}"
                p.append(r)
        end = copy.deepcopy(self.tpl.body_run)
        end.find(q("t")).text = ""
        p.append(end)
        self.add(p)

    def example(self, items: list[str]) -> None:
        self.ex_no += 1
        self.add(self.proto("blank"))
        if len(items) == 1:
            self.add(set_text(self.proto("example"), f" ({self.ex_no}) {items[0]}"))
        else:
            for i, item in enumerate(items):
                letter = chr(ord("a") + i)
                prefix = f" ({self.ex_no}) " if i == 0 else " " * (len(str(self.ex_no)) + 4)
                self.add(set_text(self.proto("example"), f"{prefix}{letter}. {item}"))
        self.add(self.proto("blank_example"))

    def table(self, caption: str, rows: list[list[str]]) -> None:
        self.tbl_no += 1
        self.add(self.proto("before_table"))
        p = self.proto("table")
        tbl = p.find(f".//{q('tbl')}")
        tbl.set("id", str(random.randint(10**9, 2 * 10**9)))
        cap = tbl.find(q("caption"))
        list(cap.iter(q("t")))[0].text = f"<표 {self.tbl_no}> {caption}"
        for tr in list(tbl.findall(q("tr"))):
            tbl.remove(tr)
        ncols = max(len(r) for r in rows)
        total = int(tbl.find(q("sz")).get("width"))
        widths = [total // ncols] * ncols
        widths[-1] += total - sum(widths)
        for ri, row in enumerate(rows):
            tr = etree.SubElement(tbl, q("tr"))
            for ci in range(ncols):
                key = (min(ri, 1), 0 if ci == 0 else 2 if ci == ncols - 1 else 1)
                tc = clean(copy.deepcopy(self.tpl.cells[key]))
                tc.find(q("cellAddr")).set("colAddr", str(ci))
                tc.find(q("cellAddr")).set("rowAddr", str(ri))
                tc.find(q("cellSz")).set("width", str(widths[ci]))
                run = tc.find(f".//{q('run')}")
                for child in list(run):
                    run.remove(child)
                etree.SubElement(run, q("t")).text = row[ci] if ci < len(row) else ""
                tr.append(tc)
        tbl.set("rowCnt", str(len(rows)))
        tbl.set("colCnt", str(ncols))
        tbl.find(q("sz")).set("height", str(1280 * len(rows)))
        self.add(p)
        self.add(self.proto("blank"))

    def blocks(self, blocks: list) -> None:
        for b in blocks:
            if isinstance(b, str):
                if b.strip():
                    self.body(b.strip())
            elif "example" in b:
                self.example(b["example"])
            elif "table" in b:
                self.table(b["table"].get("caption", ""), b["table"]["rows"])
            else:
                raise SystemExit(f"알 수 없는 블록이에요: {b}")

    def chapters(self, m: dict) -> None:
        for ci, ch in enumerate(m["chapters"], 1):
            self.add(set_text(self.proto("h1"), f"{ci}. {ch['title']}"))
            self.add(self.proto("blank_h1"))
            self.blocks(ch.get("blocks", []))
            for si, sec in enumerate(ch.get("sections", []), 1):
                self.add(self.proto("blank_h1"))
                self.add(set_text(self.proto("h2"), f"{ci}.{si}. {sec['title']}"))
                self.add(self.proto("blank_h1"))
                self.blocks(sec.get("blocks", []))
                for ti, sub in enumerate(sec.get("subsections", []), 1):
                    self.add(self.proto("blank_h3"))
                    self.add(set_text(self.proto("h3"), f"{ci}.{si}.{ti} {sub['title']}"))
                    self.add(self.proto("blank_h1"))
                    self.blocks(sub.get("blocks", []))
            self.add(self.proto("blank"))

    def references(self, m: dict) -> None:
        head = self.proto("ref_head")
        head.set("pageBreak", "1")  # 참고문헌은 새 쪽에서 시작
        self.add(head)
        self.add(self.proto("ref_blank"))
        for item in m.get("references", []):
            self.add(set_text(self.proto("ref"), item))


def build(m: dict, tpl: Template) -> dict[str, bytes]:
    b = ThesisBuilder(tpl)
    b.front(m)
    b.chapters(m)
    b.references(m)

    root = tpl.root
    for child in list(root):
        root.remove(child)
    for p in b.out:
        root.append(p)

    parts = dict(tpl.parts)
    parts["Contents/section0.xml"] = etree.tostring(
        root, xml_declaration=True, encoding="UTF-8", standalone=True)
    hpf = etree.fromstring(parts["Contents/content.hpf"])
    title = hpf.find(f".//{{{OPF}}}title")
    if title is not None:
        title.text = m["title"]
    parts["Contents/content.hpf"] = etree.tostring(
        hpf, xml_declaration=True, encoding="UTF-8", standalone=True)
    # 한글이 저장할 때 넣는 미리보기 글 (파일 탐색기 미리보기·호환성용)
    preview = "\r\n".join(text_of(p) for p in b.out if text_of(p).strip())
    parts["Preview/PrvText.txt"] = preview[:1024].encode("utf-8")
    return parts


def write_package(parts: dict[str, bytes], path: Path) -> None:
    """mimetype 을 맨 앞에 압축 없이 넣는다 (hwpx 규칙)."""
    with zipfile.ZipFile(path, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), parts["mimetype"], compress_type=zipfile.ZIP_STORED)
        for name, data in parts.items():
            if name != "mimetype":
                z.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)


# ── 저장 위치·검사 ────────────────────────────────────────────────────────────
REQUIRED = ["title", "author", "chapters"]


def check_manuscript(m: dict) -> None:
    missing = [k for k in REQUIRED if not m.get(k)]
    if missing:
        sys.exit(f"원고에 빠진 항목이 있어요: {', '.join(missing)}")
    if len(m["chapters"]) < 2:
        sys.exit("장은 최소 2개(서론, 결론) 이상이어야 해요.")


def drive_root() -> Path:
    settings = REPO_ROOT / "data" / "settings.json"
    if settings.exists():
        root = json.loads(settings.read_text(encoding="utf-8")).get("driveRootPath")
        if root:
            return Path(root)
    for candidate in (Path("G:/내 드라이브"), Path("G:/My Drive")):
        if candidate.is_dir():
            return candidate
    sys.exit("구글 드라이브 폴더를 찾지 못했어요. 앱의 설정 화면에서 경로를 저장해 주세요.")


def output_path(project: str, title: str) -> Path:
    project_dir = drive_root() / APP_FOLDER / project
    if not project_dir.is_dir():
        sys.exit(f"프로젝트 폴더가 없어요: {project_dir}\n앱에서 프로젝트를 먼저 만들어 주세요.")
    ai_dir = project_dir / AI_FOLDER
    ai_dir.mkdir(exist_ok=True)
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', " ", title)
    safe = re.sub(r"\s+", " ", safe).strip().rstrip(". ")[:50] or "논문 초안"
    stem = f"{dt.date.today():%Y-%m-%d}_{safe}"
    path = ai_dir / f"{stem}.hwpx"
    n = 2
    while path.exists():  # 기존 파일은 절대 덮어쓰지 않는다
        path = ai_dir / f"{stem}_{n}.hwpx"
        n += 1
    return path


def verify(path: Path, m: dict) -> list[str]:
    """저장한 파일을 다시 열어 패키지·스키마·내용을 확인한다."""
    from hwpx import HwpxDocument
    from hwpx.tools.package_validator import validate_package

    def schema_issues(p: Path) -> set[str]:
        # "(3 times)" 같은 개수는 빼고 종류만 비교한다
        return {re.sub(r"\s*\(\d+ times?\)$", "", str(i)) for i in HwpxDocument.open(str(p)).validate().issues}

    problems = [f"패키지: {i.message}" for i in validate_package(str(path)).errors]
    # 한글이 만든 양식 파일에도 있는 스키마 경고(한글은 정상으로 여는 것)는 제외한다
    problems += [f"스키마: {i}" for i in sorted(schema_issues(path) - schema_issues(TEMPLATE))]
    text = HwpxDocument.open(str(path)).text.plain()
    for needle in [m["title"], f"1. {m['chapters'][0]['title']}", "참고문헌"]:
        if needle not in text:
            problems.append(f"내용 누락: {needle}")
    return problems


def main() -> None:
    ap = argparse.ArgumentParser(description="한국외대 논문 양식 hwpx 생성")
    ap.add_argument("manuscript", help="원고 JSON 파일")
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--project", help="앱의 프로젝트 이름 (드라이브 AI 작성글 폴더에 저장)")
    group.add_argument("--out", help="저장할 hwpx 경로 (테스트용)")
    args = ap.parse_args()

    m = json.loads(Path(args.manuscript).read_text(encoding="utf-8"))
    check_manuscript(m)
    path = Path(args.out) if args.out else output_path(args.project, m["title"])
    if args.out and path.exists():
        sys.exit(f"이미 같은 이름의 파일이 있어요: {path}")

    write_package(build(m, Template(TEMPLATE)), path)
    problems = verify(path, m)
    if problems:
        print("저장은 했지만 검사에서 문제가 발견됐어요:\n" + "\n".join(problems))
        sys.exit(1)
    print(f"저장 완료: {path}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
