'use client';

import { useState } from 'react';
import { FullReviewConfig } from '@/lib/db/repositories/config';
import { ReviewFocusSection } from './sections/ReviewFocusSection';
import { FileFilterSection } from './sections/FileFilterSection';
import { AIModelSection } from './sections/AIModelSection';
import { PollingSection } from './sections/PollingSection';
import { NotificationSection } from './sections/NotificationSection';
import { GitSection } from './sections/GitSection';

interface ConfigFormProps {
  config: FullReviewConfig;
  onSave: (config: Partial<FullReviewConfig>) => Promise<void>;
  repository: string;
}

/**
 * 配置表单组件
 * 
 * 功能：
 * - 编辑审查配置
 * - 表单验证
 * - 保存配置
 * - 响应式设计
 */
export function ConfigForm({ config, onSave, repository }: ConfigFormProps) {
  // 确保 config 对象存在，避免空值错误
  const safeConfig = config ?? {
    id: '',
    repository: '',
    reviewFocus: ['security', 'performance', 'readability'],
    fileWhitelist: ['*.ts', '*.tsx', '*.js', '*.jsx'],
    ignorePatterns: ['node_modules/**', 'dist/**'],
    aiModel: {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 4000
    },
    pollingEnabled: false,
    pollingInterval: 300,
    notificationConfig: {
      email: { enabled: false, recipients: [], criticalOnly: true },
      im: { enabled: false, channels: [], webhook: '' },
      gitComment: { enabled: true, summaryOnly: false }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const [formData, setFormData] = useState(safeConfig);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateFormData = (key: keyof FullReviewConfig, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    const safeFormData = formData ?? safeConfig;

    // 验证文件白名单
    if (!safeFormData.fileWhitelist?.length) {
      newErrors.fileWhitelist = '文件白名单不能为空';
    }

    // 验证轮询间隔
    if (safeFormData.pollingEnabled && 
        (safeFormData.pollingInterval < 30 || safeFormData.pollingInterval > 3600)) {
      newErrors.pollingInterval = '轮询间隔必须在 30-3600 秒之间';
    }

    // 验证AI模型配置
    const aiModel = safeFormData.aiModel ?? {};
    if (!aiModel.provider) {
      newErrors['aiModel.provider'] = '模型提供商不能为空';
    }
    if (!aiModel.model) {
      newErrors['aiModel.model'] = '模型名称不能为空';
    }
    
    const temperature = aiModel.temperature ?? 0;
    if (temperature < 0 || temperature > 2) {
      newErrors['aiModel.temperature'] = '温度必须在 0-2 之间';
    }
    
    const maxTokens = aiModel.maxTokens ?? 0;
    if (maxTokens < 100 || maxTokens > 8000) {
      newErrors['aiModel.maxTokens'] = '最大 token 数必须在 100-8000 之间';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      await onSave(formData);
    } catch (error) {
      console.error('保存配置失败:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-900">
          {repository}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          配置审查规则和参数
        </p>
      </div>
      
      <form className="p-6 space-y-6" onSubmit={handleSubmit}>
        <ReviewFocusSection 
          value={formData?.reviewFocus ?? []}
          onChange={(value) => updateFormData('reviewFocus', value)}
          error={errors.reviewFocus}
        />

        <FileFilterSection
          whitelist={formData?.fileWhitelist ?? []}
          ignorePatterns={formData?.ignorePatterns ?? []}
          onWhitelistChange={(value) => updateFormData('fileWhitelist', value)}
          onIgnorePatternsChange={(value) => updateFormData('ignorePatterns', value)}
          errors={errors}
        />

        <AIModelSection
          value={formData?.aiModel ?? safeConfig.aiModel}
          onChange={(value) => updateFormData('aiModel', value)}
          errors={errors}
        />

        <GitSection
          value={formData?.git ?? { defaultBranch: 'main', watchedBranches: ['main'] }}
          onChange={(value) => updateFormData('git', value)}
        />

        <PollingSection
          enabled={formData?.pollingEnabled ?? false}
          interval={formData?.pollingInterval ?? 300}
          onEnabledChange={(value) => updateFormData('pollingEnabled', value)}
          onIntervalChange={(value) => updateFormData('pollingInterval', value)}
          error={errors.pollingInterval}
        />

        <NotificationSection
          value={formData?.notificationConfig ?? safeConfig.notificationConfig}
          onChange={(value) => updateFormData('notificationConfig', value)}
        />

        <div className="flex justify-end pt-6 border-t border-gray-200">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded shadow-sm text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </form>
    </div>
  );
}