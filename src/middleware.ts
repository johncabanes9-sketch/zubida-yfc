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

  const redirectTo = (path: string) => {
    const r = NextResponse.redirect(new URL(path, request.url));
    // carry over any cookies Supabase set on `response` during getUser()/signOut()
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  let user = null;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    return redirectTo("/admin/login");
  }

  if (!user) {
    if (isLogin) return response;
    return redirectTo("/admin/login");
  }

  // Idle timeout
  const last = request.cookies.get("last_activity")?.value;
  const now = Date.now();
  if (last && now - Number(last) > IDLE_TIMEOUT_MS) {
    await supabase.auth.signOut();
    const r = redirectTo("/admin/login?error=timeout");
    r.cookies.set("last_activity", "", { maxAge: 0, path: "/" });
    return r;
  }
  response.cookies.set("last_activity", String(now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  if (isLogin) {
    return redirectTo("/admin");
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
