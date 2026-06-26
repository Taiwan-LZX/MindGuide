import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // 允许开发服务器从本地 IP / 回环地址访问（消除 Next 16 的
  // "Cross origin request detected" 开发期警告，同时让 agent-browser
  // 等无头浏览器可以通过 127.0.0.1 / 容器 IP 访问页面资源）。
  allowedDevOrigins: ["127.0.0.1", "0.0.0.0", "localhost", "21.0.2.135", "21.0.3.20"],
  // ── Security headers ──────────────────────────────────────────────────────
  // Production: full hardening (CSP + frame-ancestors 'none' to block all
  //   clickjacking).
  // Dev: relax frame-ancestors so the sandbox Preview Panel (an iframe on a
  //   sibling port / gateway domain) can embed the app. Without this, the
  //   Preview Panel shows a blank screen because the browser refuses to
  //   frame a page that sets `frame-ancestors 'none'`.
  async headers() {
    const baseHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      },
    ];

    if (isDev) {
      // Dev mode: allow the sandbox gateway (port 81) and any sibling port on
      // localhost / 127.0.0.1 to embed this app in an iframe (Preview Panel).
      // Also relax connect-src so HMR/websocket can reach the dev server.
      baseHeaders[3] = {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self' ws: wss: http: https:",
          "frame-ancestors 'self' http://127.0.0.1:* http://localhost:* https://*",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      };
      // In dev we MUST NOT set X-Frame-Options: DENY — that would also block
      // the Preview Panel iframe. Omit it entirely (CSP frame-ancestors
      // already covers framing policy).
    } else {
      // Production: strict clickjacking defense.
      baseHeaders.unshift({ key: "X-Frame-Options", value: "DENY" });
      baseHeaders[baseHeaders.length - 1] = {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      };
    }

    return [{ source: "/:path*", headers: baseHeaders }];
  },
};

export default nextConfig;
