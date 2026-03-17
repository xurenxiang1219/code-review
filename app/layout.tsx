import type { Metadata, Viewport } from 'next';
import { Navigation } from '@/components/layout/Navigation';
import './globals.css';

export const metadata: Metadata = {
  title: '代码审查系统',
  description: '自动化代码质量检查工具',
  keywords: ['代码审查', '自动化', '质量保障', 'Code Review'],
  authors: [{ name: 'Code Review System' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * 根布局组件
 * 
 * 提供应用的基础布局结构，包括：
 * - HTML 文档结构
 * - 全局样式
 * - 导航栏
 * - 响应式容器
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-gray-50 min-h-screen">
        {/* 导航栏 */}
        <Navigation />
        
        {/* 主内容区域 */}
        <main className="flex-1">
          {children}
        </main>
        
        {/* 页脚 */}
        <footer className="bg-white border-t border-gray-200 py-6 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center text-sm text-gray-400">
              <p>&copy; 2024 代码审查系统</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
