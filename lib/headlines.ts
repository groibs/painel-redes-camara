/** Concise headlines for the TV news ticker.
 * Full official agenda titles remain available in the detailed sections.
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

/** Limit the complete ticker item, including its source, to prevent
 * unreadably long scrolling ribbons. No source title is modified in data.
 */
export function tickerMessage(organ: string, title: string): string {
  const source = shorten(organ || "Câmara", 34);
  const prefix = source + ": ";
  return prefix + shorten(tickerHeadline(title), TICKER_MAX_LENGTH - prefix.length);
}
