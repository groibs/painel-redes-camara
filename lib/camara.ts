import { emptyPanel } from "./data";
import { shiftDate, zonedTimestamp } from "./format";
import { parseSnapshot, safeHttpsUrl } from "./snapshot";
import type { AgendaEvent, PanelData, Source, Vote } from "./types";

const API = "https://dadosabertos.camara.leg.br/api/v2";
const INSTAGRAM_MEDIA_PROXY =
  "https://painel-redes-scraper-camara.vercel.app/media";
export type PanelEnvironment = {
  PANEL_VOTE_ID?: string;
  PANEL_SOCIAL_SOURCE_URL?: string;
  PANEL_SOCIAL_SOURCE_TOKEN?: string;
  PANEL_SOCIAL_FALLBACK_PANEL_URL?: string;
  PANEL_PUBLIC_SOCIAL_URL?: string;
  PANEL_SUPABASE_URL?: string;
  PANEL_SUPABASE_ANON_KEY?: string;
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
        organName:
          organs
            .map((organ) => label(organ.nome) || label(organ.sigla))
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

async function socialFromLegacyPanel(
  panel: PanelData,
  signal: AbortSignal,
  source: string,
): Promise<void> {
  // Temporary migration bridge while the legacy Vercel account is unavailable.
  // This reads only the public API of the old panel, never a collector credential.
  const url = safeHttpsUrl(source);
  if (!url || new URL(url).hostname !== "painel-redes-camara-rebellum.vercel.app"
      || new URL(url).pathname !== "/api/painel") {
    throw new Error("Fonte legada não autorizada");
  }
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Painel legado HTTP ${response.status}`);
  if (Number(response.headers.get("content-length") || 0) > 1_000_000)
    throw new Error("Painel legado excede limite");
  const body = await response.text();
  if (body.length > 1_000_000) throw new Error("Painel legado excede limite");
  const legacy = JSON.parse(body) as Partial<PanelData>;
  if (
    legacy.schemaVersion !== 1 ||
    legacy.demo !== false ||
    !Array.isArray(legacy.accounts) ||
    !Array.isArray(legacy.posts) ||
    legacy.sources?.social?.state !== "ok"
  ) {
    throw new Error("Painel legado sem coleta social válida");
  }
  const checkedAt = legacy.sources.social.checkedAt;
  if (!checkedAt || !Number.isFinite(Date.parse(checkedAt)))
    throw new Error("Painel legado sem data de coleta");
  panel.accounts = panel.accounts.map((account) => {
    const previous = legacy.accounts!.find((item) => item?.id === account.id);
    if (!previous || previous.followers === null ||
        !Number.isSafeInteger(previous.followers) || previous.followers < 0)
      return account;
    return {
      ...account,
      followers: previous.followers,
      change24h: typeof previous.change24h === "number" &&
        Number.isSafeInteger(previous.change24h) ? previous.change24h : null,
      updatedAt: typeof previous.updatedAt === "string" &&
        Number.isFinite(Date.parse(previous.updatedAt))
        ? previous.updatedAt : checkedAt,
    };
  });
  panel.posts = legacy.posts.filter((post) =>
    post && typeof post.id === "string" &&
    typeof post.caption === "string" &&
    typeof post.publishedAt === "string" &&
    ["video", "image", "carousel"].includes(post.type)
  ).slice(0, 20);
  panel.sources.social = {
    state: "ok",
    checkedAt,
    message: "Dados públicos do painel anterior (migração temporária)",
  };
}

/** Public snapshots are written by GitHub Actions to a separate data branch.
 * Supabase (once provisioned) is the preferred persistent store; neither
 * requires a VPS. Values preserve the timestamp of their own last successful
 * observation, so an old metric is never represented as a fresh reading.
 */
const GITHUB_SOCIAL_DATA =
  "https://raw.githubusercontent.com/groibs/painel-redes-camara/social-data/social/snapshot.json";
const COLLECTOR_MAX_AGE = 6 * 60 * 60 * 1000;

function applyPublicCollection(panel: PanelData, value: unknown): void {
  const raw = object(value);
  const collectedAt = validDate(raw.collectedAt);
  if (!collectedAt || Date.parse(collectedAt) > Date.now() + 300000)
    throw new Error("Snapshot social sem data válida");
  const ig = object(raw.instagram);
  const x = object(raw.x);
  const telegram = object(raw.telegram);
  const instagramFollowers = integer(ig.followers) ??
    (ig.source === "embed" ? integer(ig.publicFollowers) : null);
  const xFollowers = integer(x.followers);
  const igObserved = validDate(ig.followersObservedAt) ||
    validDate(ig.observedAt) || collectedAt;
  const xObserved = validDate(x.observedAt) || collectedAt;
  const instagramPosts = Array.isArray(ig.posts) ? ig.posts.slice(0, 6) : [];
  const telegramPosts = Array.isArray(telegram.posts) ? telegram.posts.slice(0, 6) : [];
  // Instagram embeds expose original posts without a trustworthy live follower
  // count. Prefer real Instagram posts even when followers are still manual.
  const feedRows = instagramPosts.length > 0 ? instagramPosts : telegramPosts;
  const accounts: Array<Record<string, unknown>> = [];
  if (instagramFollowers !== null) {
    accounts.push({
      id: "instagram", name: "Instagram", handle: "@camaradosdeputados",
      followers: instagramFollowers, change24h: integer(ig.change24h) ?? null,
      updatedAt: igObserved,
      source: ["embed", "embed_observed"].includes(String(ig.source))
        ? "public_embed" : undefined,
    });
  }
  if (xFollowers !== null) {
    accounts.push({
      id: "x", name: "X", handle: "@camaradeputados",
      followers: xFollowers,
      change24h: typeof x.change24h === "number" && Number.isSafeInteger(x.change24h)
        ? x.change24h : null,
      updatedAt: xObserved,
    });
  }
  // The public profiles are independently collected. A failed source is
  // absent, not fabricated, and each successful read has its own timestamp.
  for (const [id, label, handle] of [
    ["youtube", "YouTube", "@camaradosdeputadosoficial"],
    ["tiktok", "TikTok", "@camaradosdeputados"],
    ["facebook", "Facebook", "@camaradeputados"],
  ] as const) {
    const profile = object(raw[id]);
    const followers = integer(profile.followers);
    if (followers === null) continue;
    accounts.push({
      id, name: label, handle,
      followers,
      change24h: id === "youtube" ? null :
        typeof profile.change24h === "number" && Number.isSafeInteger(profile.change24h)
          ? profile.change24h : null,
      updatedAt: validDate(profile.observedAt) || collectedAt,
    });
  }
  if (!accounts.length && !feedRows.length)
    throw new Error("Snapshot social sem dados válidos");
  const snapshot = parseSnapshot({
    schemaVersion: 1,
    collectedAt,
    accounts,
    posts: feedRows,
  });
  panel.accounts = panel.accounts.map(
    (account) => snapshot.accounts.find((item) => item.id === account.id) || account,
  );
  if (feedRows.length) panel.posts = snapshot.posts;
  const usingInstagramFeed = instagramPosts.length > 0;
  panel.sources.social = {
    state: instagramFollowers === null ? "partial" : "ok",
    checkedAt: collectedAt,
    instagramAvailable: instagramFollowers !== null,
    instagramPublicCheckedAt: validDate(ig.publicCheckedAt) ||
      (integer(ig.publicFollowers) !== null ? collectedAt : undefined),
    feedSource: usingInstagramFeed ? "instagram" :
      telegramPosts.length ? "telegram" : undefined,
    message: usingInstagramFeed
      ? ["embed", "embed_observed"].includes(String(ig.source))
        ? "Instagram via fonte pública; contagem sujeita a atraso da plataforma"
        : "Publicações originais do Instagram"
      : telegramPosts.length
        ? "Instagram indisponível; últimas imagens do canal oficial da Câmara no Telegram"
        : "Instagram indisponível; métricas públicas disponíveis",
  };
}

async function limitedJson(
  url: string, signal: AbortSignal, headers: Record<string, string> = {},
  timeout = 10000,
): Promise<unknown> {
  const response = await fetch(url, {
    headers,
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
    next: { revalidate: 90 },
  });
  if (!response.ok) throw new Error("Fonte social HTTP " + response.status);
  if (Number(response.headers.get("content-length") || 0) > 1_000_000)
    throw new Error("Fonte social excede limite");
  const body = await response.text();
  if (body.length > 1_000_000) throw new Error("Fonte social excede limite");
  return JSON.parse(body) as unknown;
}

async function publicServerlessCollection(
  signal: AbortSignal, endpoint: string,
): Promise<unknown> {
  const url = safeHttpsUrl(endpoint);
  if (!url || new URL(url).pathname !== "/api/social_public")
    throw new Error("Endpoint social serverless inválido");
  return limitedJson(url, signal, {}, 22000);
}

async function publicSupabaseCollection(
  signal: AbortSignal, base: string, key: string,
): Promise<unknown> {
  const url = safeHttpsUrl(base);
  if (!url || !/^([a-z0-9-]+\.)?supabase\.co$/.test(new URL(url).hostname))
    throw new Error("URL do Supabase inválida");
  const endpoint = new URL("/rest/v1/camara_social_snapshots?select=payload&id=eq.camara",
    new URL(url).origin).toString();
  const rows = await limitedJson(endpoint, signal, { apikey: key });
  if (!Array.isArray(rows) || rows.length !== 1 || !object(rows[0]).payload)
    throw new Error("Snapshot Supabase ainda não inicializado");
  return object(rows[0]).payload;
}

function collectionAge(value: unknown): number {
  const date = validDate(object(value).collectedAt);
  return date ? Date.now() - Date.parse(date) : Infinity;
}

async function social(
  panel: PanelData,
  signal: AbortSignal,
  environment: PanelEnvironment,
): Promise<void> {
  const source = environment.PANEL_SOCIAL_SOURCE_URL;
  if (!source) {
    const candidates: unknown[] = [];
    if (environment.PANEL_SUPABASE_URL && environment.PANEL_SUPABASE_ANON_KEY) {
      try {
        candidates.push(await publicSupabaseCollection(
          signal, environment.PANEL_SUPABASE_URL, environment.PANEL_SUPABASE_ANON_KEY,
        ));
      } catch { /* Dedicated Supabase not provisioned yet: use GitHub. */ }
    }
    try {
      candidates.push(await limitedJson(GITHUB_SOCIAL_DATA, signal));
    } catch { /* No scheduled snapshot published yet: use live collector. */ }

    // Prefer the freshest *scheduled* snapshot if collection is recent.
    const valid = candidates.filter((item) => collectionAge(item) < Infinity)
      .sort((a, b) => collectionAge(a) - collectionAge(b));
    for (const item of valid) {
      if (collectionAge(item) > COLLECTOR_MAX_AGE) continue;
      try {
        applyPublicCollection(panel, item);
        return;
      } catch { /* Malformed snapshot; try the other source. */ }
    }

    // If Actions is delayed or both stores fail, query the Vercel function.
    const publicEndpoint = environment.PANEL_PUBLIC_SOCIAL_URL ||
      (process.env.NODE_ENV === "production"
        ? `https://${process.env.VERCEL_URL || "painel-redes-camara-six.vercel.app"}/api/social_public`
        : undefined);
    if (publicEndpoint) {
      try {
        applyPublicCollection(panel, await publicServerlessCollection(signal, publicEndpoint));
        return;
      } catch { /* Preserve older stored readings with their original timestamps. */ }
    }
    for (const item of valid) {
      try {
        applyPublicCollection(panel, item);
        return;
      } catch { /* Ignore an invalid stored snapshot. */ }
    }
    if (environment.PANEL_SOCIAL_FALLBACK_PANEL_URL) {
      await socialFromLegacyPanel(panel, signal, environment.PANEL_SOCIAL_FALLBACK_PANEL_URL);
      return;
    }
    throw new Error("Sem fonte social disponível");
  }
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
  panel.posts = snapshot.posts.map((post) =>
    post.mediaUrl
      ? {
          ...post,
          mediaUrl: `${INSTAGRAM_MEDIA_PROXY}?id=${encodeURIComponent(post.id)}`,
        }
      : post,
  );
  panel.sources.social = {
    state: "ok",
    checkedAt: snapshot.collectedAt,
    message: "Coleta das redes sociais",
  };
}

/**
 * One-off reported Instagram count. Keep its original timestamp: repeated
 * Vercel refreshes must never make a manual report look like a live reading.
 * A genuinely newer automatic count takes precedence.
 */
export async function getPanel(
  environment: PanelEnvironment = {
    PANEL_VOTE_ID: process.env.PANEL_VOTE_ID,
    PANEL_SOCIAL_SOURCE_URL: process.env.PANEL_SOCIAL_SOURCE_URL,
    PANEL_SOCIAL_SOURCE_TOKEN: process.env.PANEL_SOCIAL_SOURCE_TOKEN,
    PANEL_SOCIAL_FALLBACK_PANEL_URL: process.env.PANEL_SOCIAL_FALLBACK_PANEL_URL,
    PANEL_PUBLIC_SOCIAL_URL: process.env.PANEL_PUBLIC_SOCIAL_URL,
    PANEL_SUPABASE_URL: process.env.PANEL_SUPABASE_URL,
    PANEL_SUPABASE_ANON_KEY: process.env.PANEL_SUPABASE_ANON_KEY,
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
