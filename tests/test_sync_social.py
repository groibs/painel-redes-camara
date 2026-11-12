"""Local tests for the VPS-free public collector (no network or secrets)."""
import datetime as dt
from pathlib import Path
import tempfile
import unittest

from scripts.sync_social import merge_collection, update_history, main, reconcile_instagram_public_followers
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
        snapshot["instagram"] = {
            "publicFollowers": 396896,
            "publicCheckedAt": fresh_date.isoformat(),
            "publicCountChangedAt": fresh_date.isoformat(),
        }
        self.assertEqual(freshness_problems(snapshot, self.now), [])
        snapshot["facebook"]["observedAt"] = (
            self.now - dt.timedelta(hours=27)).isoformat()
        self.assertEqual(len(freshness_problems(snapshot, self.now)), 1)
        self.assertIn("facebook", freshness_problems(snapshot, self.now)[0])

    def test_daily_freshness_ignores_manual_instagram_and_flags_missing_source(self):
        now = self.now
        sources = {name: {"followers": 1, "observedAt": now.isoformat()}
                   for name in ("x", "tiktok", "facebook", "youtube")}
        sources["instagram"] = {
            "followers": None, "source": "embed", "publicFollowers": 396896,
            "publicCheckedAt": now.isoformat(), "publicCountChangedAt": now.isoformat(),
        }
        self.assertEqual(freshness_problems(sources, now), [])
        sources.pop("youtube")
        self.assertTrue(any("youtube" in problem for problem in freshness_problems(sources, now)))

    def test_instagram_uses_public_count_even_below_old_manual_number(self):
        old = self.now - dt.timedelta(minutes=30)
        previous = {"instagram": {
            "source": "embed", "followers": None,
            "publicFollowers": 396896,
            "publicCheckedAt": old.isoformat(),
            "publicCountChangedAt": old.isoformat(),
            "posts": [{"id": "1"}],
        }}
        fresh = {"collectedAt": self.now.isoformat(), "instagram": {
            "source": "embed", "followers": None, "publicFollowers": 396896,
            "posts": [{"id": "2"}],
        }}
        reconcile_instagram_public_followers(fresh, previous)
        ig = fresh["instagram"]
        self.assertEqual(ig["followers"], 396896)
        self.assertEqual(ig["source"], "embed_observed")
        self.assertEqual(ig["followersObservedAt"], self.now.isoformat())
        self.assertEqual(ig["publicCountChangedAt"], old.isoformat())
        self.assertEqual(ig["publicCheckedAt"], self.now.isoformat())
        merged, fresh_names = merge_collection(fresh, previous)
        _, rows = update_history({}, merged, fresh_names)
        self.assertEqual(rows, [])

    def test_instagram_records_real_public_count_change_without_manual_gate(self):
        previous_time = self.now - dt.timedelta(minutes=30)
        previous = {"instagram": {
            "source": "embed_observed", "followers": 396896,
            "publicFollowers": 396896,
            "publicCheckedAt": previous_time.isoformat(),
            "publicCountChangedAt": previous_time.isoformat(),
        }}
        fresh = {"collectedAt": self.now.isoformat(), "instagram": {
            "source": "embed", "followers": None,
            "publicFollowers": 396875,
            "posts": [{"id": "2"}],
        }}
        reconcile_instagram_public_followers(fresh, previous)
        self.assertEqual(fresh["instagram"]["followers"], 396875)
        self.assertEqual(fresh["instagram"]["source"], "embed_observed")
        self.assertEqual(fresh["instagram"]["publicCountChangedAt"], self.now.isoformat())
        merged, names = merge_collection(fresh, previous)
        history, rows = update_history({}, merged, names)
        self.assertEqual([item["network"] for item in rows], ["instagram"])
        self.assertEqual(rows[0]["followers"], 396875)
        self.assertIsNone(merged["instagram"]["change24h"])

        later_time = self.now + dt.timedelta(minutes=30)
        later = {"collectedAt": later_time.isoformat(), "instagram": {
            "source": "embed", "followers": None, "publicFollowers": 396875,
            "posts": [{"id": "3"}],
        }}
        reconcile_instagram_public_followers(later, merged)
        self.assertEqual(later["instagram"]["followers"], 396875)
        self.assertEqual(later["instagram"]["followersObservedAt"], later_time.isoformat())
        self.assertEqual(later["instagram"]["publicCountChangedAt"], self.now.isoformat())
        next_snapshot, names = merge_collection(later, merged)
        _, new_rows = update_history(history, next_snapshot, names)
        self.assertEqual(new_rows, [])

    def test_instagram_accepts_first_valid_public_reading(self):
        fresh = {"collectedAt": self.now.isoformat(), "instagram": {
            "source": "embed", "followers": None,
            "publicFollowers": 396850, "posts": [{"id": "3"}],
        }}
        reconcile_instagram_public_followers(fresh, {})
        self.assertEqual(fresh["instagram"]["followers"], 396850)

    def test_instagram_daily_audit_flags_old_unchanged_public_count(self):
        old = (self.now - dt.timedelta(hours=73)).isoformat()
        recent = self.now.isoformat()
        values = {name: {"followers": 1, "observedAt": recent}
                  for name in ("x", "tiktok", "facebook", "youtube")}
        values["instagram"] = {
            "publicFollowers": 396896,
            "publicCheckedAt": recent,
            "publicCountChangedAt": old,
        }
        self.assertTrue(any("instagram" in text and "72 horas" in text
                            for text in freshness_problems(values, self.now)))

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
