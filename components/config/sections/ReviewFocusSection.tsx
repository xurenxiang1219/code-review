interface ReviewFocusSectionProps {
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
}

/**
 * 审查关注点配置区块
 */
export function ReviewFocusSection({ value, onChange, error }: ReviewFocusSectionProps) {
  const availableFocus = [
    { id: 'security', label: '安全性', description: '检查安全漏洞和风险' },
    { id: 'performance', label: '性能', description: '检查性能问题和优化建议' },
    { id: 'readability', label: '可读性', description: '检查代码可读性和风格' },
    { id: 'maintainability', label: '可维护性', description: '检查代码结构和设计' },
    { id: 'testing', label: '测试', description: '检查测试覆盖率和质量' },
    { id: 'documentation', label: '文档', description: '检查注释和文档完整性' },
  ];

  // 确保 value 始终为数组，避免空值错误
  const safeValue = value || [];

  const handleToggle = (focusId: string) => {
    const newValue = safeValue.includes(focusId)
      ? safeValue.filter(id => id !== focusId)
      : [...safeValue, focusId];
    onChange(newValue);
  };

  return (
    <div>
      <label className="text-base font-semibold text-gray-900">审查关注点</label>
      <p className="text-sm text-gray-500">选择审查时需要关注的方面</p>
      
      <div className="mt-4 space-y-3">
        {availableFocus.map((focus) => (
          <div key={focus.id} className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id={focus.id}
                type="checkbox"
                checked={safeValue.includes(focus.id)}
                onChange={() => handleToggle(focus.id)}
                className="focus:ring-gray-900 h-4 w-4 text-gray-900 border-gray-300 rounded"
              />
            </div>
            <div className="ml-3 text-sm">
              <label htmlFor={focus.id} className="font-medium text-gray-700">
                {focus.label}
              </label>
              <p className="text-gray-500">{focus.description}</p>
            </div>
          </div>
        ))}
      </div>
      
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}