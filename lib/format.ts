import type { AgendaEvent, PanelData } from "./types.ts";

export const TIMEZONE = "America/Sao_Paulo";

export function brasiliaDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function shiftDate(date: string, days: number): string {
  const cursor = new Date(`${date}T12:00:00-03:00`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return brasiliaDate(cursor);
}
export function weekRange(date: string): { start: string; end: string } {
  const weekday = new Date(`${date}T12:00:00-03:00`).getUTCDay();
  const start = shiftDate(date, -((weekday + 6) % 7));
  return { start, end: shiftDate(start, 6) };
}
export function zonedTimestamp(value: string): string {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}-03:00`;
}
export function timeOf(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(zonedTimestamp(value)));
}
export function eventDate(event: AgendaEvent): string {
  return brasiliaDate(new Date(zonedTimestamp(event.startsAt)));
}
export function compactNumber(value: number | null): string {
  if (value === null) return "—";
  if (value < 1000) return value.toLocaleString("pt-BR");
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
export function fullNumber(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("pt-BR");
}
export function isOngoing(event: AgendaEvent): boolean {
  return /em andamento/i.test(event.status);
}
export function isCancelled(event: AgendaEvent): boolean {
  return /cancelad|suspens|não realizad|nao realizad/i.test(event.status);
}

// Failed sources retain their own last successful payload and original timestamps.
// A successful empty response must clear yesterday's agenda or old posts.
export function mergePanel(
  previous: PanelData | null,
  incoming: PanelData,
): PanelData {
  if (!previous || previous.demo !== incoming.demo) return incoming;
  const merged = { ...incoming, sources: { ...incoming.sources } };
  if (
    incoming.sources.agenda.state === "error" &&
    previous.weekStart === incoming.weekStart
  ) {
    merged.events = previous.events;
    merged.sources.agenda = {
      ...incoming.sources.agenda,
      checkedAt: previous.sources.agenda.checkedAt,
    };
  }
  if (incoming.sources.votes.state === "error") {
    merged.vote = previous.vote;
    merged.sources.votes = {
      ...incoming.sources.votes,
      checkedAt: previous.sources.votes.checkedAt,
    };
  }
  if (incoming.sources.social.state === "error") {
    merged.accounts = previous.accounts;
    merged.posts = previous.posts;
    merged.sources.social = {
      ...incoming.sources.social,
      checkedAt: previous.sources.social.checkedAt,
    };
  }
  return merged;
}
