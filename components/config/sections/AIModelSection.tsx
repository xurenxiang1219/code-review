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

  const updateField = (field: keyof AIModelConfig, fieldValue: any) => {
    onChange({ ...value, [field]: fieldValue });
  };

  const selectedProvider = providers.find(p => p.id === value.provider);

  return (
    <div>
      <label className="text-base font-semibold text-gray-900">模型配置</label>
      <p className="text-sm text-gray-500">配置代码审查模型参数</p>
      
      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* 提供商选择 */}
        <div>
          <label htmlFor="provider" className="block text-sm font-medium text-gray-700">
            提供商 *
          </label>
          <select
            id="provider"
            value={value.provider}
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
              value={value.model}
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
              value={value.model}
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
            value={value.temperature}
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
            value={value.maxTokens}
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
            value={value.apiKey || ''}
            onChange={(e) => updateField('apiKey', e.target.value)}
            placeholder="API 密钥"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm focus:border-gray-900 focus:ring-gray-900"
          />
          <p className="mt-1 text-xs text-gray-400">
            留空使用环境变量配置
          </p>
        </div>

        {/* 自定义 API 地址 */}
        {(value.provider === 'custom' || value.provider === 'azure') && (
          <div className="sm:col-span-2">
            <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-700">
              API 地址
            </label>
            <input
              type="url"
              id="baseUrl"
              value={value.baseUrl || ''}
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