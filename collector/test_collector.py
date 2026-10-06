import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

from collector import Store, account, collect, fetch_component, normalize_posts

ENV = {"META_API_VERSION": "v99.0", "INSTAGRAM_USER_ID": "ig-id", "INSTAGRAM_ACCESS_TOKEN": "test-ig",
       "FACEBOOK_PAGE_ID": "page-id", "FACEBOOK_PAGE_ACCESS_TOKEN": "test-fb",
       "YOUTUBE_CHANNEL_ID": "channel-id", "YOUTUBE_API_KEY": "test-youtube",
       "X_USER_ID": "x-id", "X_BEARER_TOKEN": "test-x", "TIKTOK_ACCESS_TOKEN": "test-tiktok"}
POST = {"id": "123", "timestamp": "2026-10-06T16:00:00+0000", "media_type": "VIDEO",
        "caption": "Publicação", "thumbnail_url": "https://example.com/thumb.jpg",
        "media_url": "https://example.com/movie.mp4", "permalink": "https://www.instagram.com/p/example/",
        "like_count": 10, "comments_count": 2}


class CollectorTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "collector.sqlite3"
        self.store = Store(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def test_each_provider_uses_expected_response(self):
        responses = {"instagram": {"username": "camara", "followers_count": 100},
                     "facebook": {"name": "Câmara", "followers_count": 200},
                     "youtube": {"items": [{"snippet": {"customUrl": "@camara"}, "statistics": {"subscriberCount": "300", "hiddenSubscriberCount": False}}]},
                     "x": {"data": {"username": "camara", "public_metrics": {"followers_count": 400}}},
                     "tiktok": {"error": {"code": "ok"}, "data": {"user": {"display_name": "Câmara", "follower_count": 500}}}}
        for index, key in enumerate(responses, 1):
            result = fetch_component(key, ENV, lambda *args: responses[key])
            self.assertEqual(result["followers"], index * 100)
            self.assertEqual(result["id"], key)
        with self.assertRaises(ValueError):
            fetch_component("youtube", ENV, lambda *args: {"items": [{"statistics": {"hiddenSubscriberCount": True}}]})
        with self.assertRaises(ValueError):
            fetch_component("tiktok", ENV, lambda *args: {"error": {"code": "access_token_invalid"}})

    def test_post_thumbnail_carousel_and_unknown_counts(self):
        post = normalize_posts([POST])[0]
        self.assertEqual(post["mediaUrl"], POST["thumbnail_url"])
        self.assertEqual(post["publishedAt"], "2026-10-06T16:00:00+00:00")
        carousel = {**POST, "id": "456", "media_type": "CAROUSEL_ALBUM", "thumbnail_url": None,
                    "media_url": None, "children": {"data": [{"media_url": "https://example.com/first.jpg"}]}, "like_count": None}
        self.assertEqual(normalize_posts([carousel])[0]["mediaUrl"], "https://example.com/first.jpg")
        self.assertIsNone(normalize_posts([carousel])[0]["likes"])
        unsafe = {**POST, "permalink": "https://evil.example/p/123", "thumbnail_url": "http://example.com/image"}
        self.assertIsNone(normalize_posts([unsafe])[0]["permalink"])
        self.assertIsNone(normalize_posts([unsafe])[0]["mediaUrl"])

    def test_missing_credentials_dont_invent_zeroes(self):
        collect(self.store, {}, now=100000, fetch=lambda *args: self.fail("Must not query"))
        self.assertIsNone(self.store.snapshot())
        with self.assertRaises(ValueError):
            account("x", "test", True)
        with self.assertRaises(ValueError):
            account("x", "test", -1)

    def test_failed_network_preserves_timestamp_and_other_network_updates(self):
        self.store.save("instagram", account("instagram", "camara", 100), 100000)
        self.store.save("instagram.posts", normalize_posts([POST]), 100000)

        def fetch(key, env):
            if key.startswith("instagram"):
                raise RuntimeError("do not log secret-token")
            return account(key, "camara", 200)

        with self.assertLogs(level="WARNING") as logs:
            collect(self.store, ENV, now=100900, fetch=fetch)
        self.assertNotIn("secret-token", " ".join(logs.output))
        snapshot = self.store.snapshot()
        ig = next(a for a in snapshot["accounts"] if a["id"] == "instagram")
        self.assertEqual(ig["followers"], 100)
        self.assertEqual(ig["updatedAt"], "1970-01-02T03:46:40+00:00")
        self.assertEqual(len(snapshot["accounts"]), 5)
        self.assertEqual(snapshot["posts"][0]["id"], "123")
        self.assertEqual(Store(self.path).snapshot(), snapshot)
        self.store.save("instagram.posts", [], 101000)
        self.assertEqual(self.store.snapshot()["posts"], [])

    def test_delta_needs_24h_and_rejects_old_baseline(self):
        self.store.save("x", account("x", "camara", 100), 100000)
        self.store.save("x", account("x", "camara", 110), 186399)
        self.assertIsNone(self.store.snapshot()["accounts"][0]["change24h"])
        self.store.save("x", account("x", "camara", 112), 186400)
        self.assertEqual(self.store.snapshot()["accounts"][0]["change24h"], 12)
        self.store.save("x", account("x", "camara", 120), 300000)
        self.assertIsNone(self.store.snapshot()["accounts"][0]["change24h"])

    def test_counts_and_posts_have_separate_persistent_intervals(self):
        calls = []

        def fetch(key, env):
            calls.append(key)
            return [] if key == "instagram.posts" else account(key, "camara", 100)

        collect(self.store, ENV, now=100000, fetch=fetch)
        self.assertEqual(len(calls), 6)
        calls.clear()
        collect(Store(self.path), ENV, now=100299, fetch=fetch)
        self.assertEqual(calls, [])
        collect(Store(self.path), ENV, now=100300, fetch=fetch)
        self.assertEqual(calls, ["instagram.posts"])

    def test_http_requires_authorization_and_serves_persisted_snapshot(self):
        self.store.save("youtube", account("youtube", "camara", 100), time.time())
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        env = {"PATH": os.environ.get("PATH", ""), "COLLECTOR_PORT": str(port),
               "COLLECTOR_READ_TOKEN": "test-read-token-" + "a" * 32,
               "COLLECTOR_STATE_DIR": self.temp.name}
        # The subprocess deliberately starts with no platform credentials.
        process = subprocess.Popen([sys.executable, str(Path(__file__).with_name("collector.py"))], env=env,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        url = f"http://127.0.0.1:{port}/snapshot.json"
        try:
            for _ in range(30):
                try:
                    urllib.request.urlopen(url, timeout=1)
                except urllib.error.HTTPError as error:
                    self.assertEqual(error.code, 401)
                    break
                except urllib.error.URLError:
                    time.sleep(.05)
            else:
                self.fail("Collector did not start")
            request = urllib.request.Request(url, headers={"Authorization": "Bearer " + env["COLLECTOR_READ_TOKEN"]})
            with urllib.request.urlopen(request, timeout=2) as response:
                self.assertEqual(json.load(response)["accounts"][0]["followers"], 100)
                self.assertEqual(response.headers["Cache-Control"], "no-store")
        finally:
            process.terminate()
            process.wait(timeout=3)


if __name__ == "__main__":
    unittest.main()
