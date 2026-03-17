'use client';

import { useState, useEffect } from 'react';
import { ConfigForm } from '@/components/config/ConfigForm';
import { FullReviewConfig } from '@/lib/db/repositories/config';

// 常量定义
const NOT_FOUND_CODE = 3005;
const EMPTY_REPO_ERROR = '请输入仓库名称';

/**
 * 验证仓库名称
 * @param repo - 仓库名称
 * @returns 验证结果和错误消息
 */
const validateRepository = (repo: string) => {
  const trimmed = repo.trim();
  return {
    isValid: Boolean(trimmed),
    trimmed,
    error: trimmed ? null : EMPTY_REPO_ERROR
  };
};

/**
 * 配置管理页面
 * 
 * 功能：
 * - 显示当前配置
 * - 编辑和保存配置
 * - 处理加载状态和错误
 * - 响应式设计
 */
export default function ConfigPage() {
  const [config, setConfig] = useState<FullReviewConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repository, setRepository] = useState<string>('');

  /**
   * 处理API调用的通用错误处理
   * @param err - 错误对象
   * @param context - 操作上下文描述
   * @param repo - 仓库名称
   */
  const handleApiError = (err: unknown, context: string, repo: string) => {
    const errorMessage = err instanceof Error ? err.message : `${context}失败`;
    setError(errorMessage);
    console.error(`Failed to ${context}`, { repository: repo, error: errorMessage });
  };

  /**
   * 构建API URL
   * @param repo - 仓库名称
   * @returns 完整的API URL
   */
  const buildApiUrl = (repo: string) => `/api/config/init?repository=${encodeURIComponent(repo)}`;
  /**
   * 加载仓库配置
   * @param repo - 仓库名称
   */
  const loadConfig = async (repo: string) => {
    const validation = validateRepository(repo);
    if (!validation.isValid) {
      setError(validation.error);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(buildApiUrl(validation.trimmed));
      const result = await response.json();

      if (!response.ok) {
        if (result.code === NOT_FOUND_CODE) {
          await createDefaultConfig(validation.trimmed);
          return;
        }
        throw new Error(result.msg || '加载配置失败');
      }

      setConfig(result.data);
    } catch (err) {
      handleApiError(err, 'load config', validation.trimmed);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 创建默认配置
   * @param repo - 仓库名称
   */
  const createDefaultConfig = async (repo: string) => {
    try {
      const response = await fetch(buildApiUrl(repo), {
        method: 'POST',
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.msg || '创建默认配置失败');
      }

      setConfig(result.data);
    } catch (err) {
      handleApiError(err, 'create default config', repo);
    }
  };
  /**
   * 保存配置更新
   * @param updatedConfig - 更新的配置数据
   */
  const handleSaveConfig = async (updatedConfig: Partial<FullReviewConfig>) => {
    const validation = validateRepository(repository);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    try {
      setError(null);

      const response = await fetch(buildApiUrl(validation.trimmed), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedConfig),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.msg || '保存配置失败');
      }

      setConfig(result.data);

      // 触发配置保存成功事件
      const successEvent = new CustomEvent('config-saved', {
        detail: { message: '配置保存成功' }
      });
      window.dispatchEvent(successEvent);

    } catch (err) {
      handleApiError(err, 'save config', validation.trimmed);
    }
  };

  /**
   * 处理仓库表单提交
   * @param e - 表单提交事件
   */
  const handleRepositorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateRepository(repository);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }
    loadConfig(validation.trimmed);
  };
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">系统配置</h1>
          <p className="mt-2 text-gray-500">
            配置审查规则、模型参数和通知设置
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">选择仓库</h2>
          <form onSubmit={handleRepositorySubmit} className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="repository" className="sr-only">
                仓库名称
              </label>
              <input
                type="text"
                id="repository"
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
                placeholder="owner/repo-name"
                className="block w-full rounded border-gray-300 shadow-sm text-sm focus:border-gray-900 focus:ring-gray-900"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !repository.trim()}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded shadow-sm text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '加载中...' : '加载配置'}
            </button>
          </form>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {loading && repository && (
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <span className="ml-3 text-gray-500">加载配置中...</span>
            </div>
          </div>
        )}

        {config && !loading && (
          <ConfigForm
            config={config}
            onSave={handleSaveConfig}
            repository={repository}
          />
        )}
        {!config && !loading && !error && repository && (
          <div className="bg-white shadow rounded-lg p-6">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">暂无配置</h3>
              <p className="mt-1 text-sm text-gray-500">
                该仓库还没有配置，点击"加载配置"创建默认配置
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}