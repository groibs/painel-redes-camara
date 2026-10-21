#!/usr/bin/env python3
"""Public TikTok profile history discovery: no login, no private content."""
import unicodedata,json,subprocess,urllib.request,urllib.parse,os,re,html,time,datetime,traceback
from pathlib import Path
O=Path("data/meconta-tiktok");O.mkdir(parents=True,exist_ok=True)
HANDLE="camaradosdeputados"
logs=[]; candidates={}
def log(name,status,detail=None):
 d={"strategy":name,"status":status,"detail":str(detail)[:2500] if detail is not None else ""};logs.append(d);print("PROBE",name,status,d["detail"][:160],flush=True)
def get(name,url,ua=None):
 try:
  req=urllib.request.Request(url,headers={"User-Agent":ua or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36","Accept-Language":"pt-BR,pt;q=0.9,en-US;q=0.8"})
  with urllib.request.urlopen(req,timeout=22) as r:
   raw=r.read(2_800_000).decode("utf-8","replace");status=r.status
  for vid in set(re.findall(r'(?:/video/|/photo/|\\"id\\":\\"|%2Fvideo%2F)(7\d{18})',raw,re.I)):candidates.setdefault(vid,[]).append(name)
  for vid in set(re.findall(r'(?<!\d)(7\d{18})(?!\d)',raw)):
   if "Me Conta" in raw or "meconta" in raw.lower():candidates.setdefault(vid,[]).append(name+"-unqualified")
  log(name,status,"length="+str(len(raw))+" candidates="+str(len(candidates))+" head="+raw[:150])
  (O/("probe_"+re.sub("[^a-z0-9]","_",name.lower())+".html")).write_text(raw[:1000000],encoding="utf-8")
  return raw
 except Exception as e:log(name,"fail",repr(e));return ""
urls={
 "profile_desktop":f"https://www.tiktok.com/@{HANDLE}",
 "profile_mobile":f"https://m.tiktok.com/@{HANDLE}",
 "urlebird":f"https://urlebird.com/user/{HANDLE}/",
 "ttviewer":f"https://ttviewer.org/@{HANDLE}",
 "tikwm_profile":f"https://www.tikwm.com/user/@{HANDLE}",
 "duckduckgo":f"https://www.google.com/search?"+urllib.parse.urlencode({"q":f'site:tiktok.com/@{HANDLE}/video/ "Me Conta"'}),
 "bing":f"https://www.bing.com/search?"+urllib.parse.urlencode({"q":f'"Me Conta" "{HANDLE}" TikTok'}),
}
for name,u in urls.items():get(name,u)
try:
 process=subprocess.run(["yt-dlp","--flat-playlist","--dump-single-json","--no-warnings","--socket-timeout","20","--playlist-end","800","https://www.tiktok.com/@"+HANDLE],capture_output=True,text=True,timeout=110)
 out=process.stdout
 if out.strip():
  try:
   data=json.loads(out)
   vids=data.get("entries") or []
   compact=[]
   for v in vids:
    if not v:continue
    vid=str(v.get("id") or "")
    if not re.fullmatch("7[0-9]{18}",vid):continue
    timestamp=v.get("timestamp") or (int(vid)>>32)
    row={"id":vid,"title":v.get("title"),"description":v.get("description"),"duration_s":v.get("duration"),
         "published_epoch":timestamp,"published_utc":datetime.datetime.fromtimestamp(timestamp,datetime.timezone.utc).isoformat(),
         "view_count":v.get("view_count"),"like_count":v.get("like_count"),"comment_count":v.get("comment_count"),
         "share_count":v.get("repost_count"),"save_count":v.get("save_count"),"url":v.get("url"),
         "uploader":v.get("uploader"),"extractor":"yt_dlp profile flat"}
    compact.append(row)
   cutoff=datetime.datetime(2025,9,1,tzinfo=datetime.timezone.utc).timestamp()
   within=[v for v in compact if v["published_epoch"]>=cutoff]
   for v in within:
    norm=unicodedata.normalize("NFKD",v["description"] or "")
    norm="".join(c for c in norm if not unicodedata.combining(c)).lower()
    strong=bool(re.search(r'me\s*conta\s*\+|me\s*conta\s*mais|#mecontamais|#mecontaplus|#meconta\b',norm))
    weak=bool(re.search(r'videocast|podcast da camara|meconta',norm))
    v["match_status"]="CONFIRMADO_LEGENDA" if strong else "REVISAR_CANDIDATO" if weak else "NAO_IDENTIFICADO"
   (O/"perfil_tiktok_desde_set2025.json").write_text(json.dumps(within,ensure_ascii=False,indent=2),encoding="utf-8")
   selected=[v for v in within if v["match_status"]!="NAO_IDENTIFICADO"]
   (O/"meconta_identificados.json").write_text(json.dumps(selected,ensure_ascii=False,indent=2),encoding="utf-8")
   import csv
   with (O/"meconta_identificados.csv").open("w",newline="",encoding="utf-8-sig") as f:
    w=csv.DictWriter(f,fieldnames=list(selected[0].keys()) if selected else list(compact[0].keys()),delimiter=";")
    w.writeheader();w.writerows(selected)
   log("yt_dlp_enumeration",0,"total="+str(len(compact))+" since_start="+str(len(within))+" matched="+str(len(selected))+" confirmed="+str(sum(v["match_status"]=="CONFIRMADO_LEGENDA" for v in selected)))
   for video in data.get("entries") or []:
    if video:
     vid=str(video.get("id") or "")
     if re.fullmatch("7[0-9]{18}",vid):candidates.setdefault(vid,[]).append("yt_dlp")
   (O/"probe_ytdlp.json").write_text(json.dumps(data,ensure_ascii=False,indent=2)[:800000],encoding="utf-8")
  except Exception:pass
 log("yt_dlp",process.returncode,"entries="+str(len(candidates))+" "+process.stderr[-1100:])
except Exception as e:log("yt_dlp","exception",repr(e))
(O/"descoberta_publica.json").write_text(json.dumps({"ran_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"candidates":candidates,"logs":logs},indent=2,ensure_ascii=False),encoding="utf-8")
print("FINAL CANDIDATES",json.dumps(candidates,ensure_ascii=False)[:1200],flush=True)
