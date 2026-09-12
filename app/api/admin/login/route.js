import { NextResponse } from "next/server";
import {
  adminCookieName,
  createAdminToken,
  validateAdminPassword,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const password = String(body.password || "");

  if (!validateAdminPassword(password)) {
    return NextResponse.json(
      { error: "Contraseña incorrecta." },
      { status: 401 }
    );
  }

  const token = createAdminToken();
  const response = NextResponse.json({ ok: true });

  response.cookies.set(adminCookieName(), token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
