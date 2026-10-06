import { getPanel } from "@/lib/camara";

export const maxDuration = 60;

export async function GET() {
  try {
    return Response.json(await getPanel(), {
      headers: {
        "Cache-Control":
          "public, max-age=0, s-maxage=30, stale-while-revalidate=30",
      },
    });
  } catch {
    console.error("[painel] falha ao preparar resposta");
    return Response.json(
      { error: "Painel temporariamente indisponível" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
