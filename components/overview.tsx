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

const networkPaths: Partial<Record<NetworkId, string>> = {
  instagram:
    "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
  tiktok:
    "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  x: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
  facebook:
    "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
};

export function NetworkIcon({ id }: { id: NetworkId }) {
  if (id === "youtube")
    return (
      <svg className="network-logo" viewBox="0 0 28 20" aria-hidden="true">
        <path
          fill="#ff0033"
          d="M27.4 3.1a3.5 3.5 0 0 0-2.5-2.5C22.7 0 14 0 14 0S5.3 0 3.1.6A3.5 3.5 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9a3.5 3.5 0 0 0 2.5 2.5C5.3 20 14 20 14 20s8.7 0 10.9-.6a3.5 3.5 0 0 0 2.5-2.5C28 14.7 28 10 28 10s0-4.7-.6-6.9Z"
        />
        <path fill="#fff" d="m11.2 14.3 7.3-4.3-7.3-4.3z" />
      </svg>
    );
  return (
    <svg className="network-logo" viewBox="0 0 24 24" aria-hidden="true">
      {id === "tiktok" && (
        <>
          <path
            d={networkPaths[id]}
            fill="#25f4ee"
            transform="translate(-.7 -.5)"
          />
          <path
            d={networkPaths[id]}
            fill="#fe2c55"
            transform="translate(.7 .5)"
          />
        </>
      )}
      <path d={networkPaths[id]} />
    </svg>
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
          const freshnessWindow =
            account.id === "instagram"
              ? 30 * 60 * 1000
              : 26 * 60 * 60 * 1000;
          const stale =
            offline ||
            data.sources.social.state === "error" ||
            (!!account.updatedAt &&
              Date.now() - Date.parse(account.updatedAt) > freshnessWindow);
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
                ) : account.followers === null ? (
                  <small>Aguardando conexão</small>
                ) : null}
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

export function TodaySchedule({ data }: { data: PanelData }) {
  const events = todayEvents(data);
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
        {events.length ? (
          events.map((event, index) => (
            <article className="schedule-row" key={event.id}>
              <span className="schedule-index">{index + 1}</span>
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
        <span>Role para ver todas · Horário de Brasília</span>
      </div>
    </section>
  );
}

export function Committees({ data }: { data: PanelData }) {
  const events = todayEvents(data)
    .filter(
      (event) => !isPlenary(event) && event.organ !== "Câmara dos Deputados",
    )
    .sort(
      (a, b) =>
        Number(isOngoing(b)) - Number(isOngoing(a)) ||
        a.startsAt.localeCompare(b.startsAt),
    );
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
