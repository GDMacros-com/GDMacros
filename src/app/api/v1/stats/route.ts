import { publicApi, apiOptions, apiMethodNotAllowed } from "@/lib/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return publicApi(request, "stats");
}

export const HEAD = GET;
export const OPTIONS = apiOptions;

export const POST = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
