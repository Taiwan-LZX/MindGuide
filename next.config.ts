import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // 允许开发服务器从本地 IP / 回环地址访问（消除 Next 16 的
  // "Cross origin request detected" 开发期警告，同时让 agent-browser
  // 等无头浏览器可以通过 127.0.0.1 / 容器 IP 访问页面资源）。
  allowedDevOrigins: ["127.0.0.1", "0.0.0.0", "localhost", "21.0.2.135", "21.0.3.20"],
  // ── Production security headers ───────────────────────────────────────────
  // Hardens the app against common web vulnerabilities. These are applied to
  // every route in production builds (dev server ignores them).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Prevent clickjacking — never allow this app to be framed.
          { key: "X-Frame-Options", value: "DENY" },
          // Block MIME-type sniffing.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Control referrer information leaked to external sites.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Restrict which features the page can use (camera/mic/geo).
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          // Content Security Policy — only allow same-origin resources, inline
          // styles (Tailwind needs them), and blob: images (for client-side
          // previews). 'unsafe-eval' is intentionally omitted.
          {
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
          },
        ],
      },
    ];
  },
};

export default nextConfig;
