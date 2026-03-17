import React from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * 徽章变体类型
 */
export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

/**
 * 徽章尺寸类型
 */
export type BadgeSize = 'sm' | 'md' | 'lg';

/**
 * 徽章组件属性
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** 徽章变体 */
  variant?: BadgeVariant;
  /** 徽章尺寸 */
  size?: BadgeSize;
  /** 是否显示圆点 */
  dot?: boolean;
}

/**
 * 徽章样式映射
 */
const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
};

const badgeSizes: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

/**
 * 徽章组件
 * 
 * @example
 * ```tsx
 * <Badge variant="success">成功</Badge>
 * <Badge variant="danger" size="sm">错误</Badge>
 * <Badge variant="warning" dot>警告</Badge>
 * ```
 */
export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  dot = false,
  className,
  children,
  ...props
}) => {
  const badgeClasses = cn(
    'inline-flex items-center font-medium rounded-full',
    badgeVariants[variant],
    badgeSizes[size],
    className
  );

  return (
    <span className={badgeClasses} {...props}>
      {dot && (
        <span className="w-1.5 h-1.5 bg-current rounded-full mr-1.5" />
      )}
      {children}
    </span>
  );
};

export default Badge;