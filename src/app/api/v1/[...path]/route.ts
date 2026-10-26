import { apiNotFound, apiOptions, apiMethodNotAllowed } from "@/lib/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = apiNotFound;
export const HEAD = apiNotFound;
export const OPTIONS = apiOptions;
export const POST = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
