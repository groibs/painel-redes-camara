import test from "node:test";
import assert from "node:assert/strict";
import {
  brasiliaDate,
  mergePanel,
  weekRange,
  zonedTimestamp,
} from "../lib/format.ts";
import { parseSnapshot } from "../lib/snapshot.ts";
import type { PanelData } from "../lib/types.ts";

test("Brasília date remains yesterday during the UTC midnight boundary", () => {
  assert.equal(brasiliaDate(new Date("2026-10-07T01:30:00Z")), "2026-10-06");
  assert.deepEqual(weekRange("2026-10-06"), {
    start: "2026-10-05",
    end: "2026-10-11",
  });
  assert.deepEqual(weekRange("2027-01-01"), {
    start: "2026-12-28",
    end: "2027-01-03",
  });
  assert.equal(
    zonedTimestamp("2026-10-06T14:00:00"),
    "2026-10-06T14:00:00-03:00",
  );
});

const snapshot = {
  schemaVersion: 1,
  collectedAt: "2026-01-01T12:00:00Z",
  accounts: [
    {
      id: "instagram",
      name: "Instagram",
      handle: "@conta",
      followers: 0,
      change24h: -15,
    },
  ],
  posts: [],
};

test("Social snapshot keeps zero followers and negative real growth", () => {
  const parsed = parseSnapshot(snapshot);
  assert.equal(parsed.accounts[0].followers, 0);
  assert.equal(parsed.accounts[0].change24h, -15);
  assert.equal(parsed.accounts[0].updatedAt, snapshot.collectedAt);
});

test("Social snapshot rejects unsafe counts, duplicate accounts and executable links", () => {
  assert.throws(() =>
    parseSnapshot({
      ...snapshot,
      accounts: [{ ...snapshot.accounts[0], followers: -1 }],
    }),
  );
  assert.throws(() =>
    parseSnapshot({
      ...snapshot,
      accounts: [snapshot.accounts[0], snapshot.accounts[0]],
    }),
  );
  assert.throws(() =>
    parseSnapshot({
      ...snapshot,
      posts: [
        {
          id: "post",
          caption: "Test",
          publishedAt: snapshot.collectedAt,
          type: "image",
          mediaUrl: "javascript:alert(1)",
        },
      ],
    }),
  );
  assert.throws(() =>
    parseSnapshot({
      ...snapshot,
      posts: [
        {
          id: "post",
          caption: "Test",
          publishedAt: snapshot.collectedAt,
          type: "image",
          permalink: "https://example.org/post",
        },
      ],
    }),
  );
});

function panel(): PanelData {
  const source = {
    state: "ok" as const,
    checkedAt: "2026-10-06T12:00:00Z",
    message: "OK",
  };
  return {
    schemaVersion: 1,
    demo: false,
    generatedAt: "2026-10-06T12:00:00Z",
    date: "2026-10-06",
    weekStart: "2026-10-05",
    weekEnd: "2026-10-11",
    accounts: [],
    posts: [],
    vote: null,
    events: [
      {
        id: 1,
        startsAt: "2026-10-06T14:00:00-03:00",
        endsAt: null,
        title: "Existing event",
        type: "Audiência",
        status: "Convocada",
        organ: "CE",
        location: "Anexo II",
        url: "",
      },
    ],
    sources: { agenda: source, votes: source, social: source },
  };
}

test("Source failure keeps the last received agenda and its timestamp", () => {
  const previous = panel();
  const incoming = panel();
  incoming.events = [];
  incoming.sources.agenda = {
    state: "error",
    checkedAt: null,
    message: "Failed",
  };
  const merged = mergePanel(previous, incoming);
  assert.equal(merged.events.length, 1);
  assert.equal(merged.sources.agenda.state, "error");
  assert.equal(
    merged.sources.agenda.checkedAt,
    previous.sources.agenda.checkedAt,
  );
});

test("Successful empty results clear stale content; demo is never merged into live", () => {
  const previous = panel();
  const incoming = panel();
  incoming.events = [];
  assert.equal(mergePanel(previous, incoming).events.length, 0);
  incoming.demo = true;
  incoming.sources.agenda.state = "error";
  assert.equal(mergePanel(previous, incoming).events.length, 0);
});

test("An old week is not recycled after an agenda failure in a new week", () => {
  const previous = panel();
  const incoming = panel();
  incoming.weekStart = "2026-10-12";
  incoming.events = [];
  incoming.sources.agenda = {
    state: "error",
    checkedAt: null,
    message: "Failed",
  };
  assert.equal(mergePanel(previous, incoming).events.length, 0);
});
