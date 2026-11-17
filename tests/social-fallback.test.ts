import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import type { PanelData } from "../lib/types.ts";

// Bundle the server entry so this integration test exercises the same source
// selection and parsing as /api/painel, including its extensionless imports.
const bundle = await build({
  entryPoints: [new URL("../lib/camara.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  target: "node24",
});
const { getPanel } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
) as { getPanel: (environment: { PANEL_PUBLIC_SOCIAL_URL: string }) => Promise<PanelData> };

const liveEndpoint = "https://collector.example.test/api/social_public";

test("partial live collection preserves other networks and their observation dates", async (t) => {
  const storedAt = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
  const freshAt = new Date().toISOString();
  const stored = {
    collectedAt: storedAt,
    instagram: { followers: 398000, source: "embed_observed", observedAt: storedAt },
    x: { followers: 1087000, observedAt: storedAt },
    tiktok: { followers: 149700, observedAt: storedAt },
    youtube: { followers: 1500000, observedAt: storedAt },
    facebook: { followers: 666336, observedAt: storedAt },
  };
  const fresh = {
    collectedAt: freshAt,
    instagram: { followers: 399737, source: "embed_observed" },
    x: { followers: 1087006 },
  };
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("raw.githubusercontent.com")) return Response.json(stored);
    if (url === liveEndpoint) return Response.json(fresh);
    return Response.json({ dados: [], links: [] });
  });

  const result = await getPanel({ PANEL_PUBLIC_SOCIAL_URL: liveEndpoint });
  const accounts = new Map(result.accounts.map((account) => [account.id, account]));
  assert.equal(accounts.get("instagram")?.followers, 399737);
  assert.equal(accounts.get("instagram")?.updatedAt, freshAt);
  assert.equal(accounts.get("x")?.followers, 1087006);
  assert.equal(accounts.get("x")?.updatedAt, freshAt);
  for (const id of ["tiktok", "youtube", "facebook"] as const) {
    assert.equal(accounts.get(id)?.followers, stored[id].followers);
    assert.equal(accounts.get(id)?.updatedAt, storedAt);
  }
});

test("fresh scheduled collection supplies every network without a partial fallback", async (t) => {
  const collectedAt = new Date().toISOString();
  const stored = {
    collectedAt,
    instagram: { followers: 400027, source: "profile_observed" },
    x: { followers: 1087006 },
    tiktok: { followers: 149700 },
    youtube: { followers: 1500000 },
    facebook: { followers: 666336 },
  };
  let liveRequests = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("raw.githubusercontent.com")) return Response.json(stored);
    if (url === liveEndpoint) {
      liveRequests += 1;
      throw new Error("Live collector should not be needed");
    }
    return Response.json({ dados: [], links: [] });
  });

  const result = await getPanel({ PANEL_PUBLIC_SOCIAL_URL: liveEndpoint });
  assert.equal(liveRequests, 0);
  assert.equal(result.accounts.find((account) => account.id === "instagram")?.followers, 400027);
  assert.equal(result.accounts.find((account) => account.id === "instagram")?.source, "public_profile");
  assert.ok(result.accounts.every((account) => account.followers !== null));
  assert.ok(result.accounts.every((account) => account.updatedAt === collectedAt));
});

test("a newly published counter is not held by the mutable branch CDN cache", async (t) => {
  let now = Date.now();
  let followers = 399737;
  const cdn = new Map<string, unknown>();
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("raw.githubusercontent.com")) {
      if (!cdn.has(url)) cdn.set(url, {
        collectedAt: new Date(now).toISOString(),
        instagram: { followers, source: "profile_observed" },
      });
      return Response.json(cdn.get(url));
    }
    return Response.json({ dados: [], links: [] });
  });
  const before = await getPanel({ PANEL_PUBLIC_SOCIAL_URL: liveEndpoint });
  assert.equal(before.accounts.find((account) => account.id === "instagram")?.followers, 399737);
  followers = 400027;
  now += 91000;
  const after = await getPanel({ PANEL_PUBLIC_SOCIAL_URL: liveEndpoint });
  assert.equal(after.accounts.find((account) => account.id === "instagram")?.followers, 400027);
});
