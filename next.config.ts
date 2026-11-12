import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Для Docker/VPS собираем автономный сервер (см. Dockerfile). На Vercel не нужно.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  typescript: {
    // Сборка не падает из-за типов; проверка типов — отдельной командой `npm run typecheck`.
    ignoreBuildErrors: true,
  },
  async headers() {
    // Технические адреса хостинга (…twc1.net, …vercel.app) не закрываем от поиска заголовком:
    // на всех страницах стоит canonical на https://kamui-collection.ru — поисковики склеят копии сами.
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    // www.kamui-collection.ru → kamui-collection.ru, чтобы у поисковиков был один адрес сайта
    return [
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: "www.kamui-collection.ru" }],
        destination: "https://kamui-collection.ru/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
