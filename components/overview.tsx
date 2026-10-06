"use client";

import { useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  Heart,
  Image as ImageIcon,
  Landmark,
  Layers,
  Megaphone,
  MessageCircle,
  Music2,
  Play,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  compactNumber,
  eventDate,
  fullNumber,
  isCancelled,
  isOngoing,
  shiftDate,
  timeOf,
  TIMEZONE,
} from "@/lib/format";
import type {
  AgendaEvent,
  NetworkId,
  PanelData,
  SocialPost,
} from "@/lib/types";

const weekday = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  timeZone: TIMEZONE,
});
const month = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  timeZone: TIMEZONE,
});

function todayEvents(data: PanelData) {
  return data.events
    .filter((event) => eventDate(event) === data.date && !isCancelled(event))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
function isPlenary(event: AgendaEvent) {
  return /plen[aá]rio|^plen$/i.test(event.organ);
}
function shortOrgan(event: AgendaEvent) {
  if (isPlenary(event)) return "Plenário";
  if (/constitui|justi/i.test(event.organ)) return "CCJ";
  return event.organ;
}
function noAgenda(data: PanelData) {
  return data.sources.agenda.state === "pending"
    ? "Consultando a agenda"
    : data.sources.agenda.state === "error"
      ? "Agenda temporariamente indisponível"
      : "Nenhuma atividade publicada";
}

export function NetworkIcon({ id }: { id: NetworkId }) {
  if (id === "tiktok") return <Music2 aria-hidden="true" />;
  if (id === "youtube")
    return <Play aria-hidden="true" className="youtube-mark" />;
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

export function SocialMetrics({
  data,
  offline,
}: {
  data: PanelData;
  offline: boolean;
}) {
  return (
    <section className="social-panel dark-panel" aria-labelledby="social-title">
      <div className="social-heading">
        <h2 id="social-title">NOSSAS REDES</h2>
        <span>Seguidores</span>
      </div>
      <div className="metrics-list">
        {data.accounts.map((account) => {
          const delta = account.change24h;
          const stale =
            offline ||
            data.sources.social.state === "error" ||
            (!!account.updatedAt &&
              Date.now() - Date.parse(account.updatedAt) > 30 * 60 * 1000);
          return (
            <article
              className={`metric-row metric-${account.id}`}
              key={account.id}
            >
              <span
                className={`network-icon network-${account.id}`}
                title={account.name}
              >
                <NetworkIcon id={account.id} />
              </span>
              <div className="metric-number">
                <h3 className="sr-only">{account.name}</h3>
                <strong
                  title={`${account.name}: ${fullNumber(account.followers)}`}
                >
                  {compactNumber(account.followers)}
                </strong>
                <span>
                  {account.id === "youtube" ? "inscritos" : "seguidores"}
                </span>
              </div>
              <div className="metric-change">
                {delta !== null ? (
                  <>
                    <span className={delta < 0 ? "negative" : ""}>
                      {delta < 0 ? <TrendingDown /> : <TrendingUp />}
                      {delta > 0 ? "+" : ""}
                      {fullNumber(delta)}
                    </span>
                    <small>em 24 horas</small>
                  </>
                ) : (
                  <small>
                    {account.followers === null
                      ? "Aguardando conexão"
                      : "Coleta recebida"}
                  </small>
                )}
                {stale && account.followers !== null ? (
                  <small className="metric-old">Última coleta</small>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      <div className="social-bottom">
        <span>@camaradosdeputados</span>
        <span>REDE CÂMARA</span>
      </div>
    </section>
  );
}

export function NowPanel({
  data,
  page,
  setPage,
}: {
  data: PanelData;
  page: number;
  setPage: (page: number) => void;
}) {
  const all = todayEvents(data).sort(
    (a, b) =>
      Number(isPlenary(b)) - Number(isPlenary(a)) ||
      Number(isOngoing(b)) - Number(isOngoing(a)) ||
      a.startsAt.localeCompare(b.startsAt),
  );
  const pages = Math.max(1, Math.ceil(all.length / 3));
  const selected = Math.min(page, pages - 1);
  const events = all.slice(selected * 3, selected * 3 + 3);
  return (
    <section className="now-panel dark-panel" aria-labelledby="now-title">
      <img className="plenary-image" src="/brand/plenario.jpg" alt="" />
      <div className="now-shade" />
      <div className="now-top">
        <h1 id="now-title">AGORA NA CÂMARA</h1>
        <span>Agenda do dia</span>
      </div>
      {events.length ? (
        <div className="now-list">
          {events.map((event) => {
            const Icon = isPlenary(event)
              ? Landmark
              : /educa/i.test(event.organ)
                ? BookOpen
                : Users;
            return (
              <article className="now-row" key={event.id}>
                <span className="event-icon">
                  <Icon aria-hidden="true" />
                </span>
                <div className="now-event">
                  <div className="now-event-heading">
                    <h2>{shortOrgan(event)}</h2>
                    {isOngoing(event) ? (
                      <span className="live-badge">
                        <i />
                        EM ANDAMENTO
                      </span>
                    ) : null}
                  </div>
                  <strong>
                    {isOngoing(event)
                      ? "Acontecendo agora"
                      : `${/sess[aã]o/i.test(event.type) ? "Sessão às" : "Previsto para"} ${timeOf(event.startsAt)}`}
                  </strong>
                  <p>
                    {event.url ? (
                      <a href={event.url} target="_blank" rel="noreferrer">
                        {event.title}
                      </a>
                    ) : (
                      event.title
                    )}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="now-empty">
          <Landmark />
          <h2>{noAgenda(data)}</h2>
          <p>
            Plenário e comissões: acompanhe aqui as atividades publicadas pela
            Câmara.
          </p>
        </div>
      )}
      <div className="now-bottom">
        <span>Foto de arquivo · Saulo Cruz / Câmara dos Deputados</span>
        <div className="pager dark-pager">
          <button
            type="button"
            aria-label="Eventos anteriores"
            disabled={selected === 0}
            onClick={() => setPage(selected - 1)}
          >
            <ChevronLeft />
          </button>
          <span>
            {String(selected + 1).padStart(2, "0")} /{" "}
            {String(pages).padStart(2, "0")}
          </span>
          <button
            type="button"
            aria-label="Próximos eventos"
            disabled={selected === pages - 1}
            onClick={() => setPage(selected + 1)}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
    </section>
  );
}

export function TodaySummary({ data }: { data: PanelData }) {
  const events = todayEvents(data);
  const available = data.sources.agenda.state === "ok" || events.length > 0;
  const counts = [
    {
      label: (
        <>
          EVENTOS
          <br />
          NO TOTAL
        </>
      ),
      value: events.length,
    },
    {
      label: <>COMISSÕES</>,
      value: new Set(
        events
          .filter(
            (event) =>
              !isPlenary(event) && event.organ !== "Câmara dos Deputados",
          )
          .map((event) => event.organ),
      ).size,
    },
    {
      label: (
        <>
          EM
          <br />
          ANDAMENTO
        </>
      ),
      value: events.filter(isOngoing).length,
    },
    {
      label: (
        <>
          AUDIÊNCIAS
          <br />
          PÚBLICAS
        </>
      ),
      value: events.filter((event) => /audi[eê]ncia/i.test(event.type)).length,
    },
    {
      label: <>SESSÕES</>,
      value: events.filter((event) => /sess[aã]o/i.test(event.type)).length,
    },
  ];
  return (
    <section
      className="summary-panel light-panel"
      aria-labelledby="summary-title"
    >
      <div className="panel-heading">
        <h2 id="summary-title">
          <CalendarDays />
          HOJE NA CÂMARA
        </h2>
        <a
          className="panel-link"
          href="https://www.camara.leg.br/agenda"
          target="_blank"
          rel="noreferrer"
        >
          Ver agenda completa
          <ChevronRight />
        </a>
      </div>
      <div className="summary-counts">
        {counts.map((count, index) => (
          <div key={index}>
            <strong>{available ? count.value : "—"}</strong>
            <span>{count.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TodaySchedule({
  data,
  page,
}: {
  data: PanelData;
  page: number;
}) {
  const events = todayEvents(data);
  const selected = Math.min(
    page,
    Math.max(0, Math.ceil(events.length / 4) - 1),
  );
  const visible = events.slice(selected * 4, selected * 4 + 4);
  return (
    <section
      className="schedule-panel light-panel"
      aria-labelledby="schedule-title"
    >
      <div className="panel-heading">
        <h2 id="schedule-title">
          <FileText />
          PAUTAS DE HOJE
        </h2>
      </div>
      <div className="schedule-list">
        {visible.length ? (
          visible.map((event, index) => (
            <article className="schedule-row" key={event.id}>
              <span className="schedule-index">{selected * 4 + index + 1}</span>
              <div>
                <h3>
                  {event.url ? (
                    <a href={event.url} target="_blank" rel="noreferrer">
                      {event.title}
                    </a>
                  ) : (
                    event.title
                  )}
                </h3>
                <p>
                  {isOngoing(event)
                    ? "Em andamento"
                    : `Previsto para ${timeOf(event.startsAt)}`}
                </p>
              </div>
              <ChevronRight aria-hidden="true" />
            </article>
          ))
        ) : (
          <div className="empty-light">
            <FileText />
            <h3>{noAgenda(data)}</h3>
            <p>As pautas aparecem conforme a publicação da agenda oficial.</p>
          </div>
        )}
      </div>
      <div className="panel-foot">
        <span>{events.length} atividades na agenda de hoje</span>
        <span>Horário de Brasília</span>
      </div>
    </section>
  );
}

export function Committees({ data, page }: { data: PanelData; page: number }) {
  const all = todayEvents(data)
    .filter(
      (event) => !isPlenary(event) && event.organ !== "Câmara dos Deputados",
    )
    .sort(
      (a, b) =>
        Number(isOngoing(b)) - Number(isOngoing(a)) ||
        a.startsAt.localeCompare(b.startsAt),
    );
  const selected = Math.min(page, Math.max(0, Math.ceil(all.length / 3) - 1));
  const events = all.slice(selected * 3, selected * 3 + 3);
  return (
    <section
      className="committee-panel light-panel"
      aria-labelledby="committee-title"
    >
      <div className="panel-heading">
        <h2 id="committee-title">
          <Users />
          COMISSÕES HOJE
        </h2>
        <a
          className="panel-link"
          href="https://www.camara.leg.br/agenda"
          target="_blank"
          rel="noreferrer"
        >
          Ver todas
          <ChevronRight />
        </a>
      </div>
      <div className="committee-list">
        {events.length ? (
          events.map((event) => (
            <article className="committee-row" key={event.id}>
              <div className="committee-time">
                <strong>{timeOf(event.startsAt)}</strong>
                {isOngoing(event) ? <span>AGORA</span> : null}
              </div>
              <span
                className={`activity-dot ${isOngoing(event) ? "active" : ""}`}
              />
              <div className="committee-organ">
                <h3>{event.organ}</h3>
                <p>{event.type}</p>
              </div>
              <p className="committee-topic">{event.title}</p>
              {event.url ? (
                <a
                  className="committee-open"
                  href={event.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Abrir ${event.title}`}
                >
                  <ChevronRight />
                </a>
              ) : (
                <ChevronRight className="committee-open" aria-hidden="true" />
              )}
            </article>
          ))
        ) : (
          <div className="empty-light">
            <Users />
            <h3>{noAgenda(data)}</h3>
            <p>Reuniões e audiências das comissões aparecem aqui.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function Week({
  data,
  offset,
  setOffset,
}: {
  data: PanelData;
  offset: number;
  setOffset: (offset: number) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) =>
    shiftDate(data.weekStart, index),
  );
  const dates = days.slice(offset, offset + 5);
  const range = `${data.weekStart.slice(-2)}–${data.weekEnd.slice(-2)} ${month.format(new Date(`${data.weekEnd}T12:00:00-03:00`)).replace(".", "")}`;
  return (
    <section className="week-panel light-panel" aria-labelledby="week-title">
      <div className="panel-heading">
        <h2 id="week-title">
          <CalendarDays />
          CÂMARA NA SEMANA
        </h2>
        <span className="week-range">{range}</span>
      </div>
      <div className="week-list">
        {dates.map((date) => {
          const events = data.events
            .filter((event) => eventDate(event) === date && !isCancelled(event))
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
          const event = events[0];
          const dayDate = new Date(`${date}T12:00:00-03:00`);
          return (
            <article
              className={`week-row ${date === data.date ? "week-today" : ""}`}
              key={date}
            >
              <div className="week-date">
                <strong>{weekday.format(dayDate).replace(".", "")}</strong>
                <span>
                  {Number(date.slice(-2))}/{Number(date.slice(5, 7))}
                </span>
              </div>
              <span
                className={`activity-dot ${event && isOngoing(event) ? "active" : ""} ${!event ? "empty" : ""}`}
              />
              <div className="week-content">
                <h3>
                  {event?.title ||
                    (data.sources.agenda.state === "ok"
                      ? "Sem atividade publicada"
                      : noAgenda(data))}
                </h3>
                <p>
                  {event
                    ? `${timeOf(event.startsAt)} · ${event.organ}`
                    : "Agenda da Câmara"}
                </p>
              </div>
            </article>
          );
        })}
      </div>
      <div className="panel-foot">
        <a
          className="panel-link"
          href="https://www.camara.leg.br/agenda"
          target="_blank"
          rel="noreferrer"
        >
          Ver semana completa
          <ChevronRight />
        </a>
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
            disabled={offset === 2}
            onClick={() => setOffset(2)}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
    </section>
  );
}

function PostCard({ post }: { post: SocialPost }) {
  const [failedImage, setFailedImage] = useState(false);
  const content = (
    <>
      <div
        className={`post-art ${post.demoStyle ? `art-${post.demoStyle}` : ""}`}
      >
        {post.mediaUrl && !failedImage ? (
          <img
            src={post.mediaUrl}
            alt={post.demoStyle ? "" : post.caption.slice(0, 180)}
            referrerPolicy="no-referrer"
            onError={() => setFailedImage(true)}
          />
        ) : null}
        {post.demoStyle ? (
          <>
            <span className="post-brand">REDE CÂMARA</span>
            <h3>{post.caption}</h3>
            <span className="post-geometry" />
          </>
        ) : !post.mediaUrl || failedImage ? (
          <div className="post-placeholder">
            <ImageIcon />
            <span>Imagem indisponível</span>
          </div>
        ) : null}
        <span className="post-type">
          {post.type === "video" ? (
            <Play />
          ) : post.type === "carousel" ? (
            <Layers />
          ) : (
            <ImageIcon />
          )}
        </span>
      </div>
      <div className="post-meta">
        <span>
          <Heart />
          {compactNumber(post.likes)}
        </span>
        <span>
          <MessageCircle />
          {compactNumber(post.comments)}
        </span>
      </div>
    </>
  );
  return post.permalink ? (
    <a
      className="post-card"
      href={post.permalink}
      target="_blank"
      rel="noreferrer"
      aria-label={post.caption || "Publicação do Instagram"}
    >
      {content}
    </a>
  ) : (
    <article className="post-card" aria-label={post.caption}>
      {content}
    </article>
  );
}

export function InstagramFeed({
  data,
  page,
  setPage,
}: {
  data: PanelData;
  page: number;
  setPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(data.posts.length / 3));
  const selected = Math.min(page, pages - 1);
  const posts = data.posts.slice(selected * 3, selected * 3 + 3);
  return (
    <section className="feed-panel dark-panel" aria-labelledby="feed-title">
      <div className="feed-heading">
        <h2 id="feed-title">
          <CalendarDays />
          ÚLTIMOS POSTS NO INSTAGRAM
        </h2>
        <div className="pager dark-pager">
          <button
            type="button"
            aria-label="Publicações anteriores"
            disabled={selected === 0}
            onClick={() => setPage(selected - 1)}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            aria-label="Próximas publicações"
            disabled={selected === pages - 1}
            onClick={() => setPage(selected + 1)}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
      <div className="feed-posts">
        {posts.length ? (
          posts.map((post) => (
            <PostCard key={`${post.id}:${post.mediaUrl}`} post={post} />
          ))
        ) : (
          <div className="empty-feed">
            <ImageIcon />
            <h3>
              {data.sources.social.state === "error"
                ? "Feed indisponível"
                : "Aguardando conexão do Instagram"}
            </h3>
            <p>As publicações da conta aparecerão aqui.</p>
          </div>
        )}
      </div>
      <div
        className="feed-dots"
        aria-label={`Página ${selected + 1} de ${pages}`}
      >
        {Array.from({ length: Math.min(5, pages) }, (_, index) => (
          <span
            className={index === selected % 5 ? "selected" : ""}
            key={index}
          />
        ))}
      </div>
    </section>
  );
}

export function Ticker({ data }: { data: PanelData }) {
  const events = todayEvents(data);
  const messages = events.length
    ? events.map((event) => `${event.organ}: ${event.title}`)
    : [
        data.sources.agenda.state === "ok"
          ? "Acompanhe a agenda legislativa e as atividades da Câmara dos Deputados"
          : "Consultando as fontes da Câmara dos Deputados",
      ];
  return (
    <div className="ticker" aria-label="Destaques da agenda">
      <div className="ticker-label">
        <Megaphone />
        NA PAUTA
      </div>
      <div
        className={`ticker-viewport ${messages.length > 1 ? "ticker-running" : ""}`}
      >
        <div className="ticker-track">
          <div className="ticker-copy">
            {messages.map((message, index) => (
              <span key={index}>
                <i />
                {message}
              </span>
            ))}
          </div>
          {messages.length > 1 ? (
            <div className="ticker-copy" aria-hidden="true">
              {messages.map((message, index) => (
                <span key={index}>
                  <i />
                  {message}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
