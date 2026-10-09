import { NextResponse, type NextRequest } from "next/server";
import { botRequest } from "@/lib/bot/server";
import { publicLeaderboard } from "@/lib/bot/leaderboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (!Number.isInteger(page) || page < 1 || page > 400)
    return NextResponse.json(
      { error: "Choose a valid page." },
      { status: 400, headers },
    );
  try {
    const result = await botRequest(
      `leaderboard?page=${page}`,
      "public-leaderboard",
    );
    if (result.status !== 200) throw new Error("Unavailable");
    return NextResponse.json(publicLeaderboard(result.data, page), { headers });
  } catch {
    return NextResponse.json(
      { available: false, entries: [], total: 0, page },
      { headers },
    );
  }
}
