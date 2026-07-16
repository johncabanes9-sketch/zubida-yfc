import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const isLogin = request.nextUrl.pathname === "/admin/login";

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (all) => {
          all.forEach(({ name, value }) => request.cookies.set(name, value));
          all.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isLogin) return response;
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  // Idle timeout
  const last = request.cookies.get("last_activity")?.value;
  const now = Date.now();
  if (last && now - Number(last) > IDLE_TIMEOUT_MS) {
    await supabase.auth.signOut();
    const res = NextResponse.redirect(new URL("/admin/login?error=timeout", request.url));
    res.cookies.set("last_activity", "", { maxAge: 0, path: "/" });
    return res;
  }
  response.cookies.set("last_activity", String(now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  if (isLogin) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
