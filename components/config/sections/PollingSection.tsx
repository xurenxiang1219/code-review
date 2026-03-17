interface PollingSectionProps {
  enabled: boolean;
  interval: number;
  onEnabledChange: (enabled: boolean) => void;
  onIntervalChange: (interval: number) => void;
  error?: string;
}

/**
 * 轮询配置区块
 */
export function PollingSection({ 
  enabled, 
  interval, 
  onEnabledChange, 
  onIntervalChange, 
  error 
}: PollingSectionProps) {
  const intervalOptions = [
    { value: 30, label: '30 秒' },
    { value: 60, label: '1 分钟' },
    { value: 300, label: '5 分钟' },
    { value: 600, label: '10 分钟' },
    { value: 1800, label: '30 分钟' },
    { value: 3600, label: '1 小时' },
  ];

  return (
    <div>
      <label className="text-base font-medium text-gray-900">轮询配置</label>
      <p className="text-sm text-gray-500">
        在无法使用 Webhook 的环境中，可以启用轮询模式主动检查新提交
      </p>
      
      <div className="mt-4 space-y-4">
        <div className="flex items-center">
          <input
            id="polling-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="h-4 w-4 text-gray-900 focus:ring-gray-900 border-gray-300 rounded"
          />
          <label htmlFor="polling-enabled" className="ml-3 text-sm font-medium text-gray-700">
            启用轮询扫描
          </label>
        </div>

        {enabled && (
          <div>
            <label htmlFor="polling-interval" className="block text-sm font-medium text-gray-700">
              轮询间隔
            </label>
            <select
              id="polling-interval"
              value={interval}
              onChange={(e) => onIntervalChange(parseInt(e.target.value))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm max-w-xs"
            >
              {intervalOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              建议根据团队提交频率选择合适的间隔时间
            </p>
            {error && (
              <p className="mt-1 text-sm text-red-600">{error}</p>
            )}
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded p-3">
          <p className="text-sm text-gray-600 leading-relaxed">
            轮询模式定期检查 Git 仓库新提交，适用于无法配置 Webhook 的环境。可与 Webhook 同时启用，系统自动去重。注意合理设置间隔以避免服务器负载过高。
          </p>
        </div>
      </div>
    </div>
  );
}