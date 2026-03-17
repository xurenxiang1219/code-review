/**
 * 认证版本的 API 客户端
 * 
 * 自动处理认证头和错误处理的 API 客户端
 */

import { apiClient, ApiClientError } from './api-client';

// 常量定义
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;
const METHODS_WITH_PARAMS = ['POST', 'PUT', 'DELETE'];
const AUTH_TOKEN_KEY = 'auth_token';
const LOGIN_PATH = '/login';

type HttpMethod = typeof HTTP_METHODS[number];

/**
 * 认证 API 客户端类
 */
class AuthApiClient {
  /**
   * 处理认证失败
   */
  private handleAuthFailure(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    
    // 避免在登录页面重复跳转
    if (window.location.pathname !== LOGIN_PATH) {
      window.location.href = LOGIN_PATH;
    }
  }

  /**
   * 构建带参数的URL
   */
  private buildUrlWithParams(url: string, params: Record<string, any>): string {
    const searchParams = new URLSearchParams(params).toString();
    return `${url}?${searchParams}`;
  }

  /**
   * 发送认证请求
   */
  private async request<T>(
    method: HttpMethod,
    url: string,
    data?: any,
    params?: Record<string, any>
  ): Promise<T> {
    try {
      // 设置认证头
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token) {
        apiClient.setAuthToken(token);
      }

      // 处理需要参数的请求
      if (METHODS_WITH_PARAMS.includes(method) && params) {
        url = this.buildUrlWithParams(url, params);
      }

      switch (method) {
        case 'GET':
          return await apiClient.get<T>(url, params);
        case 'POST':
          return await apiClient.post<T>(url, data);
        case 'PUT':
          return await apiClient.put<T>(url, data);
        case 'DELETE':
          return await apiClient.delete<T>(url);
        default:
          throw new Error(`不支持的请求方法: ${method}`);
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        this.handleAuthFailure();
        throw new Error('认证失败，请重新登录');
      }
      throw error;
    }
  }

  /**
   * GET 请求
   */
  async get<T>(url: string, params?: Record<string, any>): Promise<T> {
    return this.request<T>('GET', url, undefined, params);
  }

  /**
   * POST 请求
   */
  async post<T>(url: string, data?: any, params?: Record<string, any>): Promise<T> {
    return this.request<T>('POST', url, data, params);
  }

  /**
   * PUT 请求
   */
  async put<T>(url: string, data?: any, params?: Record<string, any>): Promise<T> {
    return this.request<T>('PUT', url, data, params);
  }

  /**
   * DELETE 请求
   */
  async delete<T>(url: string, params?: Record<string, any>): Promise<T> {
    return this.request<T>('DELETE', url, undefined, params);
  }
}

// 创建认证 API 客户端实例
export const authApiClient = new AuthApiClient();