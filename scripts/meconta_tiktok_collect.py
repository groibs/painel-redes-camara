#!/usr/bin/env python3
import csv, json, re, time, urllib.parse, urllib.request, urllib.error, unicodedata
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo

ACCOUNT="camaradosdeputados"
SEEDS=["7691824772937813266","7686996817912810773","7663241203655232789","7660886571469753621"]
MIN_TIME=int(datetime(2025,9,25,tzinfo=timezone.utc).timestamp())
TZ=ZoneInfo("America/Sao_Paulo")
OUT=Path("data/meconta-tiktok")
OUT.mkdir(parents=True,exist_ok=True)
API="https://www.tikwm.com/api/"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36"
errors=[]
def textnorm(s):
 return ''.join(c for c in unicodedata.normalize("NFKD",s or "") if not unicodedata.combining(c)).lower()
def dt_from_id(i):
 try:return datetime.fromtimestamp(int(i)>>32,timezone.utc).astimezone(TZ)
 except:return None
def fetch(path="",params=None):
 u=API+path+("?"+urllib.parse.urlencode(params) if params else "")
 last=""
 for i in range(2):
  try:
   req=urllib.request.Request(u,headers={"User-Agent":UA,"Accept":"application/json","Referer":"https://www.tikwm.com/"})
   with urllib.request.urlopen(req,timeout=25) as res:r=json.loads(res.read().decode())
   if r.get("code") != 0: raise ValueError("API "+str(r.get("msg",r.get("code"))))
   return r.get("data")
  except Exception as e:
   last=str(e);time.sleep(2)
 errors.append({"url":u,"error":last})
 return None
def parse(v,origin):
 if not isinstance(v,dict):return None
 vid=str(v.get("id") or v.get("video_id") or "")
 if not vid.isdigit():return None
 author=v.get("author") or {}
 if isinstance(author,dict) and author.get("unique_id") and author.get("unique_id").lstrip("@").lower()!=ACCOUNT:return None
 title=v.get("title") or v.get("desc") or ""
 t=textnorm(title)
 direct=bool(re.search(r'me\s*conta\s*\+|me\s*conta\s*mais|#mecontamais|#mecontaplus',t))
 candidate=bool(re.search(r'videocast|podcast da camara|meconta|estudio de vidro',t))
 if not (direct or candidate or vid in SEEDS):return None
 dt= datetime.fromtimestamp(int(v.get("create_time")),timezone.utc).astimezone(TZ) if v.get("create_time") else dt_from_id(vid)
 dur=v.get("duration")
 try:dur=int(dur) if dur is not None else None
 except:dur=None
 if dur is not None and direct: typ="provável íntegra" if dur>=720 else "provável corte" if dur<=180 else "revisar"
 else:typ="indeterminado"
 def count(k):
  z=v.get(k);return z if isinstance(z,int) and not isinstance(z,bool) else None
 return dict(id_video=vid,data_publicacao=dt.strftime("%Y-%m-%d") if dt else "",hora_brasilia=dt.strftime("%H:%M:%S") if dt else "",
  origem_data="create_time" if v.get("create_time") else "ID inferido",
  url=f"https://www.tiktok.com/@{ACCOUNT}/video/{vid}",descricao=title,
  status_programa="confirmado legenda" if direct else "indicado usuário" if vid in SEEDS else "candidato",
  tipo_video=typ,episodio_origem="",videos_relacionados="",duracao_s=dur,
  visualizacoes=count("play_count"),curtidas=count("digg_count"),comentarios=count("comment_count"),
  compartilhamentos=count("share_count"),salvamentos=count("collect_count"),downloads=count("download_count"),
  tempo_medio_s=None,retencao_pct=None,fonte="TikWM",origem_coleta=origin,
  coletado_em=datetime.now(TZ).isoformat(timespec="seconds"))
posts={};pages=0;seen=set();cursor="0";checked=0;reached=False
# First: confirm the four user URLs. Never replace null counters with zeros.
for vid in SEEDS:
 raw=fetch(params={"url":f"https://www.tiktok.com/@{ACCOUNT}/video/{vid}"})
 rec=parse(raw,"link enviado") if raw else None
 if rec:posts[vid]=rec
 else:
  d=dt_from_id(vid)
  posts[vid]=dict(id_video=vid,data_publicacao=d.strftime("%Y-%m-%d") if d else "",hora_brasilia=d.strftime("%H:%M:%S") if d else "",
   origem_data="ID inferido",url=f"https://www.tiktok.com/@{ACCOUNT}/video/{vid}",descricao="",status_programa="indicado usuário",
   tipo_video="indeterminado",episodio_origem="",videos_relacionados="",duracao_s=None,
   visualizacoes=None,curtidas=None,comentarios=None,compartilhamentos=None,salvamentos=None,downloads=None,
   tempo_medio_s=None,retencao_pct=None,fonte="Sem confirmação externa",origem_coleta="link enviado",
   coletado_em=datetime.now(TZ).isoformat(timespec="seconds"))
 print("SEED",vid,"data_found",bool(rec),flush=True)
 time.sleep(.3)
# Then: entire visible account feed until program began
for p in range(160):
 if cursor in seen:break
 seen.add(cursor)
 data=fetch("user/posts",{"unique_id":ACCOUNT,"count":35,"cursor":cursor})
 if not isinstance(data,dict): break
 videos=data.get("videos",[])
 if not videos: break
 pages+=1;checked+=len(videos)
 timestamps=[]
 for v in videos:
  vid=str(v.get("id") or v.get("video_id") or "")
  dt=dt_from_id(vid)
  if dt:timestamps.append(dt.timestamp())
  if dt and dt.timestamp() < MIN_TIME:continue
  rec=parse(v,"varredura paginada")
  if rec and (vid not in posts or posts[vid]["visualizacoes"] is None):posts[vid]=rec
 print("PAGE",pages,"feed",len(videos),"qualified",len(posts),"cursor",cursor,flush=True)
 if timestamps and max(timestamps)<MIN_TIME:reached=True;break
 c=str(data.get("cursor") or "")
 if not data.get("hasMore") or not c or c==cursor:break
 cursor=c
 time.sleep(1.0)
# Alternative discovery via keyword search when profile pagination is unavailable.
searches=0
for keyword in ["Me Conta+ Câmara dos Deputados","Me Conta Mais Câmara","mecontamais","Me Conta+"]:
 cursor_search=0
 for idx in range(3):
  data=fetch("feed/search",{"keywords":keyword,"count":35,"cursor":cursor_search,"web":1})
  if not isinstance(data,dict):break
  videos=data.get("videos") or []
  if not isinstance(videos,list) or not videos:break
  searches+=1
  matched=0
  for v in videos:
   if not isinstance(v,dict):continue
   author=v.get("author") or {}
   if not isinstance(author,dict) or str(author.get("unique_id","")).lstrip("@").lower()!=ACCOUNT:continue
   dt=dt_from_id(str(v.get("id") or v.get("video_id") or ""))
   if dt and dt.timestamp()<MIN_TIME:continue
   r=parse(v,"busca por "+keyword)
   if r:
    posts[r["id_video"]]=r
    matched+=1
  print("SEARCH",keyword,idx,"results",len(videos),"matched",matched,flush=True)
  nextcursor=data.get("cursor")
  if nextcursor is None or str(nextcursor)==str(cursor_search):cursor_search+=len(videos)
  else:cursor_search=nextcursor
  if idx and matched==0:break
  time.sleep(.7)

# conservative group through repeated interviewee names from preexisting catalog is postponed pending review.
rows=sorted(posts.values(),key=lambda x:x["id_video"])
fields=list(rows[0].keys())
with (OUT/"publicacoes.csv").open("w",encoding="utf-8-sig",newline="") as f:
 w=csv.DictWriter(f,fieldnames=fields,delimiter=";");w.writeheader();w.writerows(rows)
(OUT/"publicacoes.json").write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf-8")
report={"run_at":datetime.now(TZ).isoformat(),"total_posts":len(rows),"posts_with_metrics":sum(r["visualizacoes"] is not None for r in rows),
 "feed_pages":pages,"all_feed_videos_checked":checked,"search_pages":searches,"reached_2025_09_25":reached,"errors":errors[:25],"error_count":len(errors)}
(OUT/"relatorio.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("FINAL REPORT",json.dumps(report,ensure_ascii=False),flush=True)
