export const networkIds = [
  "instagram",
  "tiktok",
  "x",
  "youtube",
  "facebook",
] as const;
export type NetworkId = (typeof networkIds)[number];
export type SourceState = "ok" | "pending" | "error";
export type Source = {
  state: SourceState;
  checkedAt: string | null;
  message: string;
};

export type SocialAccount = {
  id: NetworkId;
  name: string;
  handle: string;
  followers: number | null;
  change24h: number | null;
  updatedAt: string | null;
};
export type SocialPost = {
  id: string;
  caption: string;
  mediaUrl: string | null;
  permalink: string | null;
  publishedAt: string;
  type: "image" | "video" | "carousel";
  likes: number | null;
  comments: number | null;
  demoStyle?: "green" | "blue" | "mint";
};
export type AgendaEvent = {
  id: number;
  startsAt: string;
  endsAt: string | null;
  title: string;
  type: string;
  status: string;
  organ: string;
  /** Official full name of the event's responsible organ(s), when available. */
  organName?: string;
  location: string;
  url: string;
};
export type Vote = {
  id: string;
  title: string;
  description: string;
  registeredAt: string;
  approved: boolean | null;
  yes: number | null;
  no: number | null;
  other: number | null;
  url: string;
};
export type PanelData = {
  schemaVersion: 1;
  demo: boolean;
  generatedAt: string;
  date: string;
  weekStart: string;
  weekEnd: string;
  accounts: SocialAccount[];
  posts: SocialPost[];
  events: AgendaEvent[];
  vote: Vote | null;
  sources: { agenda: Source; votes: Source; social: Source };
};
export type SocialSnapshot = {
  schemaVersion: 1;
  collectedAt: string;
  accounts: SocialAccount[];
  posts: SocialPost[];
};

export type EditorialTopicSource = "google" | "x" | "camara";
export type EditorialTopic = {
  label: string;
  weight: 1 | 2 | 3 | 4 | 5;
  sources: EditorialTopicSource[];
};
export type LiveStream = {
  id: string;
  title: string;
  watchUrl: string;
  embedUrl: string;
  thumbnail: string;
};
export type EditorialData = {
  collectedAt: string;
  topics: EditorialTopic[];
  liveStreams: LiveStream[];
  sources: {
    google: "ok" | "error";
    x: "ok" | "error";
    youtube: "ok" | "error";
  };
};
