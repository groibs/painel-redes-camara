import {
  networkIds,
  type SocialAccount,
  type SocialPost,
  type SocialSnapshot,
} from "./types.ts";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;

export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 3000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function parseSnapshot(value: unknown): SocialSnapshot {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !timestamp(value.collectedAt)
  )
    throw new Error("Formato de snapshot inválido");
  if (Date.parse(value.collectedAt) > Date.now() + 300000)
    throw new Error("Data de coleta no futuro");
  if (
    !Array.isArray(value.accounts) ||
    value.accounts.length > 4 ||
    !Array.isArray(value.posts) ||
    value.posts.length > 20
  )
    throw new Error("Listas inválidas");
  const seen = new Set<string>();
  const accounts: SocialAccount[] = value.accounts.map((item: unknown) => {
    if (
      !record(item) ||
      !networkIds.includes(item.id as (typeof networkIds)[number]) ||
      seen.has(item.id as string)
    )
      throw new Error("Rede inválida ou repetida");
    if (
      !text(item.name, 40) ||
      !text(item.handle, 100) ||
      !count(item.followers)
    )
      throw new Error("Métrica inválida");
    if (
      item.change24h !== null &&
      item.change24h !== undefined &&
      !(
        typeof item.change24h === "number" &&
        Number.isSafeInteger(item.change24h)
      )
    )
      throw new Error("Variação inválida");
    const updatedAt = item.updatedAt ?? value.collectedAt;
    if (!timestamp(updatedAt) || Date.parse(updatedAt) > Date.now() + 300000)
      throw new Error("Data de métrica inválida");
    seen.add(item.id as string);
    return {
      id: item.id as SocialAccount["id"],
      name: item.name,
      handle: item.handle,
      followers: item.followers,
      change24h: (item.change24h as number | null) ?? null,
      updatedAt,
    };
  });
  const postIds = new Set<string>();
  const posts: SocialPost[] = value.posts.map((item: unknown) => {
    if (
      !record(item) ||
      !text(item.id, 100) ||
      !item.id ||
      postIds.has(item.id) ||
      !text(item.caption, 4000) ||
      !timestamp(item.publishedAt)
    )
      throw new Error("Publicação inválida");
    if (!["image", "video", "carousel"].includes(item.type as string))
      throw new Error("Tipo de mídia inválido");
    if (!count(item.likes) && item.likes !== null && item.likes !== undefined)
      throw new Error("Curtidas inválidas");
    if (
      !count(item.comments) &&
      item.comments !== null &&
      item.comments !== undefined
    )
      throw new Error("Comentários inválidos");
    const mediaUrl = safeHttpsUrl(item.mediaUrl);
    const permalink = safeHttpsUrl(item.permalink);
    if (item.mediaUrl && !mediaUrl) throw new Error("URL de mídia inválida");
    if (
      item.permalink &&
      (!permalink ||
        !["instagram.com", "www.instagram.com"].includes(
          new URL(permalink).hostname,
        ))
    )
      throw new Error("Link da publicação inválido");
    postIds.add(item.id);
    return {
      id: item.id,
      caption: item.caption,
      publishedAt: item.publishedAt,
      type: item.type as SocialPost["type"],
      mediaUrl,
      permalink,
      likes: (item.likes as number | null) ?? null,
      comments: (item.comments as number | null) ?? null,
    };
  });
  return {
    schemaVersion: 1,
    collectedAt: value.collectedAt,
    accounts,
    posts: posts.sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    ),
  };
}
