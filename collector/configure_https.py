"""Add one authenticated social route to the inspected existing Caddy site."""
import copy
import datetime as dt
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

HOST = "apuracao.revline.com.br"
PUBLIC_PATH = "/redes/snapshot.json"
ORIGIN = "https://" + HOST
CONFIG = Path("/etc/caddy/Caddyfile")
ENVIRONMENT = Path("/etc/rede-camara-social.env")
BACKUPS = Path("/var/backups/rede-camara-caddy")
ADMIN_URL = "http://127.0.0.1:2019/config/"
SERVICES = ("caddy.service", "camara-web.service", "dragonwilds.service", "rede-camara-social.service")
SNIPPET = """    # Rede Camara: social collector
    reverse_proxy /redes/snapshot.json 127.0.0.1:8715 {
        rewrite /snapshot.json
    }

"""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, url):
        return None


def opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def command(arguments):
    result = subprocess.run(arguments, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError(f"Falha em {arguments[0]} {arguments[1]}; nenhuma credencial foi impressa.")
    return result.stdout


def active(service):
    return subprocess.run(["systemctl", "is-active", "--quiet", service], capture_output=True).returncode == 0


def adapt(path):
    data = json.loads(command(["caddy", "adapt", "--config", str(path), "--adapter", "caddyfile"]))
    source = str(path.resolve())

    def source_hide(value):
        # file_server automatically hides the adaptation input file. A candidate
        # has a temporary filename, but will run from CONFIG after replacement.
        if isinstance(value, dict):
            if value.get("handler") == "file_server" and isinstance(value.get("hide"), list):
                value["hide"] = [str(CONFIG.resolve()) if item == source else item for item in value["hide"]]
            for child in value.values():
                source_hide(child)
        elif isinstance(value, list):
            for child in value:
                source_hide(child)

    source_hide(data)
    return data


def loaded_config():
    with opener().open(ADMIN_URL, timeout=5) as response:
        return json.loads(response.read(2_000_001))


def canonical(value):
    if isinstance(value, list):
        return [canonical(child) for child in value]
    if not isinstance(value, dict):
        return value
    result = {key: canonical(child) for key, child in value.items()}
    if isinstance(result.get("routes"), list):
        routes = []
        for route in result["routes"]:
            if routes and set(route) == {"handle"} and set(routes[-1]) == {"handle"}:
                routes[-1]["handle"].extend(route["handle"])
            else:
                routes.append(route)
        result["routes"] = routes
    return result


def guard_routes(original, candidate):
    cleaned = copy.deepcopy(candidate)
    removed = 0

    def visit(value):
        nonlocal removed
        if isinstance(value, dict):
            if isinstance(value.get("routes"), list):
                kept = []
                for route in value["routes"]:
                    handlers = route.get("handle", [])
                    if route.get("match") == [{"path": [PUBLIC_PATH]}]:
                        expected = {"handler": "reverse_proxy", "upstreams": [{"dial": "127.0.0.1:8715"}],
                                    "rewrite": {"uri": "/snapshot.json"}}
                        if set(route) != {"match", "handle"} or handlers != [expected]:
                            raise RuntimeError("A nova rota tem uma estrutura inesperada; configuracao preservada.")
                        removed += 1
                    else:
                        kept.append(route)
                value["routes"] = kept
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(cleaned)
    if removed != 1 or canonical(cleaned) != canonical(original):
        raise RuntimeError("A alteracao afetaria outras rotas; configuracao preservada.")


def site_summary(original):
    """Report only public site addresses and import paths, never directive values."""
    report = []
    address = re.compile(r"(?:https?://)?" + re.escape(HOST) + r"(?::[0-9]+)?", re.IGNORECASE)
    for number, line in enumerate(original.splitlines(), 1):
        try:
            words = shlex.split(line.lstrip("\ufeff"), comments=True)
        except ValueError:
            continue
        sites = [word.strip('`,"') for word in words if address.fullmatch(word.strip('`,"'))]
        if sites:
            report.append({"linha": number, "enderecos": sites})
        if len(words) >= 2 and words[0] == "import":
            # Import arguments can include credentials; only show the target.
            report.append({"linha": number, "import": words[1]})
    return report


def patch_source(original):
    if PUBLIC_PATH in original:
        raise RuntimeError("A rota social ja aparece no arquivo; precisamos conferir antes de repetir.")
    pattern = re.compile(r"(?m)^\ufeff?[ \t]*(?P<quote>[\"`]?)(?:https?://)?" + re.escape(HOST) +
                         r"(?::443)?(?P=quote)[ \t]*\{[ \t]*(?:#[^\n]*)?\r?\n", re.IGNORECASE)
    matches = list(pattern.finditer(original))
    if len(matches) != 1:
        details = json.dumps(site_summary(original), ensure_ascii=False)
        raise RuntimeError("O bloco do dominio precisa ser conferido; nenhuma alteracao foi feita. "
                           "Enderecos e imports: " + details)
    insertion = matches[0].end()
    return original[:insertion] + SNIPPET + original[insertion:]


def http_status(url, token=None):
    headers = {"Authorization": "Bearer " + token} if token else {}
    request = urllib.request.Request(url, headers=headers)
    try:
        with opener().open(request, timeout=15) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def replace_config(content, metadata):
    descriptor, name = tempfile.mkstemp(prefix=".rede-camara-", suffix=".tmp", dir=CONFIG.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
            os.fchown(output.fileno(), metadata.st_uid, metadata.st_gid)
            os.fchmod(output.fileno(), stat.S_IMODE(metadata.st_mode))
        os.replace(temporary, CONFIG)
    finally:
        temporary.unlink(missing_ok=True)


def activate(original_bytes, candidate, metadata, page_before, before, token):
    replace_config(candidate, metadata)
    try:
        command(["caddy", "reload", "--config", str(CONFIG), "--adapter", "caddyfile"])
        public = http_status(ORIGIN + PUBLIC_PATH)
        authorized = http_status(ORIGIN + PUBLIC_PATH, token)
        if public != 401 or authorized not in (200, 503):
            raise RuntimeError("A verificacao HTTPS do coletor falhou.")
        if http_status(ORIGIN + "/") != page_before:
            raise RuntimeError("A resposta da apresentacao eleitoral mudou.")
        if {service: active(service) for service in SERVICES} != before:
            raise RuntimeError("O estado de um servico mudou.")
    except Exception:
        replace_config(original_bytes, metadata)
        try:
            command(["caddy", "reload", "--config", str(CONFIG), "--adapter", "caddyfile"])
        except Exception:
            raise RuntimeError("Caddyfile restaurado, mas a recarga de restauracao falhou; envie esta mensagem.")
        raise RuntimeError("A verificacao falhou. Caddyfile anterior restaurado e recarregado; envie esta mensagem.")
    return public, authorized


def main():
    if os.geteuid() != 0 or not shutil.which("caddy"):
        raise RuntimeError("Execute como root no VPS com Caddy instalado.")
    os.umask(0o077)
    if CONFIG.is_symlink() or not CONFIG.is_file() or ENVIRONMENT.is_symlink():
        raise RuntimeError("Os caminhos de configuracao precisam ser conferidos.")
    metadata = CONFIG.stat()
    if metadata.st_uid != 0:
        raise RuntimeError("O proprietario do Caddyfile precisa ser conferido.")
    start = command(["systemctl", "show", "caddy", "--property=ExecStart", "--value"])
    if not re.search(r"--config(?:=|\s+)" + re.escape(str(CONFIG)) + r"(?=\s|;|\}|$)", start):
        raise RuntimeError("O Caddy usa outro arquivo na inicializacao; precisamos conferir.")
    settings = dict(line.split("=", 1) for line in ENVIRONMENT.read_text().splitlines()
                    if line and not line.startswith("#") and "=" in line)
    token = settings.get("COLLECTOR_READ_TOKEN", "")
    if len(token) < 32:
        raise RuntimeError("A credencial do coletor precisa ser conferida no servidor.")
    before = {service: active(service) for service in SERVICES}
    if not before["caddy.service"] or not before["rede-camara-social.service"]:
        raise RuntimeError("Caddy e coletor precisam estar ativos.")
    original_bytes = CONFIG.read_bytes()
    candidate = patch_source(original_bytes.decode()).encode()
    original = adapt(CONFIG)
    if loaded_config() != original:
        raise RuntimeError("A configuracao ativa difere do arquivo; nenhuma alteracao foi feita.")
    page_before = http_status(ORIGIN + "/")
    with tempfile.NamedTemporaryFile(prefix=".rede-camara-validate-", suffix=".tmp", dir=CONFIG.parent) as test:
        test.write(candidate)
        test.flush()
        guard_routes(original, adapt(Path(test.name)))
        command(["caddy", "validate", "--config", test.name, "--adapter", "caddyfile"])
    if CONFIG.read_bytes() != original_bytes or loaded_config() != original:
        raise RuntimeError("A configuracao mudou durante a verificacao; nenhuma alteracao foi feita.")
    if BACKUPS.is_symlink():
        raise RuntimeError("O diretorio de backup precisa ser conferido.")
    BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
    BACKUPS.chmod(0o700)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = BACKUPS / ("Caddyfile-" + stamp)
    with backup.open("xb") as output:
        output.write(original_bytes)
        os.fchmod(output.fileno(), 0o600)
    public, authorized = activate(original_bytes, candidate, metadata, page_before, before, token)
    print("Fonte HTTPS: " + ORIGIN + PUBLIC_PATH)
    print(f"Sem credencial: HTTP {public}; com credencial: HTTP {authorized}")
    print(f"Apresentacao eleitoral: HTTP {page_before}; estados dos servicos preservados.")
    print("Backup: " + str(backup))
    print("Proxima etapa: autorizar redes e conectar a fonte ao painel.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        message = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print("ERRO: " + message, file=sys.stderr)
        sys.exit(1)
