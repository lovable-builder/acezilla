import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Public: legal pages (platform reviews need them) and the cron endpoint (it checks its own secret).
const PUBLIC = ["/privacy", "/terms", "/data-deletion", "/api/cron", "/auth/callback", "/forgot-password"];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // Decide before touching the auth server: public pages must not pay for a network round trip.
  if (PUBLIC.some((p) => path === p || path.startsWith(`${p}/`))) return NextResponse.next();
  // Landing page: visitors without a session cookie get the static page with no network call at all.
  if (path === "/" && !req.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );
  // getClaims validates the JWT signature; do not trust getSession() on the server.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims;
  const isAuthPage = path.startsWith("/login");
  if (path === "/") return signedIn ? NextResponse.redirect(new URL("/dashboard", req.url)) : res;
  if (!signedIn && !isAuthPage) return NextResponse.redirect(new URL("/login", req.url));
  if (signedIn && isAuthPage) return NextResponse.redirect(new URL("/dashboard", req.url));
  return res;
}

// Static assets and the browser-tab icons never need a session.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"] };
