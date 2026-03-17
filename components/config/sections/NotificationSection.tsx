import { useState } from 'react';
import { NotificationConfig } from '@/lib/db/repositories/config';

interface NotificationSectionProps {
  value: NotificationConfig;
  onChange: (value: NotificationConfig) => void;
}

/**
 * 切换开关组件
 */
function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></div>
    </label>
  );
}

/**
 * 通知配置区块
 */
export function NotificationSection({ value, onChange }: NotificationSectionProps) {
  const [newRecipient, setNewRecipient] = useState('');
  const [newChannel, setNewChannel] = useState('');

  const updateConfig = <K extends keyof NotificationConfig>(
    section: K,
    field: keyof NotificationConfig[K],
    fieldValue: any
  ) => {
    onChange({
      ...value,
      [section]: { ...value[section], [field]: fieldValue }
    });
  };

  const renderItemList = (
    items: string[],
    onRemove: (item: string) => void
  ) => (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200"
        >
          {item}
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="ml-1.5 h-4 w-4 rounded inline-flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );

  const addRecipient = () => {
    const trimmed = newRecipient.trim();
    if (!trimmed || value.email.recipients.includes(trimmed)) return;
    updateConfig('email', 'recipients', [...value.email.recipients, trimmed]);
    setNewRecipient('');
  };

  const removeRecipient = (email: string) => {
    updateConfig('email', 'recipients', value.email.recipients.filter(r => r !== email));
  };

  const addChannel = () => {
    const trimmed = newChannel.trim();
    if (!trimmed || value.im.channels.includes(trimmed)) return;
    updateConfig('im', 'channels', [...value.im.channels, trimmed]);
    setNewChannel('');
  };

  const removeChannel = (channel: string) => {
    updateConfig('im', 'channels', value.im.channels.filter(c => c !== channel));
  };

  return (
    <div>
      <label className="text-base font-medium text-gray-900">通知配置</label>
      <p className="text-sm text-gray-500">配置审查完成后的通知方式</p>
      
      <div className="mt-6 space-y-8">
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-900">邮件通知</h3>
            <ToggleSwitch
              checked={value.email.enabled}
              onChange={(checked) => updateConfig('email', 'enabled', checked)}
            />
          </div>

          {value.email.enabled && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">收件人</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="email"
                    value={newRecipient}
                    onChange={(e) => setNewRecipient(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
                    placeholder="请输入邮箱地址"
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={addRecipient}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    添加
                  </button>
                </div>
                {renderItemList(value.email.recipients, removeRecipient)}
              </div>

              <div className="flex items-center">
                <input
                  id="email-critical-only"
                  type="checkbox"
                  checked={value.email.criticalOnly}
                  onChange={(e) => updateConfig('email', 'criticalOnly', e.target.checked)}
                  className="h-4 w-4 text-gray-900 focus:ring-gray-900 border-gray-300 rounded"
                />
                <label htmlFor="email-critical-only" className="ml-3 text-sm text-gray-700">
                  仅发送严重问题通知
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-900">即时消息通知</h3>
            <ToggleSwitch
              checked={value.im.enabled}
              onChange={(checked) => updateConfig('im', 'enabled', checked)}
            />
          </div>

          {value.im.enabled && (
            <div className="space-y-4">
              <div>
                <label htmlFor="webhook-url" className="block text-sm font-medium text-gray-700">
                  Webhook 地址
                </label>
                <input
                  type="url"
                  id="webhook-url"
                  value={value.im.webhook || ''}
                  onChange={(e) => updateConfig('im', 'webhook', e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">通知频道</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={newChannel}
                    onChange={(e) => setNewChannel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChannel())}
                    placeholder="例如：#code-review, @username"
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={addChannel}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    添加
                  </button>
                </div>
                {renderItemList(value.im.channels, removeChannel)}
              </div>
            </div>
          )}
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-900">Git 评论通知</h3>
            <ToggleSwitch
              checked={value.gitComment.enabled}
              onChange={(checked) => updateConfig('gitComment', 'enabled', checked)}
            />
          </div>

          {value.gitComment.enabled && (
            <div className="flex items-center">
              <input
                id="git-summary-only"
                type="checkbox"
                checked={value.gitComment.summaryOnly}
                onChange={(e) => updateConfig('gitComment', 'summaryOnly', e.target.checked)}
                className="h-4 w-4 text-gray-900 focus:ring-gray-900 border-gray-300 rounded"
              />
              <label htmlFor="git-summary-only" className="ml-3 text-sm text-gray-700">
                仅发布审查摘要（不发布详细的行内评论）
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}