import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  output: "standalone",
  // La compresión gzip la hace nginx; comprimir también en Node gasta CPU en cada petición
  compress: false,
};

export default nextConfig;
