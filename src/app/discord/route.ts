import { NextResponse } from "next/server";
import { site } from "@/lib/site";
export function GET() {
  return NextResponse.redirect(site.discord, 307);
}
