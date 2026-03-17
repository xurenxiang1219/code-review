/**
 * 统一 API 客户端
 * 
 * 提供统一的 HTTP 请求接口，处理认证、错误处理和响应格式化
 */

export interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data?: T;
  timestamp: number;
  requestId: string;
}

export interface ApiClientConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: number,
    public status: number,
    public requestId?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

class ApiClient {
  private baseURL: string;
  private timeout: number;
  private defaultHeaders: Record<string, string>;

  constructor(config: ApiClientConfig = {}) {
    this.baseURL = config.baseURL || '';
    this.timeout = config.timeout || 10000;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
  }

  /**
   * 处理请求错误
   */
  private handleRequestError(error: unknown): never {
    if (error instanceof ApiClientError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError('请求超时', -1, 408);
    }

    throw new ApiClientError(
      error instanceof Error ? error.message : '网络错误',
      -1,
      0
    );
  }

  /**
   * 发送 HTTP 请求
   */
  private async request<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseURL}${url}`, {
        ...options,
        headers: {
          ...this.defaultHeaders,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data: ApiResponse<T> = await response.json();

      if (!response.ok) {
        throw new ApiClientError(
          data.msg || '请求失败',
          data.code || -1,
          response.status,
          data.requestId
        );
      }

      if (data.code !== 0) {
        throw new ApiClientError(
          data.msg || '业务逻辑错误',
          data.code,
          response.status,
          data.requestId
        );
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      this.handleRequestError(error);
    }
  }

  /**
   * 构建请求体
   */
  private buildRequestBody(data?: any): string | undefined {
    return data ? JSON.stringify(data) : undefined;
  }

  /**
   * GET 请求
   */
  async get<T>(url: string, params?: Record<string, any>): Promise<T> {
    const searchParams = params ? new URLSearchParams(params).toString() : '';
    const fullUrl = searchParams ? `${url}?${searchParams}` : url;
    
    const response = await this.request<T>(fullUrl, { method: 'GET' });
    return response.data ?? ({} as T);
  }

  /**
   * POST 请求
   */
  async post<T>(url: string, data?: any): Promise<T> {
    const response = await this.request<T>(url, {
      method: 'POST',
      body: this.buildRequestBody(data),
    });
    return response.data ?? ({} as T);
  }

  /**
   * PUT 请求
   */
  async put<T>(url: string, data?: any): Promise<T> {
    const response = await this.request<T>(url, {
      method: 'PUT',
      body: this.buildRequestBody(data),
    });
    return response.data ?? ({} as T);
  }

  /**
   * DELETE 请求
   */
  async delete<T>(url: string): Promise<T> {
    const response = await this.request<T>(url, { method: 'DELETE' });
    return response.data ?? ({} as T);
  }

  /**
   * 设置认证 token
   */
  setAuthToken(token: string): void {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  /**
   * 设置 API Key
   */
  setApiKey(apiKey: string): void {
    this.defaultHeaders['X-API-Key'] = apiKey;
  }

  /**
   * 清除认证信息
   */
  clearAuth(): void {
    delete this.defaultHeaders['Authorization'];
    delete this.defaultHeaders['X-API-Key'];
  }
}

// 创建默认实例
export const apiClient = new ApiClient();

// 导出类型和错误类
export { ApiClient };