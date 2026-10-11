from __future__ import annotations

import html
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "contracts" / "software-license-service-agreement-cn.md"
TARGET = ROOT / "contracts" / "software-license-service-agreement-cn.html"


def inline_markup(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    return escaped


def list_depth(line: str) -> int:
    leading = len(line) - len(line.lstrip(" "))
    return 1 if leading >= 3 else 0


def close_lists(parts: list[str], stack: list[str], target_depth: int = -1) -> None:
    while len(stack) - 1 > target_depth:
        parts.append(f"</{stack.pop()}>")


def markdown_to_html(markdown: str) -> str:
    parts: list[str] = []
    stack: list[str] = []

    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()

        if not line.strip():
            close_lists(parts, stack)
            continue

        if line == "---":
            close_lists(parts, stack)
            parts.append("<hr>")
            continue

        if line.startswith("# "):
            close_lists(parts, stack)
            parts.append(f"<h1>{inline_markup(line[2:].strip())}</h1>")
            continue

        if line.startswith("## "):
            close_lists(parts, stack)
            title = line[3:].strip()
            cls = " class=\"signature-heading\"" if title == "签署页" else ""
            parts.append(f"<h2{cls}>{inline_markup(title)}</h2>")
            continue

        if re.match(r"^\s*\d+\.\s+", line):
            depth = list_depth(line)
            text = re.sub(r"^\s*\d+\.\s+", "", line)
            while len(stack) <= depth:
                parts.append("<ol>")
                stack.append("ol")
            close_lists(parts, stack, depth)
            parts.append(f"<li>{inline_markup(text.strip())}</li>")
            continue

        if re.match(r"^\s*-\s+", line):
            depth = list_depth(line)
            text = re.sub(r"^\s*-\s+", "", line)
            while len(stack) <= depth:
                parts.append("<ul>")
                stack.append("ul")
            close_lists(parts, stack, depth)
            parts.append(f"<li>{inline_markup(text.strip())}</li>")
            continue

        close_lists(parts, stack)
        parts.append(f"<p>{inline_markup(line.strip())}</p>")

    close_lists(parts, stack)
    body = "\n".join(parts)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>软件系统授权使用及技术服务合同</title>
  <style>
    @page {{
      size: Letter;
      margin: 1in;
    }}
    body {{
      color: #111827;
      font-family: "Arial", "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 11pt;
      line-height: 1.35;
    }}
    h1 {{
      text-align: center;
      font-size: 22pt;
      line-height: 1.25;
      margin: 0 0 24pt 0;
      color: #111827;
      font-weight: 700;
    }}
    h2 {{
      font-size: 14pt;
      margin: 18pt 0 8pt 0;
      color: #1f4d78;
      font-weight: 700;
      page-break-after: avoid;
    }}
    h2.signature-heading {{
      page-break-before: always;
    }}
    p {{
      margin: 0 0 7pt 0;
    }}
    ol, ul {{
      margin-top: 0;
      margin-bottom: 7pt;
      padding-left: 28pt;
    }}
    li {{
      margin: 0 0 4pt 0;
      padding-left: 2pt;
    }}
    hr {{
      border: 0;
      border-top: 1px solid #d1d5db;
      margin: 18pt 0;
    }}
    code {{
      font-family: "Courier New", monospace;
      font-size: 10pt;
    }}
  </style>
</head>
<body>
{body}
</body>
</html>
"""


def main() -> None:
    TARGET.write_text(markdown_to_html(SOURCE.read_text(encoding="utf-8")), encoding="utf-8")
    print(TARGET)


if __name__ == "__main__":
    main()
