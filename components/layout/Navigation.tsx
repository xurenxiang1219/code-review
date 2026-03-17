'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { UserMenu } from './UserMenu';
import { useAuth } from '@/lib/contexts/auth-context';

/**
 * 导航项配置
 */
interface NavItem {
  name: string;
  href: string;
  description?: string;
}

/**
 * 导航项列表
 */
const navItems: NavItem[] = [
  {
    name: '概览',
    href: '/',
    description: '系统概览',
  },
  {
    name: '审查记录',
    href: '/dashboard',
    description: '查看审查历史',
  },
  {
    name: '配置',
    href: '/config',
    description: '系统配置',
  },
  {
    name: '监控',
    href: '/monitoring',
    description: '系统监控',
  },
];

/**
 * 导航栏组件
 * 
 * 提供应用的主导航功能，包括：
 * - 品牌标识
 * - 主要页面导航
 * - 用户菜单
 * - 响应式设计
 * - 当前页面高亮
 */
export const Navigation: React.FC = () => {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  // 如果在登录页面，不显示导航栏
  if (pathname === '/login') {
    return null;
  }

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link 
              href="/" 
              className="flex items-center space-x-2 text-xl font-semibold text-gray-900 hover:text-gray-600 transition-colors"
            >
              <div className="w-8 h-8 bg-gray-900 rounded flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <span>CodeReview</span>
            </Link>
          </div>

          {/* 桌面端导航 */}
          <div className="hidden md:flex items-center space-x-8">
            {isAuthenticated && navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-3 py-2 text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'text-gray-900 border-b-2 border-gray-900'
                    : 'text-gray-500 hover:text-gray-900'
                )}
                title={item.description}
              >
                {item.name}
              </Link>
            ))}
            
            {/* 健康检查链接 */}
            {isAuthenticated && (
              <a
                href="/api/health"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                title="查看系统健康状态"
              >
                健康检查
              </a>
            )}
          </div>

          {/* 右侧用户菜单或加载状态 */}
          <div className="flex items-center">
            {isLoading ? (
              <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
            ) : isAuthenticated ? (
              <UserMenu />
            ) : null}

            {/* 移动端菜单按钮 */}
            {isAuthenticated && (
              <div className="md:hidden ml-4">
                <button
                  type="button"
                  className="text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 p-2 rounded"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-expanded={mobileMenuOpen}
                  aria-label="切换导航菜单"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {mobileMenuOpen ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    )}
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 移动端菜单 */}
        {mobileMenuOpen && isAuthenticated && (
          <div className="md:hidden border-t border-gray-200 py-2">
            <div className="space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'block px-3 py-2 rounded-md text-base font-medium transition-colors',
                    isActive(item.href)
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <div>{item.name}</div>
                  {item.description && (
                    <div className="text-xs text-gray-500 mt-1">
                      {item.description}
                    </div>
                  )}
                </Link>
              ))}
              
              <a
                href="/api/health"
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                <div>健康检查</div>
                <div className="text-xs text-gray-500 mt-1">
                  系统状态
                </div>
              </a>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;