import unittest
from unittest.mock import patch
from api.social_public import _x_profile


class TestXPublicProfile(unittest.TestCase):
    def test_retry_v2_before_legacy(self):
        class Bad:
            status_code = 404
        class Good:
            status_code = 200
            def json(self):
                return {"code": 200, "user": {"followers": 1087132}}
        with patch("api.social_public.requests.get", side_effect=[Bad(), Good()]) as get:
            with patch("api.social_public.time.sleep"):
                account = _x_profile()
        self.assertEqual(account["followers"], 1087132)
        self.assertEqual(get.call_count, 2)
        for call in get.call_args_list:
            self.assertIn("/2/profile/camaradeputados", call.args[0])


if __name__ == "__main__":
    unittest.main()
