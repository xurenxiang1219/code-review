'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { JWTUtils } from '@/lib/utils/auth';
import type { AuthUser } from '@/types/auth';

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * 公开访问的路径（不需要认证）
 */
const PUBLIC_PATHS = ['/login'];

/**
 * 认证提供者组件
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  /**
   * 验证并设置用户信息
   */
  const validateAndSetUser = (token: string): boolean => {
    try {
      // 简单的JWT解析验证（客户端验证）
      const parts = token.split('.');
      if (parts.length !== 3) {
        console.error('Token 格式无效');
        return false;
      }

      const payload = JSON.parse(atob(parts[1]));
      const now = Math.floor(Date.now() / 1000);
      
      // 检查token是否过期
      if (payload.exp && payload.exp < now) {
        console.error('Token 已过期');
        return false;
      }

      // 构造用户信息
      const user: AuthUser = {
        id: payload.sub || payload.userId || 'unknown',
        email: payload.email || 'unknown@example.com',
        role: payload.role || 'viewer',
        permissions: payload.permissions || [],
        authMethod: 'jwt',
      };

      setUser(user);
      return true;
    } catch (error) {
      console.error('Token 验证异常:', error);
      return false;
    }
  };

  /**
   * 登录函数
   */
  const login = (token: string) => {
    localStorage.setItem('auth_token', token);
    if (validateAndSetUser(token)) {
      // 登录成功后跳转到首页
      router.push('/');
    }
  };

  /**
   * 登出函数
   */
  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
    router.push('/login');
  };

  /**
   * 检查认证状态
   */
  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        setUser(null);
        setIsLoading(false);
        
        // 如果不是公开路径，跳转到登录页
        if (!PUBLIC_PATHS.includes(pathname)) {
          router.push('/login');
        }
        return;
      }

      // 验证token
      if (validateAndSetUser(token)) {
        setIsLoading(false);
        
        // 如果已登录且在登录页，跳转到首页
        if (pathname === '/login') {
          router.push('/');
        }
      } else {
        // Token无效，清除并跳转到登录页
        localStorage.removeItem('auth_token');
        setUser(null);
        setIsLoading(false);
        
        if (!PUBLIC_PATHS.includes(pathname)) {
          router.push('/login');
        }
      }
    };

    checkAuth();
  }, [pathname, router]);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * 使用认证上下文的Hook
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用');
  }
  return context;
}