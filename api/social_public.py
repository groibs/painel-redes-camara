from http.server import BaseHTTPRequestHandler
import datetime as dt
import hmac
import json
import os
from urllib.parse import quote

from curl_cffi import requests

UTC = dt.timezone.utc
IG_HANDLE = "camaradosdeputados"
X_HANDLE = "camaradeputados"
MAX_BODY = 5_000_000


def _json_response(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _authorized(handler):
    expected = os.environ.get("PANEL_SOCIAL_SOURCE_TOKEN", "")
    supplied = handler.headers.get("Authorization", "")
    if not expected:
        return False
    return hmac.compare_digest(supplied, "Bearer " + expected)


def _ig_profile():
    safe = quote(IG_HANDLE, safe="")
    headers = {
        "X-Ig-App-Id": "936619743392459",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": f"https://www.instagram.com/{safe}/",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
    }
    errors = []
    for host in ("i.instagram.com", "www.instagram.com"):
        try:
            response = requests.get(
                f"https://{host}/api/v1/users/web_profile_info/?username={safe}",
                headers=headers,
                impersonate="chrome",
                timeout=20,
                allow_redirects=True,
            )
            if response.status_code != 200:
                errors.append(f"{host}:{response.status_code}")
                continue
            if len(response.content) > MAX_BODY:
                errors.append(f"{host}:too_large")
                continue
            data = response.json()
            user = (data.get("data") or {}).get("user")
            if isinstance(user, dict):
                return user
            errors.append(f"{host}:no_user")
        except Exception as error:
            errors.append(f"{host}:{type(error).__name__}")
    raise RuntimeError("instagram:" + ",".join(errors))


def _count(value):
    if type(value) is not int or value < 0:
        return None
    return value


def _ig_posts(user):
    timeline = user.get("edge_owner_to_timeline_media") or {}
    edges = timeline.get("edges") if isinstance(timeline, dict) else []
    posts = []
    for edge in (edges or [])[:6]:
        node = edge.get("node") if isinstance(edge, dict) else None
        if not isinstance(node, dict):
            continue
        identifier = str(node.get("id") or "")
        shortcode = str(node.get("shortcode") or "")
        timestamp = node.get("taken_at_timestamp")
        if not identifier or not shortcode or type(timestamp) is not int:
            continue

        captions = ((node.get("edge_media_to_caption") or {}).get("edges") or [])
        caption = ""
        if captions and isinstance(captions[0], dict):
            caption = str(((captions[0].get("node") or {}).get("text")) or "")

        likes = (node.get("edge_media_preview_like") or {}).get("count")
        if likes is None:
            likes = (node.get("edge_liked_by") or {}).get("count")
        comments = (node.get("edge_media_to_comment") or {}).get("count")

        typename = node.get("__typename")
        media_type = {
            "GraphImage": "image",
            "GraphVideo": "video",
            "GraphSidecar": "carousel",
        }.get(typename, "video" if node.get("is_video") else "image")

        posts.append({
            "id": identifier[:100],
            "caption": caption[:4000],
            "mediaUrl": node.get("display_url") if isinstance(node.get("display_url"), str) else None,
            "permalink": f"https://www.instagram.com/p/{shortcode}/",
            "publishedAt": dt.datetime.fromtimestamp(timestamp, UTC).isoformat(),
            "type": media_type,
            "likes": _count(likes),
            "comments": _count(comments),
        })
    return posts


def _x_profile():
    safe = quote(X_HANDLE, safe="")
    errors = []
    for url in (
        f"https://api.fxtwitter.com/{safe}",
        f"https://api.fxtwitter.com/2/profile/{safe}",
    ):
        try:
            response = requests.get(
                url,
                headers={"Accept": "application/json"},
                impersonate="chrome",
                timeout=20,
                allow_redirects=True,
            )
            if response.status_code != 200:
                errors.append(str(response.status_code))
                continue
            data = response.json()
            user = data.get("user")
            if isinstance(user, dict) and type(user.get("followers")) is int:
                return user
            errors.append("no_user")
        except Exception as error:
            errors.append(type(error).__name__)
    raise RuntimeError("x:" + ",".join(errors))


def collect():
    errors = {}
    result = {
        "collectedAt": dt.datetime.now(UTC).isoformat(),
        "instagram": None,
        "x": None,
        "errors": errors,
    }

    try:
        user = _ig_profile()
        followers = ((user.get("edge_followed_by") or {}).get("count"))
        if type(followers) is not int:
            raise RuntimeError("instagram:invalid_followers")
        result["instagram"] = {
            "handle": "@" + IG_HANDLE,
            "followers": followers,
            "posts": _ig_posts(user),
        }
    except Exception as error:
        errors["instagram"] = str(error)[:240]

    try:
        user = _x_profile()
        result["x"] = {
            "handle": "@" + X_HANDLE,
            "followers": user["followers"],
        }
    except Exception as error:
        errors["x"] = str(error)[:240]

    if result["instagram"] is None and result["x"] is None:
        return 503, result
    return 200, result


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?", 1)[0] != "/api/social-public":
            _json_response(self, 404, {"error": "not_found"})
            return
        if not _authorized(self):
            _json_response(self, 401, {"error": "unauthorized"})
            return
        status, payload = collect()
        _json_response(self, status, payload)

    def log_message(self, format, *args):
        return
