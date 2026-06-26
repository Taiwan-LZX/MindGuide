import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // 允许开发服务器从本地 IP / 回环地址访问（消除 Next 16 的
  // "Cross origin request detected" 开发期警告，同时让 agent-browser
  // 等无头浏览器可以通过 127.0.0.1 / 容器 IP 访问页面资源）。
  allowedDevOrigins: ["127.0.0.1", "0.0.0.0", "localhost", "21.0.2.135", "21.0.3.20"],
};

export default nextConfig;
