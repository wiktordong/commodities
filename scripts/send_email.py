"""Email today's brief as HTML.

Reads SMTP config from environment variables (set as GitHub Actions secrets):
  EMAIL_SMTP_HOST   e.g. smtp.gmail.com
  EMAIL_SMTP_PORT   e.g. 587
  EMAIL_USER        SMTP username (also From address)
  EMAIL_PASS        SMTP password / app password
  EMAIL_TO          comma-separated recipient list
"""

from __future__ import annotations

import datetime as dt
import os
import smtplib
import sys
from email.message import EmailMessage

from generate_brief import render


def main() -> int:
    archive_path, html, today = render()

    host = os.environ.get("EMAIL_SMTP_HOST")
    port = int(os.environ.get("EMAIL_SMTP_PORT", "587"))
    user = os.environ.get("EMAIL_USER")
    password = os.environ.get("EMAIL_PASS")
    to = os.environ.get("EMAIL_TO")

    if not all([host, user, password, to]):
        print("SMTP env vars missing; skipping email send.", file=sys.stderr)
        return 0

    msg = EmailMessage()
    msg["Subject"] = f"Asia Commodities Morning Brief — {today}"
    msg["From"] = user
    msg["To"] = to
    msg.set_content("Your email client does not support HTML. See attached.")
    msg.add_alternative(html, subtype="html")

    with smtplib.SMTP(host, port) as s:
        s.starttls()
        s.login(user, password)
        s.send_message(msg)

    print(f"Sent brief for {today} to {to}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
