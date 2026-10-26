import { publicApi, apiOptions, apiMethodNotAllowed } from "@/lib/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ levelId: string }> };

export async function GET(request: Request, context: Context) {
  const { levelId } = await context.params;
  return publicApi(request, "level", levelId);
}

export const HEAD = GET;
export const OPTIONS = apiOptions;

export const POST = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
