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
    # Public Instagram readings are attempted daily, but an unchanged
    # embed can be an old cached count rather than a current measurement.
    instagram = snapshot.get("instagram")
    public = instagram.get("publicFollowers") if isinstance(instagram, dict) else None
    public_checked = parse_date(instagram.get("publicCheckedAt")) if isinstance(instagram, dict) else None
    public_changed = parse_date(instagram.get("publicCountChangedAt")) if isinstance(instagram, dict) else None
    if type(public) is not int or public < 1000 or public > 10**9:
        errors.append("instagram: sem leitura do contador público")
    elif (not public_checked or
          not dt.timedelta(0) <= now - public_checked <= max_age):
        errors.append("instagram: leitura pública com mais de 26 horas")
    elif (not public_changed or
          now - public_changed > dt.timedelta(hours=72)):
        errors.append("instagram: contador público sem alteração por mais de 72 horas; possível cache desatualizado")
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
    print("Coleta diária saudável: X, TikTok, Facebook, YouTube e consulta pública do Instagram.")
    print("Instagram: a consulta pública é auditada; contador manual só muda após validação de uma nova leitura.")


if __name__ == "__main__":
    main()
