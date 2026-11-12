from http.server import BaseHTTPRequestHandler
import datetime as dt
import html
from concurrent.futures import ThreadPoolExecutor
import json
import os
import re
from urllib.parse import parse_qs, quote, urlsplit

from curl_cffi import requests

UTC = dt.timezone.utc
IG_HANDLE = "camaradosdeputados"
X_HANDLE = "camaradeputados"
MAX_BODY = 5_000_000


def _json_response(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.end_headers()
    handler.wfile.write(body)


def _meta_api_json(path, params=None):
    """Authenticated Instagram professional account read; never leak credentials."""
    token = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "")
    user_id = os.environ.get("INSTAGRAM_USER_ID", "")
    version = os.environ.get("META_API_VERSION", "")
    login = os.environ.get("INSTAGRAM_LOGIN", "facebook")
    if not token or not re.fullmatch(r"[0-9]{2,32}", user_id):
        raise RuntimeError("meta:missing_credentials")
    if not re.fullmatch(r"v[0-9]{1,2}\.[0-9]+", version):
        raise RuntimeError("meta:invalid_api_version")
    if login not in ("instagram", "facebook"):
        raise RuntimeError("meta:invalid_login_mode")
    host = "graph.instagram.com" if login == "instagram" else "graph.facebook.com"
    url = f"https://{host}/{version}/{quote(user_id, safe='')}{path}"
    try:
        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            params=params or {},
            timeout=9,
            allow_redirects=False,
        )
        if response.status_code != 200:
            raise RuntimeError(f"meta:http_{response.status_code}")
        if len(response.content) > MAX_BODY:
            raise RuntimeError("meta:response_too_large")
        value = response.json()
        if not isinstance(value, dict) or "error" in value:
            raise RuntimeError("meta:invalid_response")
        return value
    except RuntimeError:
        raise
    except Exception:
        raise RuntimeError("meta:request_failed") from None


def _meta_instagram():
    profile = _meta_api_json("", {"fields": "username,followers_count"})
    followers = _count(profile.get("followers_count"))
    if followers is None:
        raise RuntimeError("meta:followers_unavailable")
    media = _meta_api_json(
        "/media",
        {
            "limit": "16",
            "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{media_url,thumbnail_url}",
        },
    )
    rows = media.get("data")
    if not isinstance(rows, list):
        raise RuntimeError("meta:media_unavailable")
    posts = []
    for row in rows:
        if not isinstance(row, dict) or row.get("is_pinned") is True:
            continue
        identifier = str(row.get("id") or "")
        published = row.get("timestamp")
        permalink = row.get("permalink")
        media_type = {
            "IMAGE": "image",
            "VIDEO": "video",
            "REELS": "video",
            "CAROUSEL_ALBUM": "carousel",
        }.get(row.get("media_type"))
        if not identifier or not media_type or not isinstance(published, str):
            continue
        if not isinstance(permalink, str) or not permalink.startswith("https://www.instagram.com/"):
            continue
        media_url = row.get("thumbnail_url") or row.get("media_url")
        if media_type == "carousel" and not media_url:
            children = (row.get("children") or {}).get("data") or []
            if children and isinstance(children[0], dict):
                media_url = children[0].get("thumbnail_url") or children[0].get("media_url")
        if not isinstance(media_url, str) or not media_url.startswith("https://"):
            media_url = None
        try:
            timestamp = dt.datetime.fromisoformat(published.replace("Z", "+00:00"))
            if timestamp.tzinfo is None:
                continue
            published = timestamp.isoformat()
        except ValueError:
            continue
        posts.append({
            "id": identifier[:100],
            "caption": str(row.get("caption") or "")[:4000],
            "mediaUrl": media_url,
            "permalink": permalink,
            "publishedAt": published,
            "type": media_type,
            "likes": _count(row.get("like_count")),
            "comments": _count(row.get("comments_count")),
        })
    posts.sort(key=lambda post: post["publishedAt"], reverse=True)
    return {
        "handle": "@" + str(profile.get("username") or IG_HANDLE)[:30],
        "followers": followers,
        "posts": posts[:6],
    }


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
                timeout=8,
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
    for edge in edges or []:
        node = edge.get("node") if isinstance(edge, dict) else None
        if not isinstance(node, dict):
            continue
        # Instagram places pinned posts at the beginning of the profile response.
        # They should not count as the latest posts shown in the wallboard.
        if node.get("pinned_for_users"):
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
        if len(posts) >= 6:
            break
    return posts


def _ig_media(post_id):
    if not isinstance(post_id, str) or not post_id.isdigit() or len(post_id) > 100:
        raise ValueError("invalid_post_id")

    user = _ig_profile()
    timeline = user.get("edge_owner_to_timeline_media") or {}
    edges = timeline.get("edges") if isinstance(timeline, dict) else []
    for edge in edges or []:
        node = edge.get("node") if isinstance(edge, dict) else None
        if not isinstance(node, dict) or str(node.get("id") or "") != post_id:
            continue
        url = node.get("display_url")
        if not isinstance(url, str) or not url.startswith("https://"):
            raise ValueError("media_url_missing")
        response = requests.get(
            url,
            headers={"Referer": "https://www.instagram.com/"},
            impersonate="chrome",
            timeout=8,
            allow_redirects=True,
        )
        if response.status_code != 200:
            raise RuntimeError("media_http_error")
        if len(response.content) > MAX_BODY:
            raise RuntimeError("media_too_large")
        content_type = response.headers.get("content-type", "image/jpeg")
        if not content_type.startswith("image/"):
            raise RuntimeError("media_not_image")
        return response.content, content_type
    raise LookupError("post_not_found")


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
                timeout=10,
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



def _telegram_recent():
    """Fetch photo thumbnails from the Câmara's verified public Telegram channel.

    This is explicitly a Telegram fallback, not a claim of Instagram recency.
    No Telegram login or third-party scraping service is required.
    """
    response = requests.get(
        "https://t.me/s/CamaradosDeputados",
        headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"},
        impersonate="chrome",
        timeout=9,
        allow_redirects=False,
    )
    if response.status_code != 200:
        raise RuntimeError(f"telegram:http_{response.status_code}")
    if len(response.content) > MAX_BODY:
        raise RuntimeError("telegram:response_too_large")
    page = response.text
    positions = list(re.finditer(r'data-post="CamaradosDeputados/(\d+)"', page))
    posts = []
    for index, match in enumerate(positions):
        block = page[match.start():(positions[index + 1].start()
                                    if index + 1 < len(positions) else len(page))]
        stamp = re.search(r'<time\b[^>]*datetime="([^"]+)"', block)
        photo = re.search(
            r'tgme_widget_message_photo_wrap[^>]*style="([^"]+)"',
            block, re.DOTALL,
        )
        if not stamp or not photo:
            continue
        photo_url = re.search(
            r"""url\(\s*['"]?(https://[^)'"]+)""",
            html.unescape(photo.group(1)),
        )
        if not photo_url:
            continue
        image = photo_url.group(1)
        if not (urlsplit(image).hostname or "").endswith(".telesco.pe"):
            continue
        try:
            published = dt.datetime.fromisoformat(stamp.group(1).replace("Z", "+00:00"))
            if published.tzinfo is None:
                continue
        except ValueError:
            continue
        body = re.search(
            r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>',
            block, re.DOTALL,
        )
        caption = re.sub(
            r"\s+", " ",
            re.sub(r"<[^>]+>", " ", html.unescape(body.group(1)) if body else ""),
        ).strip()[:4000]
        if not caption:
            caption = "Publicação da Câmara dos Deputados"
        post_id = match.group(1)
        posts.append({
            "id": "tg-" + post_id,
            "caption": caption,
            "mediaUrl": image,
            "permalink": f"https://t.me/CamaradosDeputados/{post_id}",
            "publishedAt": published.isoformat(),
            "type": "video" if "tgme_widget_message_video" in block else "image",
            "likes": None,
            "comments": None,
        })
    if not posts:
        raise RuntimeError("telegram:no_media_posts")
    posts.sort(key=lambda post: post["publishedAt"], reverse=True)
    return posts[:6]


def collect():
    errors = {}
    result = {
        "collectedAt": dt.datetime.now(UTC).isoformat(),
        "instagram": None,
        "telegram": None,
        "x": None,
        "errors": errors,
    }

    # Independent public sources run concurrently to keep the Vercel
    # serverless response inside the dashboard's network deadline.
    with ThreadPoolExecutor(max_workers=3) as pool:
        instagram_future = (
            pool.submit(_ig_profile)
            if not (os.environ.get("INSTAGRAM_ACCESS_TOKEN") and os.environ.get("INSTAGRAM_USER_ID"))
            else None
        )
        x_future = pool.submit(_x_profile)
        telegram_future = pool.submit(_telegram_recent)

        try:
            if os.environ.get("INSTAGRAM_ACCESS_TOKEN") and os.environ.get("INSTAGRAM_USER_ID"):
                result["instagram"] = _meta_instagram()
                result["instagram"]["source"] = "meta"
            else:
                user = instagram_future.result()
                followers = ((user.get("edge_followed_by") or {}).get("count"))
                if type(followers) is not int:
                    raise RuntimeError("instagram:invalid_followers")
                result["instagram"] = {
                    "handle": "@" + IG_HANDLE,
                    "followers": followers,
                    "posts": _ig_posts(user),
                    "source": "public",
                }
        except Exception as error:
            # Never include Meta response bodies, URLs with credentials or tokens.
            if os.environ.get("INSTAGRAM_ACCESS_TOKEN"):
                errors["instagram"] = "meta:unavailable"
            else:
                errors["instagram"] = str(error)[:240]

        if result["instagram"] is None:
            try:
                result["telegram"] = {"posts": telegram_future.result()}
            except Exception:
                errors["telegram"] = "telegram:unavailable"

        try:
            user = x_future.result()
            result["x"] = {
                "handle": "@" + X_HANDLE,
                "followers": user["followers"],
            }
        except Exception as error:
            errors["x"] = str(error)[:240]

    if result["instagram"] is None and result["telegram"] is None and result["x"] is None:
        return 503, result
    return 200, result


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlsplit(self.path)

        if parsed.path == "/media":
            post_id = (parse_qs(parsed.query).get("id") or [""])[0]
            try:
                body, content_type = _ig_media(post_id)
            except ValueError:
                _json_response(self, 400, {"error": "invalid_media_request"})
                return
            except LookupError:
                _json_response(self, 404, {"error": "media_not_found"})
                return
            except Exception:
                _json_response(self, 502, {"error": "media_unavailable"})
                return

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header(
                "Cache-Control",
                "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
            )
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
            self.end_headers()
            self.wfile.write(body)
            return

        status, payload = collect()
        _json_response(self, status, payload)

    def log_message(self, format, *args):
        return
