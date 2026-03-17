import { useState } from 'react';

interface FileFilterSectionProps {
  whitelist: string[];
  ignorePatterns: string[];
  onWhitelistChange: (value: string[]) => void;
  onIgnorePatternsChange: (value: string[]) => void;
  errors: Record<string, string>;
}

/**
 * 文件过滤配置区块
 */
export function FileFilterSection({ 
  whitelist, 
  ignorePatterns, 
  onWhitelistChange, 
  onIgnorePatternsChange, 
  errors 
}: FileFilterSectionProps) {
  const [newWhitelistItem, setNewWhitelistItem] = useState('');
  const [newIgnorePattern, setNewIgnorePattern] = useState('');

  // 确保数组参数始终为数组，避免空值错误
  const safeWhitelist = whitelist || [];
  const safeIgnorePatterns = ignorePatterns || [];

  // 常用文件类型快捷选项
  const commonFileTypes = [
    { label: 'JavaScript/TypeScript', patterns: ['*.js', '*.jsx', '*.ts', '*.tsx'] },
    { label: 'Python', patterns: ['*.py', '*.pyx', '*.pyi'] },
    { label: 'Java', patterns: ['*.java', '*.kt', '*.scala'] },
    { label: 'C/C++', patterns: ['*.c', '*.cpp', '*.cc', '*.cxx', '*.h', '*.hpp'] },
    { label: 'Go', patterns: ['*.go'] },
    { label: 'Rust', patterns: ['*.rs'] },
    { label: 'PHP', patterns: ['*.php', '*.phtml'] },
    { label: 'Ruby', patterns: ['*.rb', '*.rake'] },
    { label: 'Swift', patterns: ['*.swift'] },
    { label: 'Dart', patterns: ['*.dart'] },
  ];

  // 常用忽略模式快捷选项
  const commonIgnorePatterns = [
    { label: 'Node.js', patterns: ['node_modules/**', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*'] },
    { label: '构建输出', patterns: ['dist/**', 'build/**', 'out/**', 'target/**'] },
    { label: '编译文件', patterns: ['*.min.js', '*.bundle.js', '*.min.css', '*.map'] },
    { label: '测试覆盖率', patterns: ['coverage/**', '.nyc_output/**', '*.lcov'] },
    { label: 'IDE文件', patterns: ['.vscode/**', '.idea/**', '*.swp', '*.swo'] },
    { label: '系统文件', patterns: ['.DS_Store', 'Thumbs.db', '*.tmp', '*.temp'] },
    { label: '日志文件', patterns: ['*.log', 'logs/**', '*.log.*'] },
    { label: 'Git', patterns: ['.git/**', '.gitignore', '.gitattributes'] },
  ];

  /**
   * 通用的添加单个项目方法
   */
  const addItem = (newItem: string, items: string[], callback: (items: string[]) => void, setter: (value: string) => void) => {
    const trimmed = newItem.trim();
    if (trimmed && !items.includes(trimmed)) {
      callback([...items, trimmed]);
      setter('');
    }
  };

  /**
   * 通用的批量添加项目方法
   */
  const addMultipleItems = (newItems: string[], items: string[], callback: (items: string[]) => void) => {
    const uniqueItems = newItems.filter(item => !items.includes(item));
    if (uniqueItems.length > 0) {
      callback([...items, ...uniqueItems]);
    }
  };

  /**
   * 通用的移除项目方法
   */
  const removeItem = (item: string, items: string[], callback: (items: string[]) => void) => {
    callback(items.filter(i => i !== item));
  };

  /**
   * 渲染项目列表
   */
  const renderItemList = (items: string[], onRemove: (item: string) => void) => (
    <div className="mt-3 flex flex-wrap gap-2">
      {(items || []).map((item) => (
        <span
          key={item}
          className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300"
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

  /**
   * 渲染输入区域和快捷选项
   */
  const renderInputSection = (
    value: string,
    setValue: (value: string) => void,
    items: string[],
    onItemsChange: (items: string[]) => void,
    placeholder: string,
    quickOptions: typeof commonFileTypes
  ) => (
    <div className="mt-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(value, items, onItemsChange, setValue))}
          placeholder={placeholder}
          className="flex-1 rounded border-gray-300 shadow-sm text-sm focus:border-gray-900 focus:ring-gray-900"
        />
        <button
          type="button"
          onClick={() => addItem(value, items, onItemsChange, setValue)}
          className="px-3 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          添加
        </button>
      </div>
      
      <div className="mt-3">
        <p className="text-xs text-gray-500 mb-2">快捷添加：</p>
        <div className="flex flex-wrap gap-2">
          {quickOptions.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => addMultipleItems(option.patterns, items, onItemsChange)}
              className="px-2 py-1 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50 hover:text-gray-800"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      
      {renderItemList(items, (item) => removeItem(item, items, onItemsChange))}
    </div>
  );

  return (
    <div>
      <label className="text-base font-semibold text-gray-900">文件过滤</label>
      <p className="text-sm text-gray-500">配置需要审查和忽略的文件</p>
        
      <div className="mt-4">
        <label className="text-sm font-medium text-gray-700">文件白名单</label>
        <p className="text-xs text-gray-400 mb-2">只审查匹配的文件类型</p>
        
        {renderInputSection(
          newWhitelistItem,
          setNewWhitelistItem,
          safeWhitelist,
          onWhitelistChange,
          "*.ts, *.tsx, *.js",
          commonFileTypes
        )}
        
        {errors.fileWhitelist && (
          <p className="mt-2 text-sm text-red-600">{errors.fileWhitelist}</p>
        )}
      </div>

      <div className="mt-6">
        <label className="text-sm font-medium text-gray-700">忽略模式</label>
        <p className="text-xs text-gray-400 mb-2">需要忽略的文件或目录</p>
        
        {renderInputSection(
          newIgnorePattern,
          setNewIgnorePattern,
          safeIgnorePatterns,
          onIgnorePatternsChange,
          "node_modules/**, dist/**",
          commonIgnorePatterns
        )}
      </div>
    </div>
  );
}