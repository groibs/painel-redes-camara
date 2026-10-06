"""Route and rollback checks; all configuration writes stay in temporary paths."""
import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import configure_https as https

ORIGINAL = """# Preserve the existing presentation and plain HTTP server
apuracao.revline.com.br {
    encode gzip zstd
    reverse_proxy 127.0.0.1:4173
}
:80 {
    root * /var/www/html
    file_server
}
"""


class HttpsTests(unittest.TestCase):
    def test_candidate_source_filename_is_normalized_without_changing_other_hidden_files(self):
        candidate = Path("/tmp/candidate-caddyfile")
        data = {"handle": [{"handler": "file_server", "hide": [str(candidate), "/private-config.ini"]}]}
        with patch.object(https, "command", return_value=json.dumps(data)):
            result = https.adapt(candidate)
        self.assertEqual(result["handle"][0]["hide"], [str(https.CONFIG.resolve()), "/private-config.ini"])

    def test_source_patch_preserves_all_existing_content_and_rejects_ambiguity(self):
        changed = https.patch_source(ORIGINAL)
        self.assertEqual(changed.replace(https.SNIPPET, "", 1), ORIGINAL)
        with self.assertRaisesRegex(RuntimeError, "ja aparece"):
            https.patch_source(changed)
        with self.assertRaisesRegex(RuntimeError, "conferido"):
            https.patch_source(ORIGINAL + "apuracao.revline.com.br {\n}\n")

    def test_equivalent_explicit_tls_and_quoted_site_addresses_preserve_source(self):
        for address in ("apuracao.revline.com.br:443", "https://apuracao.revline.com.br:443",
                        '"apuracao.revline.com.br:443"', "`https://apuracao.revline.com.br:443`",
                        "APURACAO.REVLINE.COM.BR:443"):
            with self.subTest(address=address):
                original = ORIGINAL.replace("apuracao.revline.com.br {", address + " {")
                changed = https.patch_source(original)
                self.assertEqual(changed.replace(https.SNIPPET, "", 1), original)

    def test_unknown_header_diagnostics_do_not_expose_import_arguments_or_directive_secrets(self):
        original = "import /etc/caddy/sites/*.caddy private-token\n" \
                   "# apuracao.revline.com.br ignored-comment-secret\n" \
                   "basic_auth {\n  user private-password-hash\n}\n"
        with self.assertRaises(RuntimeError) as caught:
            https.patch_source(original)
        message = str(caught.exception)
        self.assertIn("/etc/caddy/sites/*.caddy", message)
        self.assertNotIn("private-token", message)
        self.assertNotIn("private-password-hash", message)
        self.assertNotIn("ignored-comment-secret", message)

    def test_imported_candidate_preserves_main_arguments_comments_and_relative_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            main, site = root / "Caddyfile", root / "camara-reserva.caddy"
            for address in (str(site), '"' + str(site) + '"', '`' + str(site) + '`', site.name):
                with self.subTest(address=address), patch.object(https, "CONFIG", main), patch.object(https, "SITE", site):
                    prefix = ':80 {\n    file_server\n}\n\timport '
                    suffix = ' private-import-argument # preserve this comment\n'
                    source = prefix + address + suffix
                    main.write_text(source)
                    site.write_text(ORIGINAL)
                    candidate = https.patch_source(ORIGINAL).encode()
                    self.assertEqual(https.source_target(source), site)
                    with https.candidate_config(source, site, candidate) as (test, aliases):
                        self.assertEqual(main.read_text(), source)
                        self.assertEqual(site.read_text(), ORIGINAL)
                        self.assertEqual(len(aliases), 1)
                        imported = Path(next(iter(aliases)))
                        self.assertEqual(imported.parent, site.parent)
                        self.assertEqual(imported.read_bytes(), candidate)
                        self.assertEqual(test.parent, main.parent)
                        self.assertEqual(test.read_text(), prefix + '"' + str(imported) + '"' + suffix)
                    self.assertFalse(test.exists())
                    self.assertFalse(imported.exists())
                    with self.assertRaisesRegex(RuntimeError, "mais de um import"):
                        https.source_target(source + 'import ' + str(site) + '\n')
                    self.assertEqual(https.source_target('# import ' + str(site) + '\n'), main)

    @unittest.skipUnless(shutil.which("caddy"), "Caddy binary is required for adaptation integration")
    def test_genuine_caddy_validates_complete_imported_configuration(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            main, site = root / "Caddyfile", root / "camara-reserva.caddy"
            source = ':80 {\n    root * /var/www/html\n    file_server\n}\nimport camara-reserva.caddy\n'
            imported = 'apuracao.revline.com.br {\n    import encoder.caddy\n    reverse_proxy 127.0.0.1:4173\n}\n'
            (root / "encoder.caddy").write_text("encode gzip zstd\n")
            main.write_text(source)
            site.write_text(imported)
            with patch.object(https, "CONFIG", main), patch.object(https, "SITE", site):
                original = https.adapt(main)
                candidate = https.patch_source(imported).encode()
                with https.candidate_config(source, site, candidate) as (test, aliases):
                    https.guard_routes(original, https.adapt(test, aliases))
                    https.command(["caddy", "validate", "--config", str(test), "--adapter", "caddyfile"])
                self.assertEqual(main.read_text(), source)
                self.assertEqual(site.read_text(), imported)

    def test_guard_preserves_old_handlers_and_rejects_other_route_changes(self):
        encode = {"handler": "encode", "encodings": {"gzip": {}, "zstd": {}}}
        app = {"handler": "reverse_proxy", "upstreams": [{"dial": "127.0.0.1:4173"}]}
        social = {"match": [{"path": [https.PUBLIC_PATH]}], "handle": [
            {"handler": "reverse_proxy", "upstreams": [{"dial": "127.0.0.1:8715"}],
             "rewrite": {"uri": "/snapshot.json"}}]}
        original = {"routes": [{"handle": [encode, app]}]}
        changed = {"routes": [{"handle": [encode]}, social, {"handle": [app]}]}
        https.guard_routes(original, changed)
        unsafe = copy.deepcopy(changed)
        unsafe["routes"][-1]["handle"][0]["upstreams"][0]["dial"] = "127.0.0.1:9999"
        with self.assertRaisesRegex(RuntimeError, "outras rotas"):
            https.guard_routes(original, unsafe)
        unsafe = copy.deepcopy(changed)
        unsafe["routes"][1]["handle"][0]["headers"] = {"request": {"delete": ["Authorization"]}}
        with self.assertRaisesRegex(RuntimeError, "inesperada"):
            https.guard_routes(original, unsafe)

    def transaction(self, statuses, reload_error=False, active=True, imported=False):
        with tempfile.TemporaryDirectory() as temporary:
            main = Path(temporary) / "Caddyfile"
            path = main.with_name("camara-reserva.caddy") if imported else main
            main_bytes = b':80 {\n    file_server\n}\nimport camara-reserva.caddy\n'
            if imported:
                main.write_bytes(main_bytes)
            path.write_bytes(ORIGINAL.encode())
            path.chmod(0o640)
            candidate = https.patch_source(ORIGINAL).encode()
            initial = path.stat()
            calls = []

            def reload(arguments):
                calls.append(arguments)
                if reload_error and len(calls) == 1:
                    raise RuntimeError("reload failure")
                return ""

            before = {service: True for service in https.SERVICES}
            with patch.object(https, "CONFIG", main), patch.object(https, "command", side_effect=reload), \
                    patch.object(https, "http_status", side_effect=statuses), patch.object(https, "active", return_value=active):
                try:
                    result = https.activate(path, ORIGINAL.encode(), candidate, initial, 200, before, "private-token")
                except RuntimeError as error:
                    self.assertEqual(path.read_bytes(), ORIGINAL.encode())
                    self.assertEqual(path.stat().st_mode & 0o777, 0o640)
                    self.assertEqual(len(calls), 2)
                    self.assertTrue(all(call == ["caddy", "reload", "--config", str(main), "--adapter", "caddyfile"]
                                        for call in calls))
                    if imported:
                        self.assertEqual(main.read_bytes(), main_bytes)
                    self.assertNotIn("private-token", str(error))
                    return str(error)
                self.assertEqual(path.read_bytes(), candidate)
                self.assertEqual(path.stat().st_mode & 0o777, 0o640)
                self.assertEqual(len(calls), 1)
                self.assertEqual(calls[0], ["caddy", "reload", "--config", str(main), "--adapter", "caddyfile"])
                if imported:
                    self.assertEqual(main.read_bytes(), main_bytes)
                return result

    def test_success_keeps_candidate_and_authentication_checks(self):
        self.assertEqual(self.transaction([401, 503, 200]), (401, 503))

    def test_failed_authentication_or_changed_app_response_rolls_back(self):
        self.assertIn("restaurado", self.transaction([401, 502]))
        self.assertIn("restaurado", self.transaction([401, 503, 500]))

    def test_reload_failure_or_changed_service_state_rolls_back(self):
        self.assertIn("restaurado", self.transaction([], reload_error=True))
        self.assertIn("restaurado", self.transaction([401, 503, 200], active=False))

    def test_imported_site_activation_and_rollback_reload_the_unchanged_main_file(self):
        self.assertEqual(self.transaction([401, 503, 200], imported=True), (401, 503))
        self.assertIn("restaurado", self.transaction([401, 502], imported=True))
        self.assertIn("restaurado", self.transaction([], reload_error=True, imported=True))


if __name__ == "__main__":
    unittest.main()
