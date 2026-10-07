import { emptyPanel } from "./data";
import { shiftDate, zonedTimestamp } from "./format";
import { parseSnapshot, safeHttpsUrl } from "./snapshot";
import type { AgendaEvent, PanelData, Source, Vote } from "./types";

const API = "https://dadosabertos.camara.leg.br/api/v2";
export type PanelEnvironment = {
  PANEL_VOTE_ID?: string;
  PANEL_SOCIAL_SOURCE_URL?: string;
  PANEL_SOCIAL_SOURCE_TOKEN?: string;
};
type ApiObject = Record<string, unknown>;
function object(value: unknown): ApiObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as ApiObject)
    : {};
}
function label(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim()
    : "";
}
function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
function validDate(value: unknown): string | null {
  return typeof value === "string" &&
    Number.isFinite(Date.parse(zonedTimestamp(value)))
    ? zonedTimestamp(value)
    : null;
}

async function apiJson(
  path: string,
  signal: AbortSignal,
  revalidate = 60,
): Promise<ApiObject> {
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate },
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
  });
  if (!response.ok) throw new Error(`Câmara HTTP ${response.status}`);
  const json = object(await response.json());
  if (!("dados" in json)) throw new Error("Resposta da Câmara inválida");
  return json;
}

async function agenda(
  panel: PanelData,
  signal: AbortSignal,
): Promise<AgendaEvent[]> {
  const all: AgendaEvent[] = [];
  const ids = new Set<number>();
  for (let page = 1; page <= 12; page++) {
    const query = new URLSearchParams({
      dataInicio: panel.weekStart,
      dataFim: panel.weekEnd,
      itens: "100",
      pagina: String(page),
      ordem: "ASC",
      ordenarPor: "dataHoraInicio",
    });
    const result = await apiJson(`/eventos?${query}`, signal, 300);
    if (!Array.isArray(result.dados)) throw new Error("Agenda inválida");
    for (const raw of result.dados) {
      const item = object(raw);
      const id = integer(item.id);
      const startsAt = validDate(item.dataHoraInicio);
      if (id === null || !startsAt || ids.has(id)) continue;
      ids.add(id);
      const organs = Array.isArray(item.orgaos) ? item.orgaos.map(object) : [];
      const local = object(item.localCamara);
      all.push({
        id,
        startsAt,
        endsAt: validDate(item.dataHoraFim),
        title:
          label(item.descricao) ||
          label(item.titulo) ||
          label(item.descricaoTipo) ||
          "Evento da Câmara",
        type: label(item.descricaoTipo),
        status: label(item.descricaoSituacao),
        organ:
          organs
            .map((organ) => label(organ.sigla) || label(organ.nome))
            .filter(Boolean)
            .join(" · ") || "Câmara dos Deputados",
        location:
          [label(local.predio), label(local.sala)]
            .filter(Boolean)
            .join(" · ") ||
          label(item.localExterno) ||
          "Local a confirmar",
        url: `https://www.camara.leg.br/evento-legislativo/${id}`,
      });
    }
    const next =
      Array.isArray(result.links) &&
      result.links.some((link) => object(link).rel === "next");
    if (!next) return all;
  }
  throw new Error("Agenda excede o limite de paginação");
}

async function latestVote(
  panel: PanelData,
  signal: AbortSignal,
  environment: PanelEnvironment,
): Promise<Vote | null> {
  // The public API exposes registered results. Never call these counts an open live vote.
  const yearStart = `${panel.date.slice(0, 4)}-01-01`;
  const selected = environment.PANEL_VOTE_ID;
  let candidates: ApiObject[];
  if (selected) candidates = [{ id: selected }];
  else {
    const query = new URLSearchParams({
      dataInicio: [yearStart, shiftDate(panel.date, -30)].sort().at(-1)!,
      dataFim: panel.date,
      idOrgao: "180",
      itens: "10",
      ordem: "DESC",
      ordenarPor: "dataHoraRegistro",
    });
    const list = await apiJson(`/votacoes?${query}`, signal);
    if (!Array.isArray(list.dados)) throw new Error("Lista de votações inválida");
    candidates = list.dados.map(object);
  }
  for (const raw of candidates.slice(0, 10)) {
    const id = label(object(raw).id);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) continue;
    const response = await apiJson(
      `/votacoes/${encodeURIComponent(id)}`,
      signal,
    );
    const item = object(response.dados);
    const yes = integer(item.votosSim);
    const no = integer(item.votosNao);
    const other = integer(item.votosOutros);
    // Avoid displaying a symbolic vote or unreported counts as a zero-vote nominal result.
    if (yes === null && no === null && other === null) continue;
    if (!selected && (yes ?? 0) + (no ?? 0) + (other ?? 0) === 0) continue;
    const registeredAt =
      validDate(item.dataHoraRegistro) ||
      validDate(`${label(item.data)}T00:00:00`);
    if (!registeredAt) continue;
    const related = Array.isArray(item.proposicoesAfetadas)
      ? item.proposicoesAfetadas.map(object)
      : [];
    const proposition = related.find((p) => p.siglaTipo && p.numero && p.ano);
    return {
      id,
      title: proposition
        ? `${label(proposition.siglaTipo)} ${proposition.numero}/${proposition.ano}`
        : "Votação do Plenário",
      description:
        label(item.descricao) ||
        "Resultado nominal registrado pela Câmara dos Deputados.",
      registeredAt,
      approved:
        item.aprovacao === 1 || item.aprovacao === true
          ? true
          : item.aprovacao === 0 || item.aprovacao === false
            ? false
            : null,
      yes,
      no,
      other,
      url: `${API}/votacoes/${encodeURIComponent(id)}`,
    };
  }
  return null;
}

async function social(
  panel: PanelData,
  signal: AbortSignal,
  environment: PanelEnvironment,
): Promise<void> {
  const source = environment.PANEL_SOCIAL_SOURCE_URL;
  if (!source) return;
  const url = safeHttpsUrl(source);
  if (!url) throw new Error("Fonte social precisa usar HTTPS");
  const response = await fetch(url, {
    headers: environment.PANEL_SOCIAL_SOURCE_TOKEN
      ? { Authorization: `Bearer ${environment.PANEL_SOCIAL_SOURCE_TOKEN}` }
      : {},
    redirect: "error",
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Fonte social HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 1000000) throw new Error("Snapshot social excede o limite");
  const body = await response.text();
  if (body.length > 1000000) throw new Error("Snapshot social excede o limite");
  const snapshot = parseSnapshot(JSON.parse(body));
  panel.accounts = panel.accounts.map(
    (account) =>
      snapshot.accounts.find((item) => item.id === account.id) || account,
  );
  panel.posts = snapshot.posts;
  panel.sources.social = {
    state: "ok",
    checkedAt: snapshot.collectedAt,
    message: "Coleta das redes sociais",
  };
}

export async function getPanel(
  environment: PanelEnvironment = {
    PANEL_VOTE_ID: process.env.PANEL_VOTE_ID,
    PANEL_SOCIAL_SOURCE_URL: process.env.PANEL_SOCIAL_SOURCE_URL,
    PANEL_SOCIAL_SOURCE_TOKEN: process.env.PANEL_SOCIAL_SOURCE_TOKEN,
  },
): Promise<PanelData> {
  const panel = emptyPanel();
  const signal = AbortSignal.timeout(40000);
  const results = await Promise.allSettled([
    agenda(panel, signal),
    latestVote(panel, signal, environment),
    social(panel, signal, environment),
  ]);
  const ok = (message: string): Source => ({
    state: "ok",
    checkedAt: new Date().toISOString(),
    message,
  });
  const error = (message: string): Source => ({
    state: "error",
    checkedAt: null,
    message,
  });
  if (results[0].status === "fulfilled") {
    panel.events = results[0].value;
    panel.sources.agenda = ok("Dados Abertos da Câmara");
  } else {
    panel.sources.agenda = error(
      "Agenda indisponível; mantendo o último dado recebido",
    );
    console.error("[painel] agenda indisponível");
  }
  if (results[1].status === "fulfilled") {
    panel.vote = results[1].value;
    panel.sources.votes = ok("Resultados registrados · Dados Abertos");
  } else {
    panel.sources.votes = error(
      "Resultados indisponíveis; mantendo o último dado recebido",
    );
    console.error("[painel] votações indisponíveis");
  }
  if (results[2].status === "rejected") {
    panel.sources.social = error(
      "Coleta das redes indisponível; mantendo o último dado recebido",
    );
    console.error("[painel] redes indisponíveis");
  }
  panel.generatedAt = new Date().toISOString();
  return panel;
}
