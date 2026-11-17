"""Verify official public embed parsing without contacting Instagram."""
import datetime as dt
import json
from unittest import TestCase
from unittest.mock import patch

from api.social_public import (
    _ig_embed, _parse_embed_profile, _parse_public_profile_followers,
    _ig_public_collection,
)


class DummyResponse:
    status_code = 200
    def __init__(self, text):
        self.text = text
        self.content = text.encode("utf-8")


class InstagramEmbedTests(TestCase):
    def make_html(self):
        now = int(dt.datetime.now(dt.timezone.utc).timestamp()) - 120
        nodes = []
        for offset in range(7):
            nodes.append({
                "shortcode_media": {
                    "__typename": "GraphVideo" if offset % 2 else "GraphImage",
                    "id": str(4000000000000000000 + offset),
                    "shortcode": f"AbC123{offset:04d}",
                    "taken_at_timestamp": now - offset * 3600,
                    "display_url": f"https://scontent-iad3-1.cdninstagram.com/{offset}.jpg",
                    "pinned_for_users": ["person"] if offset == 1 else [],
                    "edge_media_to_caption": {"edges": [{"node": {"text": f"Post número {offset}"}}]},
                    "edge_media_to_comment": {"count": offset * 2},
                    "edge_liked_by": {"count": 10 + offset},
                },
            })
        context = {
            "username": "camaradosdeputados",
            "followers_count": 100,  # Intentionally stale: must be ignored.
            "graphql_media": nodes,
        }
        serialized = json.dumps({
            "define": [{"contextJSON": json.dumps({"context": context})}],
        })
        return '<html><script>s.handle(' + serialized + ');</script></html>'

    def test_public_embed_recovers_six_unpinned_posts(self):
        with patch("api.social_public.requests.get", return_value=DummyResponse(self.make_html())):
            result = _ig_embed()
        self.assertEqual(len(result["posts"]), 6)
        self.assertEqual(result["posts"][0]["caption"], "Post número 0")
        self.assertTrue(result["posts"][1]["permalink"].startswith("https://www.instagram.com/p/"))
        self.assertNotIn("Post número 1", [post["caption"] for post in result["posts"]])
        self.assertEqual(result["source"], "embed")

    def test_stale_embed_follower_count_is_not_exposed(self):
        with patch("api.social_public.requests.get", return_value=DummyResponse(self.make_html())):
            result = _ig_embed()
        self.assertIsNone(result["followers"])
        self.assertEqual(result["publicFollowers"], 100)

    def test_missing_embed_data_is_rejected(self):
        with self.assertRaises(RuntimeError):
            _parse_embed_profile("<html>Não há dados</html>")

    def test_profile_counter_requires_the_official_username(self):
        page = '<script type="application/json">' + json.dumps({"payload": [
            {"username": "outra_conta", "follower_count": 900000},
            {"username": "camaradosdeputados", "follower_count": 400027},
        ]}) + '</script>'
        self.assertEqual(_parse_public_profile_followers(page), 400027)

    def test_profile_counter_does_not_use_rounded_metadata_or_invalid_values(self):
        for value in (None, True, -1, "400027", 10**20):
            page = '<meta content="400K seguidores"><script type="application/json">' + json.dumps({
                "username": "camaradosdeputados", "follower_count": value,
            }) + '</script>'
            with self.subTest(value=value), self.assertRaises(RuntimeError):
                _parse_public_profile_followers(page)

    def test_profile_count_wins_over_stale_embed_but_preserves_posts(self):
        embed = {"followers": None, "publicFollowers": 399737,
                 "posts": [{"id": "post-1"}], "source": "embed"}
        with patch("api.social_public._ig_embed", return_value=embed), \
             patch("api.social_public._ig_public_profile_followers", return_value=400027):
            result = _ig_public_collection()
        self.assertEqual(result["followers"], 400027)
        self.assertEqual(result["publicFollowers"], 400027)
        self.assertEqual(result["embedFollowers"], 399737)
        self.assertEqual(result["source"], "profile")
        self.assertEqual(result["posts"], embed["posts"])

    def test_unavailable_profile_keeps_the_embed_fallback(self):
        embed = {"followers": None, "publicFollowers": 399737,
                 "posts": [{"id": "post-1"}], "source": "embed"}
        with patch("api.social_public._ig_embed", return_value=embed), \
             patch("api.social_public._ig_public_profile_followers", side_effect=RuntimeError("unavailable")):
            result = _ig_public_collection()
        self.assertEqual(result, embed)

    def test_profile_count_survives_an_unavailable_embed(self):
        with patch("api.social_public._ig_embed", side_effect=RuntimeError("unavailable")), \
             patch("api.social_public._ig_public_profile_followers", return_value=400027):
            result = _ig_public_collection()
        self.assertEqual(result["followers"], 400027)
        self.assertEqual(result["source"], "profile")
        self.assertEqual(result["posts"], [])


if __name__ == "__main__":
    import unittest
    unittest.main()
