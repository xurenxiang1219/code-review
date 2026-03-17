'use client';

import { useState } from 'react';
import { ConfigForm } from '@/components/config/ConfigForm';
import React from 'react';
import { FullReviewConfig } from '@/lib/db/repositories/config';
import { useAuth } from '@/lib/contexts/auth-context';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { authApiClient } from '@/lib/utils/auth-api-client';
import { FormEvent } from 'react';

// 常量定义
const NOT_FOUND_CODE = 3005;
const EMPTY_REPO_ERROR = '请输入仓库名称';

// 状态配置常量
const STATUS_CONFIG = {
  enabled: {
    className: 'bg-green-100 text-green-800',
    text: '轮询启用'
  },
  disabled: {
    className: 'bg-blue-100 text-blue-800', 
    text: '手动触发'
  }
};

/**
 * 配置管理页面
 */
export default function ConfigPage() {
  const [config, setConfig] = useState<FullReviewConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repository, setRepository] = useState<string>('');
  const [existingConfigs, setExistingConfigs] = useState<FullReviewConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();

  /**
   * 验证仓库名称
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
   * 处理API调用的通用错误处理
   */
  const handleApiError = (err: unknown, context: string) => {
    const errorMessage = err instanceof Error ? err.message : `${context}失败`;
    setError(errorMessage);
    console.error(`${context}失败:`, err);
  };

  /**
   * 加载所有已配置的仓库
   */
  const loadExistingConfigs = async () => {
    try {
      setLoadingConfigs(true);
      const result = await authApiClient.get<FullReviewConfig[]>('/api/config/all');
      setExistingConfigs(result);
    } catch (err) {
      console.error('加载已配置仓库失败:', err);
    } finally {
      setLoadingConfigs(false);
    }
  };

  /**
   * 加载仓库配置
   */
  const loadConfig = async (repo: string) => {
    const validation = validateRepository(repo);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await authApiClient.get<FullReviewConfig>('/api/config', { 
        repository: validation.trimmed 
      });
      setConfig(result);
    } catch (err: any) {
      if (err.code === NOT_FOUND_CODE) {
        await createDefaultConfig(validation.trimmed);
        return;
      }
      handleApiError(err, '加载配置');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 创建默认配置
   */
  const createDefaultConfig = async (repo: string) => {
    try {
      const result = await authApiClient.post<FullReviewConfig>('/api/config', null, { 
        repository: repo 
      });
      setConfig(result);
    } catch (err) {
      handleApiError(err, '创建默认配置');
    }
  };

  /**
   * 保存配置更新
   */
  const handleSaveConfig = async (updatedConfig: Partial<FullReviewConfig>) => {
    const validation = validateRepository(repository);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    try {
      setError(null);
      const result = await authApiClient.put<FullReviewConfig>('/api/config', updatedConfig, {
        repository: validation.trimmed
      });

      setConfig(result);
      window.dispatchEvent(new CustomEvent('config-saved', {
        detail: { message: '配置保存成功' }
      }));
    } catch (err) {
      handleApiError(err, '保存配置');
    }
  };

  /**
   * 删除配置
   * @param repoName - 仓库名称
   */
  const handleDeleteConfig = async (repoName: string) => {
    const confirmMessage = `确定要删除仓库 "${repoName}" 的配置吗？此操作不可撤销。`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setError(null);
      await authApiClient.delete('/api/config', { repository: repoName });
      
      // 刷新配置列表
      await loadExistingConfigs();
      
      // 如果删除的是当前配置，清空当前状态
      if (repoName === repository) {
        setConfig(null);
        setRepository('');
      }
      
      window.dispatchEvent(new CustomEvent('config-deleted', {
        detail: { message: '配置删除成功' }
      }));
    } catch (err) {
      handleApiError(err, '删除配置');
    }
  };

  const handleRepositorySubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validation = validateRepository(repository);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }
    loadConfig(validation.trimmed);
  };

  // 组件加载时获取已配置的仓库列表
  React.useEffect(() => {
    if (isAuthenticated) {
      loadExistingConfigs();
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" text="加载中..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

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
          
          {/* 已配置仓库列表 */}
          {existingConfigs.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">已配置的仓库</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {existingConfigs.map((existingConfig) => (
                  <div
                    key={existingConfig.id}
                    className="relative p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <button
                      onClick={() => {
                        setRepository(existingConfig.repository);
                        setConfig(existingConfig);
                        setError(null);
                      }}
                      className="text-left w-full"
                    >
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {existingConfig.repository}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        更新于 {new Date(existingConfig.updatedAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          existingConfig.pollingEnabled 
                            ? STATUS_CONFIG.enabled.className
                            : STATUS_CONFIG.disabled.className
                        }`}>
                          {existingConfig.pollingEnabled ? STATUS_CONFIG.enabled.text : STATUS_CONFIG.disabled.text}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConfig(existingConfig.repository);
                      }}
                      className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="删除配置"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">或添加新仓库</h3>
              </div>
            </div>
          )}
          
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
                placeholder="owner/repo-name 或 https://github.com/owner/repo.git"
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