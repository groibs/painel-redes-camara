"""Read-only social collector. Python 3.12+, standard library only."""
import concurrent.futures
import datetime as dt
import hmac
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UTC = dt.timezone.utc
NAMES = {"instagram": "Instagram", "facebook": "Facebook", "youtube": "YouTube", "x": "X / Twitter", "tiktok": "TikTok"}
ORDER = ["instagram", "tiktok", "x", "youtube", "facebook"]
MAX_RESPONSE = 1_000_000


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get_json(url, params, token=None):
    headers = {"Accept": "application/json", "User-Agent": "RedeCamaraCollector/1"}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(url + "?" + urllib.parse.urlencode(params), headers=headers)
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=15) as response:
        body = response.read(MAX_RESPONSE + 1)
    if len(body) > MAX_RESPONSE:
        raise ValueError("response_limit")
    data = json.loads(body)
    if not isinstance(data, dict):
        raise ValueError("invalid_response")
    return data


def count(value):
    if isinstance(value, str) and value.isdigit():
        value = int(value)
    if type(value) is not int or not 0 <= value <= 2**53 - 1:
        raise ValueError("invalid_count")
    return value


def https(value, instagram=False):
    if not isinstance(value, str) or len(value) > 3000:
        return None
    url = urllib.parse.urlsplit(value)
    if url.scheme != "https" or not url.hostname or url.username or url.password:
        return None
    if instagram and url.hostname not in ("instagram.com", "www.instagram.com"):
        return None
    return value


def account(network, handle, followers):
    return {"id": network, "name": NAMES[network], "handle": str(handle or "")[:100],
            "followers": count(followers), "change24h": None}


def normalize_posts(rows):
    if not isinstance(rows, list):
        raise ValueError("invalid_posts")
    posts = []
    seen = set()
    for row in rows[:12]:
        identifier = str(row.get("id", ""))
        if not identifier or len(identifier) > 100 or identifier in seen:
            raise ValueError("invalid_post_id")
        seen.add(identifier)
        date = dt.datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00"))
        if date.tzinfo is None:
            raise ValueError("missing_post_timezone")
        media_type = row.get("media_type")
        if media_type not in ("IMAGE", "VIDEO", "CAROUSEL_ALBUM"):
            raise ValueError("invalid_media_type")
        children = row.get("children", {}).get("data", [])
        first = children[0] if children else {}
        media = (row.get("thumbnail_url") if media_type == "VIDEO" else row.get("media_url"))
        media = media or first.get("thumbnail_url") or first.get("media_url")
        posts.append({"id": identifier, "caption": str(row.get("caption") or "")[:4000],
                      "publishedAt": date.astimezone(UTC).isoformat(),
                      "type": {"IMAGE": "image", "VIDEO": "video", "CAROUSEL_ALBUM": "carousel"}[media_type],
                      "mediaUrl": https(media), "permalink": https(row.get("permalink"), True),
                      "likes": count(row["like_count"]) if row.get("like_count") is not None else None,
                      "comments": count(row["comments_count"]) if row.get("comments_count") is not None else None})
    return sorted(posts, key=lambda p: p["publishedAt"], reverse=True)


def meta_base(env, instagram=False):
    version = env.get("META_API_VERSION", "")
    if not re.fullmatch(r"v[0-9]+\.[0-9]+", version):
        raise ValueError("meta_version_required")
    mode = env.get("INSTAGRAM_LOGIN", "instagram")
    if mode not in ("instagram", "facebook"):
        raise ValueError("invalid_instagram_login")
    host = "graph.instagram.com" if instagram and mode == "instagram" else "graph.facebook.com"
    return f"https://{host}/{version}"


def fetch_component(key, env, get=get_json):
    if key.startswith("instagram"):
        user = urllib.parse.quote(env["INSTAGRAM_USER_ID"], safe="")
        base = meta_base(env, True) + "/" + user
        token = env["INSTAGRAM_ACCESS_TOKEN"]
        if key == "instagram.posts":
            data = get(base + "/media", {"limit": "6", "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{media_url,thumbnail_url}"}, token)
            return normalize_posts(data["data"])
        data = get(base, {"fields": "username,followers_count"}, token)
        return account("instagram", data.get("username"), data["followers_count"])
    if key == "facebook":
        page = urllib.parse.quote(env["FACEBOOK_PAGE_ID"], safe="")
        data = get(meta_base(env) + "/" + page, {"fields": "name,followers_count"}, env["FACEBOOK_PAGE_ACCESS_TOKEN"])
        return account(key, env.get("FACEBOOK_HANDLE", data.get("name")), data["followers_count"])
    if key == "youtube":
        data = get("https://www.googleapis.com/youtube/v3/channels", {"part": "statistics,snippet", "id": env["YOUTUBE_CHANNEL_ID"], "key": env["YOUTUBE_API_KEY"]})
        item = data["items"][0]
        if item["statistics"].get("hiddenSubscriberCount"):
            raise ValueError("hidden_subscribers")
        return account(key, item["snippet"].get("customUrl", item["snippet"].get("title")), item["statistics"]["subscriberCount"])
    if key == "x":
        user = urllib.parse.quote(env["X_USER_ID"], safe="")
        data = get("https://api.x.com/2/users/" + user, {"user.fields": "public_metrics"}, env["X_BEARER_TOKEN"])["data"]
        return account(key, data.get("username"), data["public_metrics"]["followers_count"])
    data = get("https://open.tiktokapis.com/v2/user/info/", {"fields": "display_name,follower_count"}, env["TIKTOK_ACCESS_TOKEN"])
    if data.get("error", {}).get("code") != "ok":
        raise ValueError("tiktok_api_error")
    user = data["data"]["user"]
    return account("tiktok", env.get("TIKTOK_HANDLE", user.get("display_name")), user["follower_count"])


REQUIRED = {"instagram": ["INSTAGRAM_USER_ID", "INSTAGRAM_ACCESS_TOKEN", "META_API_VERSION"],
            "instagram.posts": ["INSTAGRAM_USER_ID", "INSTAGRAM_ACCESS_TOKEN", "META_API_VERSION"],
            "facebook": ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN", "META_API_VERSION"],
            "youtube": ["YOUTUBE_CHANNEL_ID", "YOUTUBE_API_KEY"],
            "x": ["X_USER_ID", "X_BEARER_TOKEN"], "tiktok": ["TIKTOK_ACCESS_TOKEN"]}


class Store:
    def __init__(self, path):
        self.path = path
        with self.connect() as db:
            db.executescript("""
              CREATE TABLE IF NOT EXISTS components (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated REAL NOT NULL);
              CREATE TABLE IF NOT EXISTS history (network TEXT, stamp REAL, followers INTEGER, PRIMARY KEY(network, stamp));
              CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, stamp REAL NOT NULL);
            """)

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def due(self, key, now, interval):
        with self.connect() as db:
            row = db.execute("SELECT stamp FROM attempts WHERE key=?", (key,)).fetchone()
        return not row or now - row[0] >= interval

    def attempted(self, key, now):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO attempts VALUES (?,?)", (key, now))

    def save(self, key, value, now):
        value = json.loads(json.dumps(value))
        with self.connect() as db:
            if key != "instagram.posts":
                cutoff = now - 86400
                baseline = db.execute("SELECT stamp,followers FROM history WHERE network=? AND stamp<=? ORDER BY stamp DESC LIMIT 1", (key, cutoff)).fetchone()
                value["change24h"] = value["followers"] - baseline[1] if baseline and cutoff - baseline[0] <= 1800 else None
                value["updatedAt"] = dt.datetime.fromtimestamp(now, UTC).isoformat()
                db.execute("INSERT OR REPLACE INTO history VALUES (?,?,?)", (key, now, value["followers"]))
            db.execute("INSERT OR REPLACE INTO components VALUES (?,?,?)", (key, json.dumps(value), now))
            db.execute("DELETE FROM history WHERE stamp<?", (now - 259200,))

    def snapshot(self):
        with self.connect() as db:
            rows = db.execute("SELECT key,value,updated FROM components").fetchall()
        if not rows:
            return None
        data = {key: json.loads(value) for key, value, _ in rows}
        return {"schemaVersion": 1, "collectedAt": dt.datetime.fromtimestamp(max(r[2] for r in rows), UTC).isoformat(),
                "accounts": [data[key] for key in ORDER if key in data], "posts": data.get("instagram.posts", [])}


def collect(store, env, now=None, fetch=fetch_component):
    now = time.time() if now is None else now
    pending = []
    for key, fields in REQUIRED.items():
        if not all(env.get(field) for field in fields):
            continue
        interval = int(env.get("POSTS_INTERVAL_SECONDS" if key == "instagram.posts" else "FOLLOWERS_INTERVAL_SECONDS", "300" if key == "instagram.posts" else "900"))
        if interval < 60:
            raise ValueError("interval_too_short")
        if store.due(key, now, interval):
            store.attempted(key, now)
            pending.append(key)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        tasks = {pool.submit(fetch, key, env): key for key in pending}
        for task in concurrent.futures.as_completed(tasks):
            key = tasks[task]
            try:
                store.save(key, task.result(), now)
                logging.info("%s updated", key)
            except Exception as error:
                # Never include exception messages: URLs can contain credentials.
                logging.warning("%s unavailable (%s)", key, type(error).__name__)


def run():
    os.umask(0o077)
    env = dict(os.environ)
    token = env.get("COLLECTOR_READ_TOKEN", "")
    if len(token) < 32:
        raise SystemExit("COLLECTOR_READ_TOKEN must contain at least 32 characters")
    state_dir = Path(env.get("COLLECTOR_STATE_DIR", "/var/lib/rede-camara-social"))
    state_dir.mkdir(parents=True, exist_ok=True)
    store = Store(state_dir / "collector.sqlite3")
    stopping = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if not hmac.compare_digest(self.headers.get("Authorization", "").encode(), ("Bearer " + token).encode()):
                self.send_error(401)
                return
            if self.path != "/snapshot.json":
                self.send_error(404)
                return
            snapshot = store.snapshot()
            body = json.dumps(snapshot or {"error": "No authorized data collected yet"}, ensure_ascii=False).encode()
            self.send_response(200 if snapshot else 503)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format, *args):
            pass

    def worker():
        while not stopping.is_set():
            try:
                collect(store, env)
            except Exception as error:
                logging.error("collection_cycle_failed (%s)", type(error).__name__)
            stopping.wait(30)

    server = ThreadingHTTPServer(("127.0.0.1", int(env.get("COLLECTOR_PORT", "8715"))), Handler)
    threading.Thread(target=worker, daemon=True).start()
    try:
        server.serve_forever()
    finally:
        stopping.set()
        server.server_close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run()
