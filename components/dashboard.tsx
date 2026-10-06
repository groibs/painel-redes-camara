"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  Heart,
  Image as ImageIcon,
  Layers,
  MapPin,
  Maximize2,
  MessageCircle,
  Minimize2,
  Music2,
  Play,
  Radio,
  RefreshCw,
  Settings2,
  TrendingDown,
  TrendingUp,
  Users,
  Vote as VoteIcon,
  X,
} from "lucide-react";
import { demoPanel, emptyPanel } from "@/lib/data";
import {
  brasiliaDate,
  compactNumber,
  eventDate,
  fullNumber,
  isCancelled,
  isOngoing,
  mergePanel,
  shiftDate,
  timeOf,
  TIMEZONE,
} from "@/lib/format";
import type {
  AgendaEvent,
  NetworkId,
  PanelData,
  SocialAccount,
  SocialPost,
  Vote,
} from "@/lib/types";

const CACHE_KEY = "rede-camara:snapshot:v1";
const SETTINGS_KEY = "rede-camara:display:v1";
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  timeZone: TIMEZONE,
});
const dayFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  timeZone: TIMEZONE,
});

function NetworkIcon({ id }: { id: NetworkId }) {
  if (id === "tiktok") return <Music2 aria-hidden="true" />;
  if (id === "x")
    return (
      <span aria-hidden="true" className="x-mark">
        𝕏
      </span>
    );
  if (id === "facebook")
    return (
      <span aria-hidden="true" className="facebook-mark">
        f
      </span>
    );
  return (
    <span aria-hidden="true" className="instagram-mark">
      <span />
    </span>
  );
}

function MetricCard({
  account,
  stale,
}: {
  account: SocialAccount;
  stale: boolean;
}) {
  const delta = account.change24h;
  const old =
    !!account.updatedAt &&
    Date.now() - Date.parse(account.updatedAt) > 30 * 60 * 1000;
  return (
    <article className={`metric-card metric-${account.id}`}>
      <div className="metric-heading">
        <span className="network-icon">
          <NetworkIcon id={account.id} />
        </span>
        <h2>{account.name}</h2>
        <span className="network-handle">{account.handle}</span>
      </div>
      <div className="metric-value" title={fullNumber(account.followers)}>
        {compactNumber(account.followers)}
      </div>
      <div className="metric-bottom">
        <span>seguidores</span>
        {delta !== null ? (
          <span className={`metric-delta ${delta < 0 ? "negative" : ""}`}>
            {delta < 0 ? <TrendingDown /> : <TrendingUp />}
            {delta > 0 ? "+" : ""}
            {fullNumber(delta)} <small>em 24h</small>
          </span>
        ) : (
          <span className="metric-pending">
            {account.followers === null
              ? "Aguardando conexão"
              : "Coleta recebida"}
          </span>
        )}
      </div>
      {(old || stale) && account.followers !== null && (
        <span className="metric-old">Última coleta disponível</span>
      )}
    </article>
  );
}

function EventLabel({ event }: { event: AgendaEvent }) {
  if (isOngoing(event))
    return (
      <span className="event-status ongoing">
        <Radio />
        Em andamento
      </span>
    );
  return (
    <span className={`event-status ${isCancelled(event) ? "cancelled" : ""}`}>
      {event.status || "Programado"}
    </span>
  );
}

function Agenda({
  data,
  page,
  setPage,
}: {
  data: PanelData;
  page: number;
  setPage: (value: number) => void;
}) {
  const all = data.events
    .filter((event) => eventDate(event) === data.date)
    .sort(
      (a, b) =>
        Number(isCancelled(a)) - Number(isCancelled(b)) ||
        Number(isOngoing(b)) - Number(isOngoing(a)) ||
        a.startsAt.localeCompare(b.startsAt),
    );
  const pages = Math.max(1, Math.ceil(all.length / 3));
  const selected = Math.min(page, pages - 1);
  const events = all.slice(selected * 3, selected * 3 + 3);
  const ongoing = all.filter(isOngoing).length;
  return (
    <section className="today-panel" aria-labelledby="today-title">
      <div className="section-top">
        <div>
          <span className="eyebrow">AGENDA LEGISLATIVA</span>
          <h1 id="today-title">HOJE NA CÂMARA</h1>
        </div>
        <span className="day-total">
          <CalendarDays />
          {all.length} {all.length === 1 ? "evento" : "eventos"}
        </span>
      </div>
      <div className="today-subline">
        <span>
          {ongoing
            ? `${ongoing} ${ongoing === 1 ? "atividade em andamento" : "atividades em andamento"}`
            : "Acompanhe as atividades do dia"}
        </span>
        <span>Horário de Brasília</span>
      </div>
      {events.length ? (
        <div className="event-list">
          {events.map((event, index) => (
            <article
              className={`event-row ${isOngoing(event) ? "event-featured" : ""}`}
              key={event.id}
            >
              <div className="event-time">
                <span>{timeOf(event.startsAt)}</span>
                {isOngoing(event) && <span className="live-line" />}
              </div>
              <div className="event-content">
                <div className="event-kicker">
                  <span>{event.type || event.organ}</span>
                  <EventLabel event={event} />
                </div>
                <h2>
                  {event.url ? (
                    <a href={event.url} target="_blank" rel="noreferrer">
                      {event.title}
                    </a>
                  ) : (
                    event.title
                  )}
                </h2>
                <div className="event-meta">
                  <span>{event.organ}</span>
                  <span>
                    <MapPin />
                    {event.location}
                  </span>
                </div>
              </div>
              <span className="event-index">0{index + 1 + selected * 3}</span>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-agenda">
          <CalendarDays />
          <h2>
            {data.sources.agenda.state === "pending"
              ? "Consultando a agenda"
              : data.sources.agenda.state === "error"
                ? "Agenda temporariamente indisponível"
                : "Nenhum evento publicado para hoje"}
          </h2>
          <p>
            {data.sources.agenda.state === "ok"
              ? "Novas atividades aparecerão aqui quando forem publicadas pela Câmara."
              : "O painel consulta a fonte oficial automaticamente."}
          </p>
        </div>
      )}
      <div className="section-bottom">
        <span>
          {data.demo
            ? "Programação ilustrativa"
            : "Programação oficial · sujeita a alterações"}
        </span>
        <div className="pager">
          <button
            type="button"
            aria-label="Eventos anteriores"
            disabled={selected === 0}
            onClick={() => setPage(selected - 1)}
          >
            <ChevronLeft />
          </button>
          <span>
            {String(selected + 1).padStart(2, "0")}{" "}
            <b>/ {String(pages).padStart(2, "0")}</b>
          </span>
          <button
            type="button"
            aria-label="Próximos eventos"
            disabled={selected >= pages - 1}
            onClick={() => setPage(selected + 1)}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
    </section>
  );
}

function Week({
  data,
  offset,
  setOffset,
}: {
  data: PanelData;
  offset: number;
  setOffset: (value: number) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) =>
    shiftDate(data.weekStart, index),
  );
  const dates = days.slice(offset, offset + 4);
  const start = new Date(`${data.weekStart}T12:00:00-03:00`);
  const end = new Date(`${data.weekEnd}T12:00:00-03:00`);
  const range = `${start.getDate().toString().padStart(2, "0")}–${end.getDate().toString().padStart(2, "0")} ${new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE, month: "short" }).format(end).replace(".", "")}`;
  return (
    <section className="week-panel" aria-labelledby="week-title">
      <div className="week-heading">
        <div>
          <span className="eyebrow">PRÓXIMAS ATIVIDADES</span>
          <h2 id="week-title">CÂMARA NA SEMANA</h2>
        </div>
        <span className="week-range">{range}</span>
      </div>
      <div className="week-list">
        {dates.map((date) => {
          const events = data.events.filter(
            (event) => eventDate(event) === date && !isCancelled(event),
          );
          const isToday = date === data.date;
          return (
            <article
              key={date}
              className={`week-row ${isToday ? "week-today" : ""}`}
            >
              <div className="week-date">
                <strong>{date.slice(-2)}</strong>
                <span>
                  {new Intl.DateTimeFormat("pt-BR", {
                    weekday: "short",
                    timeZone: TIMEZONE,
                  })
                    .format(new Date(`${date}T12:00:00-03:00`))
                    .replace(".", "")}
                </span>
              </div>
              <div className="week-content">
                <div className="week-day-label">
                  {isToday
                    ? "HOJE"
                    : dayFormat.format(new Date(`${date}T12:00:00-03:00`))}
                  {events.length > 1 && (
                    <span>
                      +{events.length - 1}{" "}
                      {events.length === 2 ? "atividade" : "atividades"}
                    </span>
                  )}
                </div>
                <h3>
                  {events[0]?.title ||
                    (data.sources.agenda.state === "pending"
                      ? "Consultando programação"
                      : data.sources.agenda.state === "error"
                        ? "Programação indisponível"
                        : "Sem atividade publicada")}
                </h3>
                {events[0] ? (
                  <p>
                    <Clock3 />
                    {timeOf(events[0].startsAt)}
                    <span>·</span>
                    {events[0].organ}
                  </p>
                ) : (
                  <p>Agenda oficial da Câmara</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="week-bottom">
        <span>
          {data.events.filter((event) => !isCancelled(event)).length} atividades
          na semana
        </span>
        <div className="pager">
          <button
            type="button"
            aria-label="Início da semana"
            disabled={offset === 0}
            onClick={() => setOffset(0)}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            aria-label="Fim da semana"
            disabled={offset === 3}
            onClick={() => setOffset(3)}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
    </section>
  );
}

function VotePanel({ vote, demo }: { vote: Vote | null; demo: boolean }) {
  const total = (vote?.yes ?? 0) + (vote?.no ?? 0) + (vote?.other ?? 0);
  return (
    <section className="vote-panel">
      <div className="section-top">
        <div>
          <span className="eyebrow">PLENÁRIO</span>
          <h1>RESULTADO DA VOTAÇÃO</h1>
        </div>
        <VoteIcon />
      </div>
      {vote ? (
        <>
          <div className="vote-heading">
            <span className="vote-result">
              {demo ? "EXEMPLO ILUSTRATIVO" : "RESULTADO REGISTRADO"}
            </span>
            <h2>{vote.title}</h2>
            <p>{vote.description}</p>
          </div>
          <div className="vote-counts">
            <div>
              <span>SIM</span>
              <strong>{fullNumber(vote.yes)}</strong>
            </div>
            <div>
              <span>NÃO</span>
              <strong>{fullNumber(vote.no)}</strong>
            </div>
            <div>
              <span>OUTROS</span>
              <strong>{fullNumber(vote.other)}</strong>
            </div>
          </div>
          <div
            className="vote-track"
            aria-label={`Sim: ${fullNumber(vote.yes)}. Não: ${fullNumber(vote.no)}. Outros: ${fullNumber(vote.other)}.`}
          >
            {total > 0 && (
              <>
                <span
                  style={{ width: `${((vote.yes ?? 0) / total) * 100}%` }}
                />
                <span style={{ width: `${((vote.no ?? 0) / total) * 100}%` }} />
                <span
                  style={{ width: `${((vote.other ?? 0) / total) * 100}%` }}
                />
              </>
            )}
          </div>
          <div className="vote-foot">
            <span>
              {vote.approved === true ? (
                <>
                  <Check />
                  Aprovada
                </>
              ) : vote.approved === false ? (
                "Não aprovada"
              ) : (
                "Resultado registrado"
              )}
            </span>
            <span>
              {new Intl.DateTimeFormat("pt-BR", {
                timeZone: TIMEZONE,
                day: "2-digit",
                month: "2-digit",
              }).format(new Date(vote.registeredAt))}{" "}
              · {timeOf(vote.registeredAt)}
            </span>
          </div>
        </>
      ) : (
        <div className="empty-agenda">
          <VoteIcon />
          <h2>Nenhum resultado nominal disponível</h2>
          <p>
            O painel mostrará a última votação do Plenário registrada na fonte
            oficial.
          </p>
        </div>
      )}
    </section>
  );
}

function PostCard({ post }: { post: SocialPost }) {
  const [failedImage, setFailedImage] = useState(false);
  const icon =
    post.type === "video" ? (
      <Play />
    ) : post.type === "carousel" ? (
      <Layers />
    ) : (
      <ImageIcon />
    );
  const content = (
    <>
      <div
        className={`post-art ${post.demoStyle ? `art-${post.demoStyle}` : ""}`}
      >
        {post.mediaUrl && !failedImage ? (
          <img
            src={post.mediaUrl}
            alt={post.caption.slice(0, 180) || "Publicação do Instagram"}
            referrerPolicy="no-referrer"
            onError={() => setFailedImage(true)}
          />
        ) : post.demoStyle ? (
          <>
            <span className="post-brand">REDE CÂMARA</span>
            <h3>{post.caption}</h3>
            <span className="post-geometry" />
          </>
        ) : (
          <div className="post-placeholder">
            <ImageIcon />
            <span>
              {failedImage ? "Imagem indisponível" : "Publicação do Instagram"}
            </span>
          </div>
        )}
        <span className="post-type">{icon}</span>
      </div>
      <div className="post-body">
        <span className="post-caption">
          {post.caption || "Publicação do Instagram"}
        </span>
        <div className="post-meta">
          <span>
            <Heart />
            {compactNumber(post.likes)}
          </span>
          <span>
            <MessageCircle />
            {compactNumber(post.comments)}
          </span>
          <time>{timeOf(post.publishedAt)}</time>
        </div>
      </div>
    </>
  );
  return post.permalink ? (
    <a
      className="post-card"
      href={post.permalink}
      target="_blank"
      rel="noreferrer"
    >
      {content}
    </a>
  ) : (
    <article className="post-card">{content}</article>
  );
}

function Feed({
  data,
  page,
  setPage,
}: {
  data: PanelData;
  page: number;
  setPage: (value: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(data.posts.length / 3));
  const selected = Math.min(page, pages - 1);
  const posts = data.posts.slice(selected * 3, selected * 3 + 3);
  return (
    <section className="feed-panel" aria-labelledby="feed-title">
      <div className="feed-info">
        <div className="feed-icon">
          <NetworkIcon id="instagram" />
        </div>
        <span className="eyebrow">ÚLTIMAS PUBLICAÇÕES</span>
        <h2 id="feed-title">
          NAS NOSSAS
          <br />
          REDES
        </h2>
        <p>
          {data.accounts.find((account) => account.id === "instagram")
            ?.handle || "Instagram da Câmara"}
        </p>
        <span className="feed-caption">
          {data.demo ? "Prévia visual do feed" : "Publicações do Instagram"}
        </span>
        <div className="feed-pager pager">
          <button
            type="button"
            aria-label="Publicações anteriores"
            disabled={selected === 0}
            onClick={() => setPage(selected - 1)}
          >
            <ChevronLeft />
          </button>
          <span>
            {selected + 1} / {pages}
          </span>
          <button
            type="button"
            aria-label="Próximas publicações"
            disabled={selected >= pages - 1}
            onClick={() => setPage(selected + 1)}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
      <div className="feed-posts">
        {posts.length ? (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        ) : (
          <div className="empty-feed">
            <ImageIcon />
            <div>
              <h3>
                {data.sources.social.state === "error"
                  ? "Feed temporariamente indisponível"
                  : data.sources.social.state === "ok"
                    ? "Nenhuma publicação recebida"
                    : "O Instagram aparece aqui"}
              </h3>
              <p>
                {data.sources.social.state === "pending"
                  ? "Aguardando a conexão da conta para mostrar as publicações."
                  : "O painel verifica novas publicações automaticamente."}
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="audience-summary">
        <Users />
        <span>
          AUDIÊNCIA
          <br />
          NAS REDES
        </span>
        <strong>
          {data.accounts.every((account) => account.followers !== null)
            ? compactNumber(
                data.accounts.reduce(
                  (sum, account) => sum + (account.followers ?? 0),
                  0,
                ),
              )
            : "—"}
        </strong>
        <p>
          Soma dos seguidores
          <br />
          das quatro redes
        </p>
      </div>
    </section>
  );
}

export default function Dashboard({ demo }: { demo: boolean }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [scale, setScale] = useState(1);
  const [mobile, setMobile] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<"agenda" | "vote">("agenda");
  const [autoRotate, setAutoRotate] = useState(true);
  const [refreshSeconds, setRefreshSeconds] = useState(60);
  const [agendaPage, setAgendaPage] = useState(0);
  const [feedPage, setFeedPage] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");
  const [displayButtons, setDisplayButtons] = useState(true);
  const dataRef = useRef<PanelData | null>(null);
  const requestRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hideButtonsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    async (initial = false) => {
      if (demo) {
        const next = demoPanel();
        setData(next);
        dataRef.current = next;
        setOffline(false);
        return;
      }
      if (requestRef.current) return;
      requestRef.current = true;
      setRefreshing(true);
      try {
        const response = await fetch("/api/painel", {
          cache: "no-store",
          signal: AbortSignal.timeout(55000),
        });
        if (!response.ok) throw new Error("Fonte indisponível");
        const json = (await response.json()) as PanelData;
        if (
          json.schemaVersion !== 1 ||
          json.demo ||
          !json.sources ||
          !Array.isArray(json.events)
        )
          throw new Error("Resposta inválida");
        const next = mergePanel(dataRef.current, json);
        dataRef.current = next;
        setData(next);
        setOffline(false);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(next));
        } catch {
          /* Browser storage may be unavailable. */
        }
        if (!initial) setNotice("Consulta concluída");
      } catch {
        setOffline(true);
        setNotice("Sem conexão. Últimos dados preservados.");
      } finally {
        requestRef.current = false;
        setRefreshing(false);
      }
    },
    [demo],
  );

  useEffect(() => {
    let cached: PanelData | null = null;
    if (!demo) {
      try {
        const parsed = JSON.parse(
          localStorage.getItem(CACHE_KEY) || "null",
        ) as PanelData | null;
        if (
          parsed?.schemaVersion === 1 &&
          parsed.demo === false &&
          Array.isArray(parsed.events) &&
          parsed.sources &&
          Array.isArray(parsed.accounts) &&
          Array.isArray(parsed.posts)
        )
          cached = parsed;
      } catch {
        /* Ignore unavailable or malformed local cache. */
      }
    }
    const initial = demo
      ? demoPanel()
      : cached
        ? { ...cached, date: brasiliaDate() }
        : emptyPanel();
    dataRef.current = initial;
    setData(initial);
    setNow(new Date());
    if (cached) setOffline(true);
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (saved.view === "agenda" || saved.view === "vote") setView(saved.view);
      if (typeof saved.autoRotate === "boolean")
        setAutoRotate(saved.autoRotate);
      if ([30, 60, 120, 300].includes(saved.refreshSeconds))
        setRefreshSeconds(saved.refreshSeconds);
    } catch {
      /* Defaults work without browser storage. */
    }
    void refresh(true);
    const resize = () => {
      setMobile(window.innerWidth < 800);
      setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    };
    resize();
    window.addEventListener("resize", resize);
    const tick = setInterval(() => setNow(new Date()), 1000);
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreen);
    const online = () => void refresh();
    window.addEventListener("online", online);
    return () => {
      clearInterval(tick);
      window.removeEventListener("resize", resize);
      window.removeEventListener("online", online);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [demo, refresh]);

  useEffect(() => {
    const timer = setInterval(() => void refresh(), refreshSeconds * 1000);
    return () => clearInterval(timer);
  }, [refresh, refreshSeconds]);

  useEffect(() => {
    if (!data || !autoRotate || settingsOpen) return;
    const timer = setInterval(() => {
      const count = data.events.filter(
        (event) => eventDate(event) === data.date,
      ).length;
      setAgendaPage((page) => (page + 1) % Math.max(1, Math.ceil(count / 3)));
      setFeedPage(
        (page) => (page + 1) % Math.max(1, Math.ceil(data.posts.length / 3)),
      );
    }, 20000);
    return () => clearInterval(timer);
  }, [data, autoRotate, settingsOpen]);

  useEffect(() => {
    if (!data) return;
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ view, autoRotate, refreshSeconds }),
      );
    } catch {
      /* Optional preferences. */
    }
  }, [view, autoRotate, refreshSeconds, data]);

  useEffect(() => {
    if (settingsOpen && !dialogRef.current?.open)
      dialogRef.current?.showModal();
    if (!settingsOpen && dialogRef.current?.open) dialogRef.current?.close();
  }, [settingsOpen]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        ["INPUT", "SELECT", "TEXTAREA"].includes(
          (event.target as HTMLElement).tagName,
        )
      )
        return;
      if (event.key.toLowerCase() === "s") setSettingsOpen((value) => !value);
      if (event.key.toLowerCase() === "v" && !dialogRef.current?.open)
        setView((value) => (value === "agenda" ? "vote" : "agenda"));
      if (event.key.toLowerCase() === "r" && !dialogRef.current?.open)
        void refresh();
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [refresh]);

  useEffect(() => {
    if (now && data && brasiliaDate(now) !== data.date) void refresh(true);
  }, [now, data, refresh]);

  useEffect(
    () => () => {
      if (hideButtonsTimer.current) clearTimeout(hideButtonsTimer.current);
    },
    [],
  );

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setNotice("Use F11 no navegador para abrir em tela cheia.");
    }
  }

  function showButtons() {
    setDisplayButtons(true);
    if (hideButtonsTimer.current) clearTimeout(hideButtonsTimer.current);
    if (fullscreen)
      hideButtonsTimer.current = setTimeout(
        () => setDisplayButtons(false),
        4000,
      );
  }

  if (!data || !now)
    return (
      <main className="loading-screen">
        <img src="/brand/camara-logo.png" alt="Câmara dos Deputados" />
        <span>Carregando o painel</span>
      </main>
    );
  const date = new Date(`${data.date}T12:00:00-03:00`);
  const oldSocial = data.accounts.some(
    (account) =>
      account.updatedAt &&
      Date.now() - Date.parse(account.updatedAt) > 30 * 60 * 1000,
  );
  const anyErrors =
    offline ||
    Object.values(data.sources).some((source) => source.state === "error") ||
    oldSocial;
  const checkedTimes = Object.values(data.sources)
    .map((source) => source.checkedAt)
    .filter((value): value is string => !!value);
  const checkedAt = checkedTimes.length ? checkedTimes.sort().at(-1) : null;
  const voteNotice = data.vote
    ? "Último resultado disponível no Plenário"
    : "Aguardando resultados do Plenário";
  const wrapperStyle: CSSProperties | undefined = mobile
    ? undefined
    : { width: 1920 * scale, height: 1080 * scale };
  const stageStyle: CSSProperties | undefined = mobile
    ? undefined
    : { transform: `scale(${scale})` };

  return (
    <main
      className={`screen ${fullscreen ? "is-fullscreen" : ""}`}
      onPointerMove={showButtons}
      onFocusCapture={showButtons}
    >
      <div className="stage-wrapper" style={wrapperStyle}>
        <div className="stage" style={stageStyle}>
          <header className="header">
            <div className="brand">
              <img src="/brand/camara-logo.png" alt="Câmara dos Deputados" />
              <span className="brand-divider" />
              <div>
                <strong>REDE CÂMARA</strong>
                <span>Painel de acompanhamento</span>
              </div>
            </div>
            <div className="header-right">
              <div className="header-date">
                <span>{dayFormat.format(date)}</span>
                <strong>
                  {dateFormat.format(date)} de {date.getFullYear()}
                </strong>
              </div>
              <div className="header-clock">
                <time>{timeOf(now.toISOString())}</time>
                <span>BRASÍLIA</span>
              </div>
              <div
                className={`display-controls ${displayButtons ? "" : "controls-hidden"}`}
              >
                <button
                  type="button"
                  title="Atualizar dados (R)"
                  aria-label="Atualizar dados"
                  disabled={refreshing}
                  onClick={() => void refresh()}
                >
                  <RefreshCw className={refreshing ? "spinning" : ""} />
                </button>
                <button
                  type="button"
                  title="Tela cheia"
                  aria-label={
                    fullscreen ? "Sair da tela cheia" : "Abrir em tela cheia"
                  }
                  onClick={() => void toggleFullscreen()}
                >
                  {fullscreen ? <Minimize2 /> : <Maximize2 />}
                </button>
                <button
                  type="button"
                  title="Configurações (S)"
                  aria-label="Abrir configurações"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings2 />
                </button>
              </div>
            </div>
          </header>
          <div className="panel-content">
            <div className="metrics-grid">
              {data.accounts.map((account) => (
                <MetricCard
                  key={account.id}
                  account={account}
                  stale={data.sources.social.state === "error" || offline}
                />
              ))}
            </div>
            <div className="main-grid">
              {view === "agenda" ? (
                <Agenda data={data} page={agendaPage} setPage={setAgendaPage} />
              ) : (
                <VotePanel vote={data.vote} demo={demo} />
              )}
              <Week data={data} offset={weekOffset} setOffset={setWeekOffset} />
            </div>
            <Feed data={data} page={feedPage} setPage={setFeedPage} />
          </div>
          <footer className="footer">
            <div className="footer-status">
              <span
                className={`status-dot ${anyErrors ? "status-stale" : data.demo ? "status-demo" : ""}`}
              />
              <span>
                {data.demo
                  ? "DEMONSTRAÇÃO · TODOS OS DADOS SÃO ILUSTRATIVOS"
                  : anyErrors
                    ? "Últimos dados disponíveis"
                    : "DADOS OFICIAIS DA CÂMARA"}
              </span>
            </div>
            <button
              type="button"
              className="footer-vote"
              onClick={() =>
                setView((value) => (value === "agenda" ? "vote" : "agenda"))
              }
            >
              <VoteIcon />
              {view === "agenda" ? voteNotice : "Voltar para Hoje na Câmara"}
              <ChevronRight />
            </button>
            <button
              type="button"
              className="footer-source"
              onClick={() => setSettingsOpen(true)}
            >
              <span>
                {refreshing
                  ? "Consultando fontes…"
                  : checkedAt
                    ? `Consulta ${timeOf(checkedAt)}`
                    : "Conectando fontes"}
              </span>
              <CircleHelp />
            </button>
          </footer>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        className="settings-dialog"
        onCancel={() => setSettingsOpen(false)}
        onClose={() => setSettingsOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false);
        }}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">REDE CÂMARA</span>
            <h2>Configurações do painel</h2>
          </div>
          <button
            type="button"
            aria-label="Fechar configurações"
            onClick={() => setSettingsOpen(false)}
          >
            <X />
          </button>
        </div>
        <div className="mode-notice">
          {demo
            ? "Você está na demonstração. Números, agenda, votação e posts são ilustrativos."
            : "Esta tela exibe os dados recebidos das fontes conectadas."}
          <a href={demo ? "/" : "/demo"}>
            {demo
              ? "Abrir painel com dados reais"
              : "Abrir demonstração visual"}
            <ExternalLink />
          </a>
        </div>
        <fieldset>
          <legend>Conteúdo principal</legend>
          <div className="view-options">
            <button
              type="button"
              className={view === "agenda" ? "selected" : ""}
              onClick={() => setView("agenda")}
            >
              <CalendarDays />
              Hoje na Câmara
            </button>
            <button
              type="button"
              className={view === "vote" ? "selected" : ""}
              onClick={() => setView("vote")}
            >
              <VoteIcon />
              Votação do Plenário
            </button>
          </div>
        </fieldset>
        <label className="settings-row">
          <span>
            <strong>Rotação de conteúdos</strong>
            <small>
              Alterna páginas da agenda e do feed a cada 20 segundos.
            </small>
          </span>
          <input
            type="checkbox"
            checked={autoRotate}
            onChange={(event) => setAutoRotate(event.target.checked)}
          />
        </label>
        <label className="settings-row">
          <span>
            <strong>Consultar novos dados</strong>
            <small>
              A agenda é coletada a cada 5 min; votações, a cada 1 min.
            </small>
          </span>
          <select
            value={refreshSeconds}
            onChange={(event) => setRefreshSeconds(Number(event.target.value))}
          >
            <option value={30}>A cada 30 segundos</option>
            <option value={60}>A cada minuto</option>
            <option value={120}>A cada 2 minutos</option>
            <option value={300}>A cada 5 minutos</option>
          </select>
        </label>
        <div className="source-list">
          <h3>Fontes e últimas consultas</h3>
          {Object.entries(data.sources).map(([key, source]) => (
            <div className="source-row" key={key}>
              <span className={`source-state state-${source.state}`} />
              <div>
                <strong>
                  {
                    {
                      agenda: "Agenda legislativa",
                      votes: "Votações do Plenário",
                      social: "Redes sociais",
                    }[key]
                  }
                </strong>
                <span>{source.message}</span>
              </div>
              <span>
                {source.checkedAt ? timeOf(source.checkedAt) : "Não conectado"}
              </span>
            </div>
          ))}
          {data.accounts.some((account) => account.updatedAt) && (
            <p className="snapshot-time">
              Coleta das redes:{" "}
              {data.accounts
                .filter((account) => account.updatedAt)
                .map(
                  (account) =>
                    `${account.name} ${new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(account.updatedAt!))}`,
                )
                .join(" · ")}
            </p>
          )}
        </div>
        <p className="vote-explanation">
          Votações mostram resultados já registrados na API oficial. O placar de
          uma votação ainda aberta exige uma fonte adicional.
        </p>
        <div className="dialog-actions">
          <a
            href="https://dadosabertos.camara.leg.br/swagger/api.html"
            target="_blank"
            rel="noreferrer"
          >
            Fonte oficial
            <ExternalLink />
          </a>
          <button
            type="button"
            className="primary-button"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw className={refreshing ? "spinning" : ""} />
            {refreshing ? "Consultando…" : "Consultar agora"}
          </button>
        </div>
        <p className="keyboard-hint">
          S · configurações &nbsp; V · alternar votação &nbsp; R · consultar
        </p>
      </dialog>
      {notice && (
        <div role="status" className="toast">
          {notice}
        </div>
      )}
    </main>
  );
}
