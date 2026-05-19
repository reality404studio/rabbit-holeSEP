import { NextResponse } from "next/server";
import { getStatus } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET() {
  const status = await getStatus();
  return NextResponse.json(status);
}
