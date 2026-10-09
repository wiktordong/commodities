"""Render the daily brief HTML and update the archive index."""

from __future__ import annotations

import datetime as dt
import pathlib

from jinja2 import Environment, FileSystemLoader, select_autoescape

from fetch_data import fetch_all


ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"
PUBLIC = ROOT / "public"
BRIEFS = PUBLIC / "briefs"


def render() -> tuple[pathlib.Path, str, str]:
    PUBLIC.mkdir(exist_ok=True)
    BRIEFS.mkdir(exist_ok=True)

    data = fetch_all()
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES)),
        autoescape=select_autoescape(["html"]),
    )
    tmpl = env.get_template("brief.html.j2")
    html = tmpl.render(**data)

    today = dt.datetime.utcnow().strftime("%Y-%m-%d")
    archive_path = BRIEFS / f"{today}.html"
    archive_path.write_text(html, encoding="utf-8")

    # Latest copy at site root.
    (PUBLIC / "index.html").write_text(html, encoding="utf-8")

    # Rebuild archive listing.
    items = sorted(BRIEFS.glob("*.html"), reverse=True)
    rows = "\n".join(
        f'<li><a href="briefs/{p.name}">{p.stem}</a></li>' for p in items
    )
    archive_html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Brief Archive</title>
<style>body{{font-family:Georgia,serif;max-width:720px;margin:24px auto;padding:0 18px;}}
h1{{font-size:20px;border-bottom:2px solid #1a1a1a;padding-bottom:8px;}}
li{{margin:4px 0;font-size:14px;}}a{{color:#0b3d91;text-decoration:none;}}
a:hover{{text-decoration:underline;}}</style></head>
<body><h1>Daily Asia Commodities Morning Brief — Archive</h1>
<p><a href="index.html">&larr; Latest brief</a></p>
<ul>{rows}</ul></body></html>"""
    (PUBLIC / "archive.html").write_text(archive_html, encoding="utf-8")

    return archive_path, html, today


if __name__ == "__main__":
    path, _, today = render()
    print(f"Wrote {path}")
