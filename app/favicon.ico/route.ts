import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const faviconUrl = new URL("/icons/icon-192x192.png", url.origin)
  return NextResponse.redirect(faviconUrl, { status: 308 })
}
