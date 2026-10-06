"""Route and rollback checks; all configuration writes stay in temporary paths."""
import copy
import json
from pathlib import Path
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

    def transaction(self, statuses, reload_error=False, active=True):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "Caddyfile"
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
            with patch.object(https, "CONFIG", path), patch.object(https, "command", side_effect=reload), \
                    patch.object(https, "http_status", side_effect=statuses), patch.object(https, "active", return_value=active):
                try:
                    result = https.activate(ORIGINAL.encode(), candidate, initial, 200, before, "private-token")
                except RuntimeError as error:
                    self.assertEqual(path.read_bytes(), ORIGINAL.encode())
                    self.assertEqual(path.stat().st_mode & 0o777, 0o640)
                    self.assertEqual(len(calls), 2)
                    self.assertNotIn("private-token", str(error))
                    return str(error)
                self.assertEqual(path.read_bytes(), candidate)
                self.assertEqual(path.stat().st_mode & 0o777, 0o640)
                self.assertEqual(len(calls), 1)
                return result

    def test_success_keeps_candidate_and_authentication_checks(self):
        self.assertEqual(self.transaction([401, 503, 200]), (401, 503))

    def test_failed_authentication_or_changed_app_response_rolls_back(self):
        self.assertIn("restaurado", self.transaction([401, 502]))
        self.assertIn("restaurado", self.transaction([401, 503, 500]))

    def test_reload_failure_or_changed_service_state_rolls_back(self):
        self.assertIn("restaurado", self.transaction([], reload_error=True))
        self.assertIn("restaurado", self.transaction([401, 503, 200], active=False))


if __name__ == "__main__":
    unittest.main()
