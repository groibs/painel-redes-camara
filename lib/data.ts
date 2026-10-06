import { brasiliaDate, shiftDate, weekRange } from "./format";
import type { PanelData, SocialAccount } from "./types";

export function emptyAccounts(): SocialAccount[] {
  return [
    {
      id: "instagram",
      name: "Instagram",
      handle: "Câmara dos Deputados",
      followers: null,
      change24h: null,
      updatedAt: null,
    },
    {
      id: "tiktok",
      name: "TikTok",
      handle: "Câmara dos Deputados",
      followers: null,
      change24h: null,
      updatedAt: null,
    },
    {
      id: "x",
      name: "X / Twitter",
      handle: "Câmara dos Deputados",
      followers: null,
      change24h: null,
      updatedAt: null,
    },
    {
      id: "facebook",
      name: "Facebook",
      handle: "Câmara dos Deputados",
      followers: null,
      change24h: null,
      updatedAt: null,
    },
  ];
}

export function emptyPanel(): PanelData {
  const date = brasiliaDate();
  const week = weekRange(date);
  return {
    schemaVersion: 1,
    demo: false,
    generatedAt: new Date().toISOString(),
    date,
    weekStart: week.start,
    weekEnd: week.end,
    accounts: emptyAccounts(),
    posts: [],
    events: [],
    vote: null,
    sources: {
      agenda: {
        state: "pending",
        checkedAt: null,
        message: "Consultando agenda oficial",
      },
      votes: {
        state: "pending",
        checkedAt: null,
        message: "Consultando resultados oficiais",
      },
      social: {
        state: "pending",
        checkedAt: null,
        message: "Aguardando conexão das redes",
      },
    },
  };
}

export function demoPanel(): PanelData {
  const panel = emptyPanel();
  const now = new Date().toISOString();
  panel.demo = true;
  panel.accounts = emptyAccounts().map((account, index) => ({
    ...account,
    handle: [
      "@camaradosdeputados",
      "@camaradosdeputados",
      "@camaradeputados",
      "Câmara dos Deputados",
    ][index],
    followers: [1248600, 893420, 1102840, 516780][index],
    change24h: [1240, 865, 392, 218][index],
    updatedAt: now,
  }));
  panel.events = [
    {
      id: 1,
      startsAt: `${panel.date}T14:00:00-03:00`,
      endsAt: null,
      title: "Educação e os caminhos para o futuro",
      type: "Audiência pública",
      status: "Em andamento",
      organ: "Comissão de Educação",
      location: "Anexo II · Plenário 10",
      url: "",
    },
    {
      id: 2,
      startsAt: `${panel.date}T16:00:00-03:00`,
      endsAt: null,
      title: "Sessão deliberativa do Plenário",
      type: "Sessão deliberativa",
      status: "Convocada",
      organ: "Plenário",
      location: "Plenário Ulysses Guimarães",
      url: "",
    },
    {
      id: 3,
      startsAt: `${panel.date}T17:00:00-03:00`,
      endsAt: null,
      title: "Transição energética e desenvolvimento sustentável",
      type: "Audiência pública",
      status: "Convocada",
      organ: "Comissão de Meio Ambiente",
      location: "Anexo II · Plenário 8",
      url: "",
    },
    {
      id: 4,
      startsAt: `${shiftDate(panel.date, 1)}T10:00:00-03:00`,
      endsAt: null,
      title: "Proteção de crianças no ambiente digital",
      type: "Reunião deliberativa",
      status: "Convocada",
      organ: "Comissão de Comunicação",
      location: "Anexo II · Plenário 2",
      url: "",
    },
    {
      id: 5,
      startsAt: `${shiftDate(panel.date, 1)}T14:00:00-03:00`,
      endsAt: null,
      title: "Saúde pública e acesso a medicamentos",
      type: "Audiência pública",
      status: "Convocada",
      organ: "Comissão de Saúde",
      location: "Anexo II · Plenário 7",
      url: "",
    },
    {
      id: 6,
      startsAt: `${shiftDate(panel.date, 2)}T10:00:00-03:00`,
      endsAt: null,
      title: "Mobilidade urbana e cidades",
      type: "Audiência pública",
      status: "Convocada",
      organ: "Comissão de Desenvolvimento Urbano",
      location: "Anexo II · Plenário 16",
      url: "",
    },
    {
      id: 7,
      startsAt: `${shiftDate(panel.date, 3)}T09:00:00-03:00`,
      endsAt: null,
      title: "Participação cidadã no Parlamento",
      type: "Seminário",
      status: "Convocada",
      organ: "Legislação Participativa",
      location: "Auditório Nereu Ramos",
      url: "",
    },
  ];
  panel.posts = [
    {
      id: "demo-1",
      caption: "O que está em jogo na Câmara?",
      mediaUrl: null,
      permalink: null,
      publishedAt: now,
      type: "carousel",
      likes: 1842,
      comments: 96,
      demoStyle: "green",
    },
    {
      id: "demo-2",
      caption: "Seu voto. Sua voz. Nosso futuro.",
      mediaUrl: null,
      permalink: null,
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
      type: "video",
      likes: 3260,
      comments: 182,
      demoStyle: "blue",
    },
    {
      id: "demo-3",
      caption: "Por dentro do Parlamento",
      mediaUrl: null,
      permalink: null,
      publishedAt: new Date(Date.now() - 7200000).toISOString(),
      type: "image",
      likes: 956,
      comments: 41,
      demoStyle: "mint",
    },
  ];
  panel.vote = {
    id: "demonstracao",
    title: "Proteção de crianças no ambiente digital",
    description: "Exemplo de apresentação de uma votação nominal.",
    registeredAt: now,
    approved: true,
    yes: 342,
    no: 98,
    other: 12,
    url: "",
  };
  panel.sources = {
    agenda: { state: "ok", checkedAt: now, message: "Agenda ilustrativa" },
    votes: { state: "ok", checkedAt: now, message: "Votação ilustrativa" },
    social: {
      state: "ok",
      checkedAt: now,
      message: "Métricas e publicações ilustrativas",
    },
  };
  return panel;
}
