from http.server import BaseHTTPRequestHandler
import datetime as dt
import html
import json
import math
import re
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET

import yt_dlp

UTC = dt.timezone.utc
YOUTUBE_STREAMS = "https://www.youtube.com/@camaradosdeputadosoficial/streams"
GOOGLE_TRENDS = "https://trends.google.com/trending/rss?geo=BR"
X_TRENDS = "https://getdaytrends.com/brazil/"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155 Safari/537.36"

STRONG_TERMS = (
    "lula", "bolsonaro", "flavio bolsonaro", "moraes", "nunes marques",
    "stf", "supremo", "tse", "camara", "congresso", "senado", "deputad",
    "senador", "eleicao", "eleitoral", "voto", "votos validos", "governo",
    "ministro", "presidente", "mei", "meis", "escala 6x1", "6x1",
    "reforma", "pec", "projeto de lei", "pl ", "orcamento", "emenda",
    "censura", "sindicat", "trabalho", "previdencia", "imposto",
)
POLICY_TERMS = (
    "renda", "salario", "emprego", "saude", "educacao", "capes", "ufpb",
    "universidade", "seguranca", "violencia", "mulher", "crianca",
    "agricultura", "agro", "clima", "meio ambiente", "energia", "moradia",
    "transporte", "economia", "poupanca", "direitos", "internet",
    "inteligencia artificial", "tribut", "fiscal", "bolsa familia",
    "sus", "inss", "pix", "banco central", "poderdata",
)


def _fold(value):
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", value.lower()).strip()


def _clean_label(value):
    value = html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()
    value = value.lstrip("#").replace("_", " ")
    if not value:
        return ""
    spaced = re.sub(r"(?<=[a-zá-ú])(?=[A-ZÁ-Ú])", " ", value)
    folded = _fold(spaced)

    if ("mei" in folded or "meis" in folded) and "meio" not in folded:
        return "MEI"
    if "escala" in folded and "6x1" in folded:
        return "Escala 6x1"
    if "voto feminino" in folded:
        return "Voto feminino"
    if "sindicat" in folded:
        return "Sindicatos"
    if "poderdata" in folded or "poder data" in folded or "votos validos" in folded or (
        "pesquisa" in folded and ("btg" in folded or "eleit" in folded)
    ):
        return "Pesquisas eleitorais"
    if "nunes marques" in folded:
        return "Nunes Marques"
    if "capes" in folded:
        return "CAPES"
    if "ufpb" in folded:
        return "UFPB"
    if "lula" in folded:
        return "Lula"
    if "bolsonaro" in folded:
        return "Bolsonaro"
    if "stf" in folded or "supremo" in folded:
        return "STF"
    if folded == "renda":
        return "Renda"
    if folded == "poupanca":
        return "Poupança"

    if len(spaced) > 34:
        spaced = spaced[:31].rstrip() + "…"
    if spaced.isupper() and len(spaced) > 5:
        spaced = spaced.title()
    return spaced


def _relevance(value):
    folded = _fold(value)
    strong = sum(1 for term in STRONG_TERMS if term in folded)
    policy = sum(1 for term in POLICY_TERMS if term in folded)
    if strong:
        return 5 + min(strong - 1, 3) * 1.2 + policy * 0.5
    if policy:
        return 2.5 + min(policy - 1, 2) * 0.7
    return 0.0


def _request_text(url):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
        },
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        body = response.read(4_000_001)
    if len(body) > 4_000_000:
        raise RuntimeError("response_too_large")
    return body.decode("utf-8", errors="replace")


def _google_trends():
    xml = _request_text(GOOGLE_TRENDS)
    root = ET.fromstring(xml)
    rows = []
    for rank, item in enumerate(root.findall("./channel/item"), 1):
        title = (item.findtext("title") or "").strip()
        if not title:
            continue
        traffic = 0
        for child in item:
            if child.tag.endswith("approx_traffic") and child.text:
                digits = re.sub(r"[^0-9]", "", child.text)
                traffic = int(digits) if digits else 0
                break
        rows.append({"title": title, "rank": rank, "traffic": traffic})
    return rows


def _x_trends():
    page = _request_text(X_TRENDS)
    pattern = re.compile(
        r'<th[^>]*class="pos"[^>]*>(\d+)</th>\s*'
        r'<td[^>]*class="main"[^>]*>\s*<a[^>]*>(.*?)</a>',
        re.I | re.S,
    )
    rows = []
    for rank, title in pattern.findall(page):
        clean = html.unescape(re.sub(r"<[^>]+>", "", title)).strip()
        if clean:
            rows.append({"title": clean, "rank": int(rank)})
        if len(rows) >= 50:
            break
    return rows


def _topics():
    merged = {}
    source_state = {"google": "ok", "x": "ok"}

    try:
        google = _google_trends()
    except Exception:
        google = []
        source_state["google"] = "error"

    try:
        xrows = _x_trends()
    except Exception:
        xrows = []
        source_state["x"] = "error"

    def add(title, rank, source, traffic=0):
        relevance = _relevance(title)
        if relevance <= 0:
            return
        label = _clean_label(title)
        if not label:
            return
        key = _fold(label)
        if not key:
            return

        rank_score = max(0.0, 16.0 - rank * (1.15 if source == "google" else 0.42))
        traffic_bonus = min(3.0, math.log10(max(traffic, 1)) * 0.8) if traffic else 0.0
        score = relevance * 3.0 + rank_score + traffic_bonus

        row = merged.setdefault(
            key,
            {
                "label": label,
                "score": 0.0,
                "sources": set(),
                "bestRank": rank,
            },
        )
        row["score"] += score
        row["sources"].add(source)
        row["bestRank"] = min(row["bestRank"], rank)

    for row in google:
        add(row["title"], row["rank"], "google", row.get("traffic", 0))
    for row in xrows:
        add(row["title"], row["rank"], "x")

    for row in merged.values():
        if len(row["sources"]) > 1:
            row["score"] += 10.0

    ordered = sorted(
        merged.values(),
        key=lambda row: (-row["score"], row["bestRank"], row["label"].lower()),
    )[:12]

    if ordered:
        high = max(row["score"] for row in ordered)
        low = min(row["score"] for row in ordered)
    else:
        high = low = 0.0

    topics = []
    for row in ordered:
        if high == low:
            weight = 3
        else:
            weight = 1 + round(((row["score"] - low) / (high - low)) * 4)
        topics.append(
            {
                "label": row["label"],
                "weight": max(1, min(5, weight)),
                "sources": sorted(row["sources"]),
            }
        )

    return topics, source_state


def _live_streams():
    options = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "playlistend": 20,
        "skip_download": True,
        "socket_timeout": 20,
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(YOUTUBE_STREAMS, download=False)

    streams = []
    for entry in (info.get("entries") or []):
        if entry.get("live_status") != "is_live" and not entry.get("is_live"):
            continue
        video_id = entry.get("id")
        title = entry.get("title")
        if not isinstance(video_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{6,20}", video_id):
            continue
        if not isinstance(title, str):
            title = "Câmara dos Deputados ao vivo"
        streams.append(
            {
                "id": video_id,
                "title": title[:180],
                "watchUrl": "https://www.youtube.com/watch?v=" + video_id,
                "embedUrl": (
                    "https://www.youtube.com/embed/"
                    + video_id
                    + "?autoplay=1&mute=1&controls=0&rel=0&playsinline=1"
                ),
                "thumbnail": "https://i.ytimg.com/vi/" + video_id + "/hqdefault.jpg",
            }
        )
        if len(streams) >= 3:
            break
    return streams


def collect():
    topics, trend_sources = _topics()

    try:
        streams = _live_streams()
        youtube_state = "ok"
    except Exception:
        streams = []
        youtube_state = "error"

    return {
        "collectedAt": dt.datetime.now(UTC).isoformat(),
        "topics": topics,
        "liveStreams": streams,
        "sources": {
            "google": trend_sources["google"],
            "x": trend_sources["x"],
            "youtube": youtube_state,
        },
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        payload = collect()
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return
