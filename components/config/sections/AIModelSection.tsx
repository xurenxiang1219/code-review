import { AIModelConfig } from '@/lib/db/repositories/config';

interface AIModelSectionProps {
  value: AIModelConfig;
  onChange: (value: AIModelConfig) => void;
  errors: Record<string, string>;
}

/**
 * AI 模型配置区块
 */
export function AIModelSection({ value, onChange, errors }: AIModelSectionProps) {
  const providers = [
    { id: 'openai', name: 'OpenAI', models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
    { id: 'anthropic', name: 'Anthropic', models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'] },
    { id: 'azure', name: 'Azure OpenAI', models: ['gpt-4', 'gpt-35-turbo'] },
    { id: 'custom', name: '自定义', models: [] },
  ];

  // 预设模板配置
  const modelTemplates = [
    {
      name: 'OpenAI GPT-4 (推荐)',
      config: { provider: 'openai', model: 'gpt-4', temperature: 0.3, maxTokens: 4000 }
    },
    {
      name: 'OpenAI GPT-4 Turbo (快速)',
      config: { provider: 'openai', model: 'gpt-4-turbo', temperature: 0.2, maxTokens: 4000 }
    },
    {
      name: 'Claude 3 Sonnet (平衡)',
      config: { provider: 'anthropic', model: 'claude-3-sonnet', temperature: 0.3, maxTokens: 4000 }
    },
    {
      name: 'Claude 3 Opus (高质量)',
      config: { provider: 'anthropic', model: 'claude-3-opus', temperature: 0.2, maxTokens: 4000 }
    }
  ];

  // 确保 value 对象存在，避免空值错误
  const safeValue = value ?? {
    provider: '',
    model: '',
    temperature: 0.3,
    maxTokens: 4000
  };

  const updateField = (field: keyof AIModelConfig, fieldValue: any) => {
    onChange({ ...safeValue, [field]: fieldValue });
  };

  const applyTemplate = (template: typeof modelTemplates[0]) => {
    onChange({ ...safeValue, ...template.config });
  };

  const selectedProvider = providers.find(p => p.id === safeValue.provider);
  const showCustomUrl = safeValue.provider === 'custom' || safeValue.provider === 'azure';

  return (
    <div>
      <label className="text-base font-semibold text-gray-900">模型配置</label>
      <p className="text-sm text-gray-500">配置代码审查模型参数</p>
      
      {/* 模板快捷选择 */}
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-900 mb-3">快速配置模板</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {modelTemplates.map((template) => (
            <button
              key={template.name}
              type="button"
              onClick={() => applyTemplate(template)}
              className="text-left p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-white transition-colors"
            >
              <div className="text-sm font-medium text-gray-900">{template.name}</div>
              <div className="text-xs text-gray-500 mt-1">
                {template.config.provider} • {template.config.model} • 温度 {template.config.temperature}
              </div>
            </button>
          ))}
        </div>
      </div>
      
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* 提供商选择 */}
        <div>
          <label htmlFor="provider" className="block text-sm font-medium text-gray-700">
            提供商 *
          </label>
          <select
            id="provider"
            value={safeValue.provider}
            onChange={(e) => updateField('provider', e.target.value)}
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm focus:border-gray-900 focus:ring-gray-900"
          >
            <option value="">请选择提供商</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
          {errors['aiModel.provider'] && (
            <p className="mt-1 text-sm text-red-600">{errors['aiModel.provider']}</p>
          )}
        </div>

        {/* 模型选择 */}
        <div>
          <label htmlFor="model" className="block text-sm font-medium text-gray-700">
            模型 *
          </label>
          {selectedProvider && selectedProvider.models.length > 0 ? (
            <select
              id="model"
              value={safeValue.model}
              onChange={(e) => updateField('model', e.target.value)}
              className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm focus:border-gray-900 focus:ring-gray-900"
            >
              <option value="">请选择模型</option>
              {selectedProvider.models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              id="model"
              value={safeValue.model}
              onChange={(e) => updateField('model', e.target.value)}
              placeholder="模型名称"
              className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm focus:border-gray-900 focus:ring-gray-900"
            />
          )}
          {errors['aiModel.model'] && (
            <p className="mt-1 text-sm text-red-600">{errors['aiModel.model']}</p>
          )}
        </div>

        {/* 温度设置 */}
        <div>
          <label htmlFor="temperature" className="block text-sm font-medium text-gray-700">
            温度 (0-2)
          </label>
          <input
            type="number"
            id="temperature"
            min="0"
            max="2"
            step="0.1"
            value={safeValue.temperature}
            onChange={(e) => updateField('temperature', parseFloat(e.target.value))}
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm focus:border-gray-900 focus:ring-gray-900"
          />
          <p className="mt-1 text-xs text-gray-400">
            控制输出的随机性，0 最确定，2 最随机
          </p>
          {errors['aiModel.temperature'] && (
            <p className="mt-1 text-sm text-red-600">{errors['aiModel.temperature']}</p>
          )}
        </div>

        {/* 最大 Token 数 */}
        <div>
          <label htmlFor="maxTokens" className="block text-sm font-medium text-gray-700">
            最大 Token 数 (100-8000)
          </label>
          <input
            type="number"
            id="maxTokens"
            min="100"
            max="8000"
            value={safeValue.maxTokens}
            onChange={(e) => updateField('maxTokens', parseInt(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
          {errors['aiModel.maxTokens'] && (
            <p className="mt-1 text-sm text-red-600">{errors['aiModel.maxTokens']}</p>
          )}
        </div>

        {/* API 密钥 */}
        <div className="sm:col-span-2">
          <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700">
            API 密钥
          </label>
          <input
            type="password"
            id="apiKey"
            value={safeValue.apiKey ?? ''}
            onChange={(e) => updateField('apiKey', e.target.value)}
            placeholder="API 密钥"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm focus:border-gray-900 focus:ring-gray-900"
          />
          <p className="mt-1 text-xs text-gray-400">
            留空使用环境变量配置
          </p>
        </div>

        {/* 自定义 API 地址 */}
        {showCustomUrl && (
          <div className="sm:col-span-2">
            <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-700">
              API 地址
            </label>
            <input
              type="url"
              id="baseUrl"
              value={safeValue.baseUrl ?? ''}
              onChange={(e) => updateField('baseUrl', e.target.value)}
              placeholder="https://api.example.com/v1"
              className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm focus:border-gray-900 focus:ring-gray-900"
            />
          </div>
        )}
      </div>
    </div>
  );
}