import assert from "node:assert/strict";
import test from "node:test";
import {
  TICKER_MAX_LENGTH,
  agendaHeadline,
  tickerHeadline,
  tickerMessage,
} from "../lib/headlines.ts";

const listedPlns =
  "Apreciação dos PLN's nºs 1, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 22, 23, 25, 26, 27, 28, 29, 30, 33 e 35, de 2026; e eleição do Conselho de Comunicação Social.";

test("resumes the actual Congress PLN list into a concise headline", () => {
  const output = tickerMessage("CONGRESSO NACIONAL", listedPlns);
  assert.equal(
    output,
    "CONGRESSO NACIONAL: Apreciação de 26 PLNs de 2026 e eleição do Conselho de Comunicação Social.",
  );
  assert.ok(output.length <= TICKER_MAX_LENGTH);
});

test("also condenses PLNs and nº spelling variants", () => {
  assert.equal(
    tickerHeadline("Apreciação dos PLNs nºs 1, 2, 3, 4, 5 e 6, de 2026."),
    "Apreciação de 6 PLNs de 2026.",
  );
  assert.equal(
    tickerHeadline("Votação de PLN nºs 1, 2, 3, 4 e 5; demais assuntos"),
    "Votação de 5 PLNs; demais assuntos",
  );
});

test("preserves concise announcements without altering text", () => {
  assert.equal(
    tickerMessage("Plenário", "Votação do orçamento"),
    "Plenário: Votação do orçamento",
  );
});

test("limits arbitrary long announcements at a word boundary", () => {
  const title = "Debate sobre políticas públicas " + "de interesse nacional ".repeat(36);
  const msg = tickerMessage("Comissão de Educação", title);
  assert.ok(msg.length <= TICKER_MAX_LENGTH);
  assert.ok(msg.endsWith("…"));
  assert.ok(!msg.endsWith(" …"));
});

test("limits unusually long source names too", () => {
  const output = tickerMessage("Comissão Extraordinária de Acompanhamento das Medidas Especiais de Defesa", "Reunião de hoje");
  assert.ok(output.length <= TICKER_MAX_LENGTH);
  assert.ok(output.includes(": Reunião de hoje"));
});

test("compact titles everywhere preserve the second Congress subject", () => {
  const sample = "Apreciação dos PLN's nºs 1, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 22, 23, 25, 26, 27, 28, 29, 30, 33 e 35, de 2026; e eleição do Conselho de Comunicação Social.";
  for (const limit of [85, 90, 102, 106]) {
    assert.equal(agendaHeadline(sample, limit),
      "Apreciação de 26 PLNs de 2026 e eleição do Conselho de Comunicação Social.");
  }
});

test("every compact card limits arbitrary long official titles", () => {
  const original = "Audiência pública " + "sobre a atualização de políticas públicas ".repeat(20);
  assert.ok(original.length > 100);
  for (const limit of [85, 90, 102, 106]) {
    const result = agendaHeadline(original, limit);
    assert.ok(result.length <= limit);
    assert.ok(result.endsWith("…"));
  }
  // The formatter is presentation-only; source title remains intact.
  assert.ok(original.includes("sobre a atualização"));
});

test("short titles remain complete in all agenda panels", () => {
  assert.equal(agendaHeadline("Sistema LEXOR", 85), "Sistema LEXOR");
});
