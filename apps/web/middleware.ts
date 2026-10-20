import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
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
  const path = req.nextUrl.pathname;
  const isAuthPage = path.startsWith("/login");
  // Public: legal pages (platform reviews need them) and the cron endpoint (it checks its own secret).
  const isPublic = ["/privacy", "/terms", "/data-deletion", "/api/cron"].some((p) => path === p || path.startsWith(`${p}/`));
  if (isPublic) return res;
  if (!signedIn && !isAuthPage) return NextResponse.redirect(new URL("/login", req.url));
  if (signedIn && isAuthPage) return NextResponse.redirect(new URL("/", req.url));
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
