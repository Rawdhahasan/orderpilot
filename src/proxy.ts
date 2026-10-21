import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page request (docs/TECHNICAL_ARCHITECTURE.md §4.1):
 * assigns a request ID, sets a nonce-based Content Security Policy, refreshes
 * the Supabase session cookie, and sends signed-out visitors of protected
 * pages to sign-in. Authorisation itself is enforced by the server and the
 * database, never here alone.
 */
const PROTECTED = ["/o/", "/workspaces", "/account"];

function supabaseOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
}

function contentSecurityPolicy(nonce: string, path: string): string {
  const dev = process.env.NODE_ENV === "development";
  // Original documents (PDF or image) may be framed by our own review screen only.
  if (path.startsWith("/api/documents/")) return "frame-ancestors 'self'";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Radix and Sonner position elements with inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Uploads go directly to private storage with signed URLs (TECHNICAL_ARCHITECTURE.md §8).
    `connect-src 'self' ${supabaseOrigin()}${dev ? " ws:" : ""}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, request.nextUrl.pathname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-orderpilot-path", request.nextUrl.pathname + request.nextUrl.search);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let signedIn = false;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    });
    // getUser() validates the session with the Auth server and refreshes it.
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  }

  const path = request.nextUrl.pathname;
  if (
    !signedIn &&
    PROTECTED.some((prefix) => path === prefix.replace(/\/$/, "") || path.startsWith(prefix))
  ) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", path + request.nextUrl.search);
    const redirect = NextResponse.redirect(signIn);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("x-request-id", requestId);
    return redirect;
  }

  response.headers.set("content-security-policy", csp);
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
