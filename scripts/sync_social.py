#!/usr/bin/env python3
"""Scheduled public social collection. No VPS, Meta token, or browser login.

GitHub Actions writes the last known source values to a dedicated data branch
and optionally mirrors the same snapshot/history into a dedicated Supabase DB.
Public sources can fail; a previous count keeps its *original* observation time.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import sys
import urllib.request
import urllib.error
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
UTC = dt.timezone.utc
SOURCES = ("instagram", "x", "telegram", "youtube", "tiktok", "facebook")
FOLLOWER_SOURCES = ("instagram", "x", "youtube", "tiktok", "facebook")
MAX_AGE_DAYS = 7


def parse_date(value):
    try:
        date = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return date.astimezone(UTC) if date.tzinfo else None
    except (ValueError, TypeError, OverflowError):
        return None


def read_json(path, default):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else default
    except (FileNotFoundError, ValueError, OSError):
        return default


def write_json(path, data):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def usable_value(source, value):
    if not isinstance(value, dict):
        return False
    if source == "telegram":
        return isinstance(value.get("posts"), list) and bool(value["posts"])
    if source in FOLLOWER_SOURCES:
        return type(value.get("followers")) is int and 0 <= value["followers"] < 10**12
    return False


def merge_collection(fresh, previous):
    now = parse_date(fresh.get("collectedAt")) or dt.datetime.now(UTC)
    stamp = now.isoformat()
    old_stamp = previous.get("collectedAt")
    result = {
        "collectedAt": stamp,
        **{name: None for name in SOURCES},
        "errors": fresh.get("errors") if isinstance(fresh.get("errors"), dict) else {},
    }
    fresh_names = set()
    for name in SOURCES:
        value = fresh.get(name)
        if usable_value(name, value):
            result[name] = {**value, "observedAt": stamp}
            fresh_names.add(name)
        else:
            value = previous.get(name)
            if usable_value(name, value):
                observed_at = parse_date(value.get("observedAt") or old_stamp)
                if observed_at and now - observed_at <= dt.timedelta(days=MAX_AGE_DAYS):
                    result[name] = {**value, "observedAt": observed_at.isoformat()}
    if all(result[name] is None for name in SOURCES):
        raise RuntimeError("Nenhuma fonte atual ou histórico recente disponível")
    return result, fresh_names


def update_history(previous, result, fresh_names):
    now = parse_date(result["collectedAt"])
    rows = previous.get("samples")
    if not isinstance(rows, list):
        rows = []
    cutoff = now - dt.timedelta(days=MAX_AGE_DAYS)
    samples = [
        item for item in rows
        if isinstance(item, dict)
        and item.get("network") in FOLLOWER_SOURCES
        and type(item.get("followers")) is int
        and (date := parse_date(item.get("collectedAt"))) is not None
        and cutoff <= date <= now
    ]
    created = []
    for name in FOLLOWER_SOURCES:
        source = result.get(name)
        if name not in fresh_names or not usable_value(name, source):
            continue
        row = {
            "network": name,
            "followers": source["followers"],
            "collectedAt": result["collectedAt"],
        }
        samples.append(row)
        created.append(row)
        target = now - dt.timedelta(hours=24)
        nearby = [
            s for s in samples if s["network"] == name
            and abs((parse_date(s["collectedAt"]) - target).total_seconds()) <= 5400
        ]
        # YouTube publishes rounded subscribers (1.50M), so a delta from
        # that display count would be misleading even with two samples.
        if nearby and name != "youtube":
            baseline = min(nearby, key=lambda s: abs((parse_date(s["collectedAt"]) - target).total_seconds()))
            source["change24h"] = source["followers"] - baseline["followers"]
        else:
            source["change24h"] = None
    return {"schemaVersion": 1, "samples": samples[-650:]}, created


def post_json(url, key, endpoint, payload, prefer):
    base = urlsplit(url)
    if base.scheme != "https" or not base.hostname or not base.hostname.endswith(".supabase.co"):
        raise ValueError("SUPABASE_URL deve ser https://<projeto>.supabase.co")
    full_url = url.rstrip("/") + "/rest/v1/" + endpoint
    headers = {
        "apikey": key,
        "Content-Type": "application/json",
        "Prefer": prefer,
    }
    # Legacy service-role JWT requires Authorization; new sb_secret keys only
    # need the gateway's apikey header.
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(
        full_url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            if res.status not in (200, 201, 204):
                raise RuntimeError("Supabase recusou gravar o snapshot")
    except urllib.error.HTTPError as exc:
        # Do not dump API response bodies, which might include sensitive details.
        raise RuntimeError(f"Supabase HTTP {exc.code}") from None


def mirror_supabase(result, history_rows):
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url and not key:
        print("Supabase não configurado; snapshot persistido no GitHub.")
        return False
    if not url or not key:
        raise RuntimeError("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY juntos")
    post_json(
        url, key, "camara_social_snapshots?on_conflict=id",
        [{
            "id": "camara",
            "collected_at": result["collectedAt"],
            "payload": result,
            "updated_at": result["collectedAt"],
        }],
        "resolution=merge-duplicates,return=minimal",
    )
    if history_rows:
        post_json(
            url, key, "camara_social_follower_history?on_conflict=network,collected_at",
            [{
                "network": row["network"],
                "collected_at": row["collectedAt"],
                "followers": row["followers"],
            } for row in history_rows],
            "resolution=ignore-duplicates,return=minimal",
        )
    print("Snapshot e histórico enviados ao Supabase.")
    return True


def collect_other_public_profiles():
    """Other verified Câmara accounts; failure does not invalidate the job."""
    from concurrent.futures import ThreadPoolExecutor
    from collector.collector import fetch_component

    handles = {
        "youtube": "camaradosdeputadosoficial",
        "tiktok": "camaradosdeputados",
        "facebook": "camaradeputados",
    }
    def read(name):
        try:
            profile = fetch_component(name, {name.upper() + "_HANDLE": handles[name]})
            if profile.get("id") == name and usable_value(name, profile):
                return name, {
                    "handle": profile["handle"],
                    "followers": profile["followers"],
                }, None
        except Exception as exc:
            return name, None, type(exc).__name__
        return name, None, "invalid_profile"

    with ThreadPoolExecutor(max_workers=3) as pool:
        return list(pool.map(read, handles))


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--previous", default="social-data/social/snapshot.json")
    parser.add_argument("--history", default="social-data/social/history.json")
    parser.add_argument("--output", default="social-data/social/snapshot.json")
    parser.add_argument("--history-output", default="social-data/social/history.json")
    parser.add_argument("--fixture", help="Fixture JSON para teste local, nunca para produção")
    args = parser.parse_args(argv)

    if args.fixture:
        fresh = read_json(args.fixture, {})
    else:
        # Import only in production: it uses curl_cffi, already included in
        # requirements.txt, and reuses the tested Vercel public collectors.
        from api.social_public import collect
        status, fresh = collect()
        if status not in (200, 503) or not isinstance(fresh, dict):
            raise RuntimeError("Coletor retornou resposta inválida")
        for name, profile, error in collect_other_public_profiles():
            fresh[name] = profile
            if error:
                fresh.setdefault("errors", {})[name] = error
    previous = read_json(args.previous, {})
    history = read_json(args.history, {})
    merged, fresh_names = merge_collection(fresh, previous)
    updated_history, rows = update_history(history, merged, fresh_names)
    write_json(args.output, merged)
    write_json(args.history_output, updated_history)
    # Do not log media URLs or credentials.
    print("Fontes atualizadas:", ", ".join(sorted(fresh_names)) or "nenhuma")
    for name in SOURCES:
        item = merged.get(name)
        print(f"{name}: " + ("preservado " + str(item.get("observedAt", "")) if name not in fresh_names and item else "atualizado" if item else "indisponível"))
    try:
        mirror_supabase(merged, rows)
    except Exception as exc:
        # GitHub persistence remains functional even if the optional database
        # is unavailable. Report a warning without exposing response bodies.
        print(f"::warning::Espelhamento Supabase indisponível ({type(exc).__name__}); GitHub preservado")


if __name__ == "__main__":
    main()
