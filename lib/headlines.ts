/** Concise, human-readable headlines for all compact TV agenda surfaces.
 * Keep the original official title in source data and accessible tooltips.
 */
export const TICKER_MAX_LENGTH = 116;

const PLN_ENUMERATION =
  /\bApreciação\s+d[oa]s?\s+PLN(?:s|['’]s)?\s*(?:n[º°.]?\s*s?\.?\s*)?((?:\d+\s*(?:,\s*|\s+e\s+)){4,}\d+)\s*,?\s*de\s*(20\d{2})/gi;

const OTHER_PLN_ENUMERATION =
  /\bPLN(?:s|['’]s)?\s*(?:n[º°.]?\s*s?\.?\s*)?((?:\d+\s*(?:,\s*|\s+e\s+)){4,}\d+)/gi;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function shorten(text: string, maxLength: number): string {
  const trimmed = clean(text);
  if (trimmed.length <= maxLength) return trimmed;
  if (maxLength <= 4) return trimmed.slice(0, maxLength);
  const cut = trimmed.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const boundary = lastSpace > Math.floor(maxLength * 0.5) ? lastSpace : cut.length;
  return cut.slice(0, boundary).replace(/[\s,;:–-]+$/g, "") + "…";
}

export function tickerHeadline(title: string): string {
  return clean(title)
    .replace(PLN_ENUMERATION, (_all, numbers: string, year: string) =>
      `Apreciação de ${(numbers.match(/\d+/g) || []).length} PLNs de ${year}`)
    .replace(OTHER_PLN_ENUMERATION, (_all, numbers: string) =>
      `${(numbers.match(/\d+/g) || []).length} PLNs`)
    .replace(/;\s*e\s+(?=[a-záàâãéêíóôõúç])/gi, " e ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Summarize long legislative enumerations across all compact agenda surfaces.
 * Keep shorter titles unchanged and never mutate the original agenda record.
 * A char ceiling is still necessary for arbitrary, non-enumeration titles.
 */
export function agendaHeadline(title: string, maxLength = 96): string {
  return shorten(tickerHeadline(title), Math.max(32, Math.min(180, maxLength)));
}

/** Limit the complete ticker item, including its source, to prevent
 * unreadably long scrolling ribbons. No source title is modified in data.
 */
export function tickerMessage(organ: string, title: string): string {
  const source = shorten(organ || "Câmara", 34);
  const prefix = source + ": ";
  return prefix + shorten(tickerHeadline(title), TICKER_MAX_LENGTH - prefix.length);
}
