"""Installer checks with temporary paths; never changes host services or users."""
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import install as installer


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = Path(installer.__file__).parent
        self.app = self.root / "app"
        self.config = self.root / "private.env"
        self.unit = self.root / installer.SERVICE
        self.process = None
        self.calls = []
        self.output = io.StringIO()
        for name, value in (("APP", self.app), ("CONFIG", self.config), ("UNIT", self.unit)):
            mock = patch.object(installer, name, value)
            mock.start()
            self.addCleanup(mock.stop)
        for mock in (patch.object(installer.os, "geteuid", return_value=0),
                     patch.object(installer.pwd, "getpwnam", side_effect=KeyError),
                     patch.object(installer, "command", side_effect=self.command),
                     patch.object(installer.urllib.request, "urlopen", side_effect=self.download)):
            mock.start()
            self.addCleanup(mock.stop)
        # main sets umask intentionally; restore it after each test.
        previous = os.umask(0o077)
        os.umask(previous)
        self.addCleanup(os.umask, previous)
        self.addCleanup(self.stop)

    def stop(self):
        if self.process:
            self.process.terminate()
            self.process.communicate(timeout=5)

    def download(self, url, **kwargs):
        return io.BytesIO((self.source / url.rsplit("/", 1)[1]).read_bytes())

    def command(self, args, check=True):
        self.calls.append(args)
        code, output = 0, ""
        if args[:2] == ["systemctl", "is-active"]:
            service = args[-1]
            code = int(service == installer.SERVICE and (self.process is None or self.process.poll() is not None))
        elif args[:2] == ["systemctl", "enable"]:
            env = dict(os.environ)
            for line in self.config.read_text().splitlines():
                if line and not line.startswith("#"):
                    key, value = line.split("=", 1)
                    env[key] = value
            env["COLLECTOR_STATE_DIR"] = str(self.root / "state")
            self.process = subprocess.Popen(["python3", str(self.app / "collector.py")], env=env,
                                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        elif args[:2] == ["systemd-analyze", "verify"]:
            subprocess.run(args, check=True, capture_output=True)
        return subprocess.CompletedProcess(args, code, stdout=output, stderr="")

    def test_installs_private_config_and_checks_real_http_without_changing_other_services(self):
        with contextlib.redirect_stdout(self.output), patch.object(installer, "caddy_hosts"):
            installer.main()
        settings = dict(line.split("=", 1) for line in self.config.read_text().splitlines()
                        if line and not line.startswith("#"))
        token = settings["COLLECTOR_READ_TOKEN"]
        self.assertGreaterEqual(len(token), 32)
        self.assertEqual(self.config.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.app.stat().st_mode & 0o777, 0o755)
        self.assertEqual((self.app / "collector.py").stat().st_mode & 0o777, 0o644)
        self.assertNotIn(token, self.output.getvalue())
        self.assertIn("HTTP 401; com credencial: HTTP 503", self.output.getvalue())
        mutations = [args for args in self.calls if args[0] == "systemctl" and args[1] != "is-active"]
        self.assertEqual(mutations, [["systemctl", "daemon-reload"], ["systemctl", "enable", "--now", installer.SERVICE]])
        original = self.config.read_bytes()
        with self.assertRaisesRegex(RuntimeError, "preservar"):
            installer.main()
        self.assertEqual(self.config.read_bytes(), original)

    def test_existing_config_is_preserved_without_service_commands(self):
        self.config.write_text("COLLECTOR_READ_TOKEN=existing-private-token\n")
        with self.assertRaisesRegex(RuntimeError, "preservar"):
            installer.main()
        self.assertEqual(self.config.read_text(), "COLLECTOR_READ_TOKEN=existing-private-token\n")
        self.assertEqual(self.calls, [])
        self.assertFalse(self.app.exists())

    def test_download_hash_failure_leaves_no_installation_or_user_changes(self):
        with patch.object(installer.urllib.request, "urlopen", return_value=io.BytesIO(b"unexpected content")):
            with contextlib.redirect_stdout(self.output), self.assertRaisesRegex(RuntimeError, "Verificacao"):
                installer.main()
        self.assertFalse(self.app.exists())
        self.assertFalse(self.config.exists())
        self.assertFalse(self.unit.exists())
        self.assertTrue(all(args[0] == "systemctl" and args[1] == "is-active" for args in self.calls))

    def test_caddy_summary_does_not_print_authentication_configuration(self):
        config = {"apps": {"http": {"servers": {"existing": {"routes": [
            {"match": [{"host": ["camara.example.com"]}], "handle": [{"password": "private-config-secret"}]}]}}}}}
        result = subprocess.CompletedProcess([], 0, stdout=json.dumps(config), stderr="")
        with patch.object(installer.Path, "is_file", return_value=True), patch.object(installer.shutil, "which", return_value="caddy"), \
                patch.object(installer, "command", return_value=result), contextlib.redirect_stdout(self.output):
            installer.caddy_hosts()
        self.assertIn("camara.example.com", self.output.getvalue())
        self.assertNotIn("private-config-secret", self.output.getvalue())


if __name__ == "__main__":
    unittest.main()
