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

  const addItem = (newItem: string, items: string[], callback: (items: string[]) => void, setter: (value: string) => void) => {
    const trimmed = newItem.trim();
    if (trimmed && !items.includes(trimmed)) {
      callback([...items, trimmed]);
      setter('');
    }
  };

  const removeItem = (item: string, items: string[], callback: (items: string[]) => void) => {
    callback(items.filter(i => i !== item));
  };

  const renderItemList = (items: string[], onRemove: (item: string) => void) => (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
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

  return (
    <div>
      <label className="text-base font-semibold text-gray-900">文件过滤</label>
      <p className="text-sm text-gray-500">配置需要审查和忽略的文件</p>
        
      <div className="mt-4">
        <label className="text-sm font-medium text-gray-700">文件白名单</label>
        <p className="text-xs text-gray-400 mb-2">只审查匹配的文件类型</p>
        
        <div className="mt-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newWhitelistItem}
              onChange={(e) => setNewWhitelistItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(newWhitelistItem, whitelist, onWhitelistChange, setNewWhitelistItem))}
              placeholder="*.ts, *.tsx, *.js"
              className="flex-1 rounded border-gray-300 shadow-sm text-sm focus:border-gray-900 focus:ring-gray-900"
            />
            <button
              type="button"
              onClick={() => addItem(newWhitelistItem, whitelist, onWhitelistChange, setNewWhitelistItem)}
              className="px-3 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              添加
            </button>
          </div>
          
          {renderItemList(whitelist, (item) => removeItem(item, whitelist, onWhitelistChange))}
        </div>
        
        {errors.fileWhitelist && (
          <p className="mt-2 text-sm text-red-600">{errors.fileWhitelist}</p>
        )}
      </div>

      <div className="mt-6">
        <label className="text-sm font-medium text-gray-700">忽略模式</label>
        <p className="text-xs text-gray-400 mb-2">需要忽略的文件或目录</p>
        
        <div className="mt-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newIgnorePattern}
              onChange={(e) => setNewIgnorePattern(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(newIgnorePattern, ignorePatterns, onIgnorePatternsChange, setNewIgnorePattern))}
              placeholder="node_modules/**, dist/**"
              className="flex-1 rounded border-gray-300 shadow-sm text-sm focus:border-gray-900 focus:ring-gray-900"
            />
            <button
              type="button"
              onClick={() => addItem(newIgnorePattern, ignorePatterns, onIgnorePatternsChange, setNewIgnorePattern)}
              className="px-3 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              添加
            </button>
          </div>
          
          {renderItemList(ignorePatterns, (pattern) => removeItem(pattern, ignorePatterns, onIgnorePatternsChange))}
        </div>
      </div>
    </div>
  );
}