"""First installation on an inspected Ubuntu VPS; leaves existing services intact."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

REVISION = "9e06dc69938f4144453d7452f9bd59fc5c6430ad"
BASE = f"https://raw.githubusercontent.com/groibs/painel-redes-camara/{REVISION}/collector/"
HASHES = {
    "collector.py": "81c8a1d4d543f62a2543085e8c58f6c056e6e0f1d474c1ef0914666b4702be37",
    "rede-camara-social.service": "11556dd97cb9bff4d32264bb4bd9515faf9a7294c17ef3dc6af5a368e6318362",
    ".env.example": "5953bb3a1780e3de7561929bc86831de64c7499a9096e6776171a80c818c1c90",
}
APP = Path("/opt/rede-camara-social")
CONFIG = Path("/etc/rede-camara-social.env")
UNIT = Path("/etc/systemd/system/rede-camara-social.service")
SERVICE = "rede-camara-social.service"
USER = "rede-camara-social"
OTHER_SERVICES = ("caddy.service", "camara-web.service", "dragonwilds.service")


def command(args, check=True):
    result = subprocess.run(args, capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(f"Comando falhou: {args[0]} {args[1]}")
    return result


def active(service):
    return command(["systemctl", "is-active", "--quiet", service], check=False).returncode == 0


def write_new(path, content, mode):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(descriptor, "wb") as output:
        output.write(content)
        os.fchmod(output.fileno(), mode)


def http_status(opener, token=None):
    headers = {"Authorization": "Bearer " + token} if token else {}
    request = urllib.request.Request("http://127.0.0.1:8715/snapshot.json", headers=headers)
    try:
        with opener.open(request, timeout=2) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def verify(token):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for attempt in range(40):
        try:
            public_status = http_status(opener)
            authorized_status = http_status(opener, token)
            break
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt == 39:
                raise RuntimeError("O coletor nao respondeu. Verifique systemctl status rede-camara-social.")
            time.sleep(0.25)
    if public_status != 401 or authorized_status not in (200, 503) or not active(SERVICE):
        raise RuntimeError("A verificacao do servico ou da autenticacao falhou.")
    print("Coletor: ativo em 127.0.0.1:8715")
    print(f"Sem credencial: HTTP {public_status}; com credencial: HTTP {authorized_status}")
    if authorized_status == 503:
        print("Aguardando autorizacao das redes sociais; HTTP 503 e esperado nesta etapa.")


def caddy_hosts():
    config = Path("/etc/caddy/Caddyfile")
    if not config.is_file() or not shutil.which("caddy"):
        print("Caddy: precisamos conferir o caminho da configuracao.")
        return
    result = command(["caddy", "adapt", "--config", str(config), "--adapter", "caddyfile"], check=False)
    try:
        data = json.loads(result.stdout) if result.returncode == 0 else None
    except ValueError:
        data = None
    hosts = set()

    def visit(value):
        if isinstance(value, dict):
            if isinstance(value.get("host"), list):
                hosts.update(host for host in value["host"] if isinstance(host, str))
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(data)
    print("Dominios no Caddy: " + (", ".join(sorted(hosts)) or "nenhum identificado; conferir configuracao"))


def main():
    if os.geteuid() != 0:
        raise RuntimeError("Execute como root no VPS.")
    if sys.version_info < (3, 12):
        raise RuntimeError("Python 3.12 ou superior e necessario.")
    for name in ("systemctl", "systemd-analyze", "useradd"):
        if not shutil.which(name):
            raise RuntimeError(f"Comando necessario nao encontrado: {name}")
    os.umask(0o077)
    if any(path.exists() or path.is_symlink() for path in (APP, CONFIG, UNIT)):
        raise RuntimeError("Ja existem arquivos do coletor. Instalacao interrompida para preservar a configuracao; envie esta mensagem.")
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", 8715))
        except OSError:
            raise RuntimeError("A porta local 8715 esta ocupada; instalacao interrompida.")
    before = {name: active(name) for name in OTHER_SERVICES}
    if active(SERVICE):
        raise RuntimeError("Ja existe um coletor ativo; instalacao interrompida.")
    try:
        user = pwd.getpwnam(USER)
        if user.pw_uid == 0 or user.pw_gid == 0 or user.pw_shell not in ("/usr/sbin/nologin", "/sbin/nologin", "/bin/false"):
            raise RuntimeError("O usuario de servico existente precisa ser conferido.")
    except KeyError:
        user = None
    print("Baixando arquivos da versao verificada...", flush=True)
    files = {}
    for name, expected in HASHES.items():
        with urllib.request.urlopen(BASE + name, timeout=20) as response:
            content = response.read(100_001)
        if len(content) > 100_000 or hashlib.sha256(content).hexdigest() != expected:
            raise RuntimeError(f"Verificacao do arquivo falhou: {name}")
        files[name] = content
    compile(files["collector.py"], "collector.py", "exec")
    with tempfile.TemporaryDirectory(prefix="rede-camara-check-") as temporary:
        unit = Path(temporary) / SERVICE
        unit.write_bytes(files[SERVICE])
        command(["systemd-analyze", "verify", str(unit)])
    if user is None:
        command(["useradd", "--system", "--user-group", "--home-dir", "/var/lib/rede-camara-social",
                 "--no-create-home", "--shell", "/usr/sbin/nologin", USER])
    APP.mkdir(mode=0o755)
    APP.chmod(0o755)
    token = secrets.token_urlsafe(48)
    environment = files[".env.example"].replace(b"COLLECTOR_READ_TOKEN=\n", f"COLLECTOR_READ_TOKEN={token}\n".encode(), 1)
    write_new(CONFIG, environment, 0o600)
    write_new(APP / "collector.py", files["collector.py"], 0o644)
    write_new(UNIT, files[SERVICE], 0o644)
    command(["systemctl", "daemon-reload"])
    command(["systemctl", "enable", "--now", SERVICE])
    verify(token)
    for name, was_active in before.items():
        if active(name) != was_active:
            raise RuntimeError(f"O estado de {name} mudou; precisamos conferir.")
    print("Credencial salva em /etc/rede-camara-social.env, com permissao 0600.")
    print("Caddy, apresentacao eleitoral e Dragonwilds: estados preservados.")
    caddy_hosts()
    print("Proxima etapa: dominio HTTPS e credenciais autorizadas das redes sociais.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        if isinstance(error, RuntimeError):
            print(f"ERRO: {error}", file=sys.stderr)
        else:
            print(f"ERRO: {type(error).__name__}. Instalacao incompleta; envie esta mensagem.", file=sys.stderr)
        sys.exit(1)
