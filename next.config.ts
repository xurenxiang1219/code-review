import type { NextConfig } from "next";

// 确保环境变量正确加载
require('dotenv').config();

const nextConfig: NextConfig = {
  // 启用 standalone 输出模式，用于 Docker 部署
  output: 'standalone',
  
  // 禁用 X-Powered-By 头
  poweredByHeader: false,
  
  // 压缩
  compress: true,
  
  // 严格模式
  reactStrictMode: true,
  
  // 环境变量
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  },
};

export default nextConfig;
