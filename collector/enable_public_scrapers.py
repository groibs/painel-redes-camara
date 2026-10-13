"""Enable public follower scrapers on an existing Rede Câmara collector install."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request

APP = Path("/opt/rede-camara-social")
COLLECTOR = APP / "collector.py"
VENDOR = APP / "vendor"
ENV_FILE = Path("/etc/rede-camara-social.env")
DB = Path("/var/lib/rede-camara-social/collector.sqlite3")
SERVICE = "rede-camara-social.service"
BASE = "https://raw.githubusercontent.com/groibs/painel-redes-camara/main/collector/"

UPDATES = {
    "PYTHONPATH": str(VENDOR),
    "FOLLOWERS_INTERVAL_SECONDS": "900",
    "PUBLIC_FOLLOWERS_INTERVAL_SECONDS": "900",
    "INSTAGRAM_HANDLE": "camaradosdeputados",
    "INSTAGRAM_POSTS_ENABLED": "0",
    "FACEBOOK_HANDLE": "camaradeputados",
    "TIKTOK_HANDLE": "camaradosdeputados",
    "YOUTUBE_HANDLE": "camaradosdeputadosoficial",
    "X_HANDLE": "camaradeputados",
}


def run(args: list[str]) -> None:
    subprocess.run(args, check=True)


def fetch(name: str, limit: int = 500_000) -> bytes:
    request = urllib.request.Request(
        BASE + name,
        headers={"User-Agent": "RedeCamaraUpdater/1"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read(limit + 1)
    if len(body) > limit:
        raise RuntimeError(f"{name} excedeu o limite esperado")
    return body


def update_env() -> None:
    original = ENV_FILE.read_text()
    lines = original.splitlines()
    output: list[str] = []
    seen: set[str] = set()

    for line in lines:
        if "=" in line and not line.lstrip().startswith("#"):
            key = line.split("=", 1)[0].strip()
            if key in UPDATES:
                output.append(f"{key}={UPDATES[key]}")
                seen.add(key)
                continue
        output.append(line)

    for key, value in UPDATES.items():
        if key not in seen:
            output.append(f"{key}={value}")

    backup = ENV_FILE.with_name(ENV_FILE.name + f".bak-public-{int(time.time())}")
    shutil.copy2(ENV_FILE, backup)
    ENV_FILE.write_text("\n".join(output) + "\n")
    ENV_FILE.chmod(0o600)


def read_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in ENV_FILE.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value
    return values


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit("Execute como root.")

    for path in (COLLECTOR, ENV_FILE, DB):
        if not path.exists():
            raise SystemExit(f"Instalação existente não encontrada: {path}")

    print("=== BAIXANDO COLETOR PÚBLICO ===", flush=True)
    collector = fetch("collector.py")
    requirements = fetch("requirements.txt", 50_000)
    compile(collector, "collector.py", "exec")

    VENDOR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="rede-camara-update-") as temp:
        req = Path(temp) / "requirements.txt"
        req.write_bytes(requirements)
        run([
            sys.executable,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--no-input",
            "--upgrade",
            "--target",
            str(VENDOR),
            "-r",
            str(req),
        ])

    stamp = time.strftime("%Y%m%d-%H%M%S")
    shutil.copy2(COLLECTOR, COLLECTOR.with_name(f"collector.py.bak-{stamp}"))
    COLLECTOR.write_bytes(collector)
    COLLECTOR.chmod(0o644)
    update_env()

    print("=== FORÇANDO CONTADORES ===", flush=True)
    with sqlite3.connect(DB) as db:
        for key in ("instagram", "facebook", "tiktok", "x", "youtube"):
            db.execute("DELETE FROM attempts WHERE key=?", (key,))
        db.commit()

    run(["systemctl", "restart", SERVICE])
    time.sleep(18)

    state = subprocess.run(
        ["systemctl", "is-active", SERVICE],
        text=True,
        capture_output=True,
        check=False,
    ).stdout.strip()
    print("Serviço:", state)

    env = read_env()
    token = env.get("COLLECTOR_READ_TOKEN", "")
    request = urllib.request.Request(
        "http://127.0.0.1:8715/snapshot.json",
        headers={"Authorization": "Bearer " + token},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        snapshot = json.load(response)

    print("\n=== REDES ATUAIS ===")
    for account in snapshot.get("accounts", []):
        print(
            f"{account.get('name', ''):12} "
            f"{str(account.get('followers')):12} "
            f"{account.get('updatedAt') or ''}"
        )
    print("Posts Instagram preservados:", len(snapshot.get("posts", [])))

    print("\n=== LOG RECENTE ===")
    result = subprocess.run(
        ["journalctl", "-u", SERVICE, "--since", "2 minutes ago", "--no-pager"],
        text=True,
        capture_output=True,
        check=False,
    )
    for line in result.stdout.splitlines():
        if any(name in line.lower() for name in ("instagram", "facebook", "tiktok", "youtube", " x ")):
            print(line)


if __name__ == "__main__":
    main()
