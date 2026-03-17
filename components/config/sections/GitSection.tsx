'use client';

import React from 'react';
import { GitConfig } from '@/lib/db/repositories/config';

interface GitSectionProps {
  value: GitConfig;
  onChange: (value: GitConfig) => void;
}

// 常量定义
const INPUT_CLASS = "block w-full rounded border-gray-300 shadow-sm text-sm focus:border-gray-900 focus:ring-gray-900";
const HELP_TEXT_CLASS = "mt-1 text-xs text-gray-500";
const BUTTON_CLASS = "inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900";

const DEFAULT_CONFIG: GitConfig = {
  baseUrl: 'https://api.github.com',
  timeout: 30000,
  defaultBranch: 'main',
  watchedBranches: ['main', 'develop'],
};

const QUICK_CONFIGS = {
  github: {
    ...DEFAULT_CONFIG,
    baseUrl: 'https://api.github.com',
  },
  gitlab: {
    ...DEFAULT_CONFIG,
    baseUrl: 'https://gitlab.com/api/v4',
  },
};

/**
 * Git 仓库配置组件
 */
export function GitSection({ value, onChange }: GitSectionProps) {
  const safeValue: GitConfig = {
    ...DEFAULT_CONFIG,
    ...value,
  };

  const handleInputChange = (field: keyof GitConfig, newValue: any) => {
    onChange({
      ...safeValue,
      [field]: newValue,
    });
  };

  const handleBranchEdit = (index: number, newValue: string) => {
    const currentBranches = [...(safeValue.watchedBranches ?? [])];
    currentBranches[index] = newValue;
    handleInputChange('watchedBranches', currentBranches);
  };

  const handleBranchAdd = (branch: string) => {
    const trimmedBranch = branch.trim();
    const currentBranches = safeValue.watchedBranches ?? [];
    
    if (trimmedBranch && !currentBranches.includes(trimmedBranch)) {
      handleInputChange('watchedBranches', [...currentBranches, trimmedBranch]);
    }
  };

  const handleBranchRemove = (branch: string) => {
    const currentBranches = safeValue.watchedBranches ?? [];
    handleInputChange('watchedBranches', currentBranches.filter(b => b !== branch));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Git 仓库配置</h3>
        <p className="text-sm text-gray-500 mb-6">
          配置 Git 仓库的访问凭据和监控分支
        </p>
      </div>

      {/* Git API 基础URL */}
      <div>
        <label htmlFor="git-base-url" className="block text-sm font-medium text-gray-700 mb-2">
          Git API 基础URL
        </label>
        <input
          type="url"
          id="git-base-url"
          value={safeValue.baseUrl ?? ''}
          onChange={(e) => handleInputChange('baseUrl', e.target.value)}
          placeholder="https://api.github.com"
          className={INPUT_CLASS}
        />
        <p className={HELP_TEXT_CLASS}>
          GitHub: https://api.github.com, GitLab: https://gitlab.com/api/v4
        </p>
      </div>

      {/* 访问令牌 */}
      <div>
        <label htmlFor="git-access-token" className="block text-sm font-medium text-gray-700 mb-2">
          访问令牌
        </label>
        <input
          type="password"
          id="git-access-token"
          value={safeValue.accessToken ?? ''}
          onChange={(e) => handleInputChange('accessToken', e.target.value)}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          className={INPUT_CLASS}
        />
        <p className={HELP_TEXT_CLASS}>
          用于访问 Git API 的个人访问令牌或应用令牌
        </p>
      </div>

      {/* 默认分支 */}
      <div>
        <label htmlFor="git-default-branch" className="block text-sm font-medium text-gray-700 mb-2">
          默认分支
        </label>
        <input
          type="text"
          id="git-default-branch"
          value={safeValue.defaultBranch}
          onChange={(e) => handleInputChange('defaultBranch', e.target.value)}
          placeholder="main"
          className={INPUT_CLASS}
        />
        <p className={HELP_TEXT_CLASS}>
          仓库的主要分支名称
        </p>
      </div>

      {/* 监控分支 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          监控分支
        </label>
        <div className="space-y-2">
          {(safeValue.watchedBranches ?? []).map((branch, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={branch}
                onChange={(e) => handleBranchEdit(index, e.target.value)}
                className="flex-1 rounded border-gray-300 shadow-sm text-sm focus:border-gray-900 focus:ring-gray-900"
              />
              <button
                type="button"
                onClick={() => handleBranchRemove(branch)}
                className="p-2 text-red-600 hover:text-red-800 transition-colors"
                title="删除分支"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => handleBranchAdd('feature/new-branch')}
            className={BUTTON_CLASS}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            添加分支
          </button>
        </div>
        <p className={HELP_TEXT_CLASS}>
          系统将监控这些分支的代码变更
        </p>
      </div>

      {/* Webhook 密钥 */}
      <div>
        <label htmlFor="git-webhook-secret" className="block text-sm font-medium text-gray-700 mb-2">
          Webhook 密钥
        </label>
        <input
          type="password"
          id="git-webhook-secret"
          value={safeValue.webhookSecret ?? ''}
          onChange={(e) => handleInputChange('webhookSecret', e.target.value)}
          placeholder="webhook-secret-key"
          className={INPUT_CLASS}
        />
        <p className={HELP_TEXT_CLASS}>
          用于验证 Webhook 请求的密钥（可选）
        </p>
      </div>

      {/* 超时时间 */}
      <div>
        <label htmlFor="git-timeout" className="block text-sm font-medium text-gray-700 mb-2">
          超时时间（毫秒）
        </label>
        <input
          type="number"
          id="git-timeout"
          min="5000"
          max="120000"
          step="1000"
          value={safeValue.timeout ?? 30000}
          onChange={(e) => handleInputChange('timeout', parseInt(e.target.value))}
          className={INPUT_CLASS}
        />
        <p className={HELP_TEXT_CLASS}>
          Git API 请求的超时时间，建议 30000-60000 毫秒
        </p>
      </div>

      {/* 快速配置模板 */}
      <div className="border-t border-gray-200 pt-6">
        <h4 className="text-sm font-medium text-gray-900 mb-3">快速配置</h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChange({ ...safeValue, ...QUICK_CONFIGS.github })}
            className={BUTTON_CLASS}
          >
            GitHub 配置
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...safeValue, ...QUICK_CONFIGS.gitlab })}
            className={BUTTON_CLASS}
          >
            GitLab 配置
          </button>
        </div>
      </div>
    </div>
  );
}