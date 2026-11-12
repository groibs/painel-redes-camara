"""Local tests for the VPS-free public collector (no network or secrets)."""
import datetime as dt
from pathlib import Path
import tempfile
import unittest

from scripts.sync_social import merge_collection, update_history, main
from scripts.check_social_freshness import freshness_problems

UTC = dt.timezone.utc


class ScheduledSocialTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 11, 12, 15, 0, tzinfo=UTC)

    def test_keeps_real_observation_time_on_failure(self):
        previous_time = (self.now - dt.timedelta(hours=2)).isoformat()
        previous = {
            "collectedAt": previous_time,
            "instagram": None,
            "telegram": {"observedAt": previous_time, "posts": [{"id": "tg-1"}]},
            "x": {"observedAt": previous_time, "followers": 1086000},
        }
        fresh = {
            "collectedAt": self.now.isoformat(),
            "instagram": None, "x": {"followers": 1086200}, "telegram": None,
            "errors": {"telegram": "unavailable"},
        }
        merged, names = merge_collection(fresh, previous)
        self.assertEqual(names, {"x"})
        self.assertEqual(merged["x"]["observedAt"], self.now.isoformat())
        self.assertEqual(merged["telegram"]["observedAt"], previous_time)
        self.assertEqual(merged["instagram"], None)

    def test_delta_24h_only_when_real_baseline_exists(self):
        before = (self.now - dt.timedelta(hours=24)).isoformat()
        fresh = {
            "collectedAt": self.now.isoformat(), "x": {"followers": 1000},
            "instagram": None, "telegram": None,
        }
        merged, names = merge_collection(fresh, {"collectedAt": before})
        result, added = update_history({
            "samples": [{"network": "x", "followers": 950, "collectedAt": before}],
        }, merged, names)
        self.assertEqual(merged["x"]["change24h"], 50)
        self.assertEqual(len(result["samples"]), 2)
        self.assertEqual(len(added), 1)
        self.assertNotIn("instagram", [s["network"] for s in result["samples"]])

    def test_daily_freshness_checks_all_public_follower_sources(self):
        fresh_date = self.now - dt.timedelta(hours=25)
        recent = {"observedAt": fresh_date.isoformat(), "followers": 1234}
        snapshot = {name: dict(recent) for name in ("x", "tiktok", "facebook", "youtube")}
        self.assertEqual(freshness_problems(snapshot, self.now), [])
        snapshot["facebook"]["observedAt"] = (
            self.now - dt.timedelta(hours=27)).isoformat()
        self.assertEqual(len(freshness_problems(snapshot, self.now)), 1)
        self.assertIn("facebook", freshness_problems(snapshot, self.now)[0])

    def test_daily_freshness_ignores_manual_instagram_and_flags_missing_source(self):
        now = self.now
        sources = {name: {"followers": 1, "observedAt": now.isoformat()}
                   for name in ("x", "tiktok", "facebook", "youtube")}
        sources["instagram"] = {"followers": None, "source": "embed"}
        self.assertEqual(freshness_problems(sources, now), [])
        sources.pop("youtube")
        self.assertTrue(any("youtube" in problem for problem in freshness_problems(sources, now)))

    def test_never_invents_missing_social_network(self):
        fresh = {"collectedAt": self.now.isoformat(),
                 "x": None, "instagram": None, "telegram": None}
        with self.assertRaises(RuntimeError):
            merge_collection(fresh, {})

    def test_instagram_posts_without_followers_are_persisted(self):
        latest_post = {
            "id": "4028851524474792239",
            "caption": "Publicação real",
            "mediaUrl": "https://scontent-iad6-1.cdninstagram.com/test.jpg",
            "permalink": "https://www.instagram.com/p/DfpWx2hHGkv/",
            "publishedAt": self.now.isoformat(),
            "type": "image", "likes": None, "comments": None,
        }
        fresh = {
            "collectedAt": self.now.isoformat(),
            "instagram": {
                "source": "embed", "followers": None, "posts": [latest_post],
            },
            "x": {"followers": 1087137},
        }
        merged, sources = merge_collection(fresh, {})
        self.assertIn("instagram", sources)
        self.assertIsNone(merged["instagram"]["followers"])
        self.assertEqual(merged["instagram"]["posts"][0]["id"], latest_post["id"])
        _, history_rows = update_history({}, merged, sources)
        self.assertEqual([row["network"] for row in history_rows], ["x"])

    def test_ignores_ancient_stale_counts(self):
        previous_time = (self.now - dt.timedelta(days=9)).isoformat()
        previous = {
            "collectedAt": previous_time,
            "x": {"followers": 1086000, "observedAt": previous_time},
        }
        fresh = {
            "collectedAt": self.now.isoformat(),
            "x": None, "telegram": {"posts": [{"id": "tg-100"}]},
        }
        merged, _ = merge_collection(fresh, previous)
        self.assertIsNone(merged["x"])
        self.assertIsNotNone(merged["telegram"])


if __name__ == "__main__":
    unittest.main()
