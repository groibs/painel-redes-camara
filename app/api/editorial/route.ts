import { NextResponse } from "next/server";
import type { EditorialData } from "@/lib/types";

export const dynamic = "force-dynamic";

const SOURCE =
  "https://painel-redes-scraper-camara.vercel.app/api/editorial";

function validEditorial(value: unknown): value is EditorialData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<EditorialData>;
  return (
    typeof data.collectedAt === "string" &&
    Array.isArray(data.topics) &&
    Array.isArray(data.liveStreams) &&
    !!data.sources &&
    typeof data.sources === "object"
  );
}

export async function GET() {
  try {
    const response = await fetch(SOURCE, {
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
      headers: {
        Accept: "application/json",
        "User-Agent": "RedeCamaraPanel/1",
      },
    });
    if (!response.ok) throw new Error("editorial_source_unavailable");
    const json: unknown = await response.json();
    if (!validEditorial(json)) throw new Error("invalid_editorial_response");

    return NextResponse.json(json, {
      headers: {
        "Cache-Control":
          "public, max-age=30, s-maxage=120, stale-while-revalidate=600",
      },
    });
  } catch {
    return NextResponse.json(
      {
        collectedAt: new Date().toISOString(),
        topics: [],
        liveStreams: [],
        sources: { google: "error", x: "error", youtube: "error" },
      } satisfies EditorialData,
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=15, s-maxage=30",
        },
      },
    );
  }
}
