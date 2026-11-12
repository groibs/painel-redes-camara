#!/usr/bin/env python3
"""Verify daily collection freshness. Fails loudly without inventing counts."""
import argparse
import datetime as dt
import json
from pathlib import Path

from scripts.sync_social import parse_date

UTC = dt.timezone.utc
FOLLOWER_SOURCES = ("x", "tiktok", "facebook", "youtube")
MAX_FRESHNESS = dt.timedelta(hours=26)


def freshness_problems(snapshot, now=None, max_age=MAX_FRESHNESS):
    now = now or dt.datetime.now(UTC)
    errors = []
    for name in FOLLOWER_SOURCES:
        item = snapshot.get(name)
        if not isinstance(item, dict) or type(item.get("followers")) is not int:
            errors.append(name + ": sem contagem válida")
            continue
        observed_at = parse_date(item.get("observedAt"))
        if not observed_at or not dt.timedelta(0) <= now - observed_at <= max_age:
            errors.append(name + ": coleta com mais de 26 horas ou data inválida")
    # Without Meta authorization, Instagram followers are deliberately manual.
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", default="social-data/social/snapshot.json")
    args = parser.parse_args()
    data = json.loads(Path(args.snapshot).read_text(encoding="utf-8"))
    issues = freshness_problems(data)
    if issues:
        for message in issues:
            print("::error::" + message)
        raise SystemExit(1)
    print("Coleta diária saudável: X, TikTok, Facebook e YouTube foram observados nas últimas 26 horas.")
    print("Instagram: contador manual; depende de futura autorização Meta.")


if __name__ == "__main__":
    main()
