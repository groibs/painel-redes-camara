"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Landmark,
  Maximize2,
  Minimize2,
  RefreshCw,
  Vote as VoteIcon,
  X,
} from "lucide-react";
import {
  Committees,
  InstagramFeed,
  NowPanel,
  SocialMetrics,
  Ticker,
  TodaySchedule,
  TodaySummary,
  Week,
} from "@/components/overview";
import { demoPanel, emptyPanel } from "@/lib/data";
import {
  brasiliaDate,
  eventDate,
  fullNumber,
  mergePanel,
  timeOf,
  TIMEZONE,
} from "@/lib/format";
import type { PanelData, Vote } from "@/lib/types";

const CACHE_KEY = "rede-camara:snapshot:v1";
const SETTINGS_KEY = "rede-camara:display:v1";
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  timeZone: TIMEZONE,
});
const dayFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  timeZone: TIMEZONE,
});

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
  const dataRef = useRef<PanelData | null>(null);
  const requestRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

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

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setNotice("Use F11 no navegador para abrir em tela cheia.");
    }
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
    <main className={`screen ${fullscreen ? "is-fullscreen" : ""}`}>
      <div className="stage-wrapper" style={wrapperStyle}>
        <div className="stage" style={stageStyle}>
          <header className="header">
            <div className="brand">
              <div className="brand-mark" aria-label="Rede Câmara">
                <strong>Rede Câmara</strong>
              </div>
            </div>
            <div className="header-right">
              <div className="header-time">
                <div className="header-date">
                  <span>
                    {dayFormat.format(date).replace(".", "")}{" "}
                    {dateFormat.format(date)}
                  </span>
                </div>
                <time className="header-clock">
                  {timeOf(now.toISOString())}
                </time>
              </div>
              <div className="header-location">
                <span>BRASÍLIA · DF</span>
                <div>
                  <img src="/brand/camara-idv.svg" alt="Câmara dos Deputados" />
                </div>
              </div>
            </div>
          </header>
          <div className="panel-content">
            <div className="left-column">
              <SocialMetrics data={data} offline={offline} />
              <InstagramFeed
                data={data}
                page={feedPage}
                setPage={setFeedPage}
              />
            </div>
            <div className="center-column">
              {view === "agenda" ? (
                <NowPanel
                  data={data}
                  page={agendaPage}
                  setPage={setAgendaPage}
                />
              ) : (
                <VotePanel vote={data.vote} demo={demo} />
              )}
              <TodaySummary data={data} />
              <Committees data={data} />
            </div>
            <div className="right-column">
              <TodaySchedule data={data} />
              <Week data={data} offset={weekOffset} setOffset={setWeekOffset} />
            </div>
          </div>
          <Ticker data={data} />
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
              {view === "agenda" ? voteNotice : "Voltar para Agora na Câmara"}
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
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
            {fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          </button>
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
