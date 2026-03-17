import React from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * 加载动画尺寸类型
 */
export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * 加载动画组件属性
 */
export interface LoadingSpinnerProps {
  /** 尺寸 */
  size?: SpinnerSize;
  /** 自定义类名 */
  className?: string;
  /** 加载文本 */
  text?: string;
  /** 是否居中显示 */
  center?: boolean;
}

/**
 * 尺寸样式映射
 */
const spinnerSizes: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

/**
 * 加载动画组件
 * 
 * @example
 * ```tsx
 * <LoadingSpinner size="md" text="加载中..." />
 * <LoadingSpinner size="lg" center />
 * ```
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className,
  text,
  center = false,
}) => {
  const spinnerClasses = cn(
    'animate-spin text-gray-900',
    spinnerSizes[size],
    className
  );

  const containerClasses = cn(
    'flex items-center',
    center && 'justify-center',
    text && 'space-x-2'
  );

  const spinner = (
    <svg
      className={spinnerClasses}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      role="presentation"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  if (text) {
    return (
      <div className={containerClasses}>
        {spinner}
        <span className="text-sm text-gray-600">{text}</span>
      </div>
    );
  }

  return center ? (
    <div className={containerClasses}>{spinner}</div>
  ) : (
    spinner
  );
};

export default LoadingSpinner;