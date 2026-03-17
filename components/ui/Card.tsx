import React from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * 卡片组件属性
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 是否显示阴影 */
  shadow?: boolean;
  /** 是否显示边框 */
  border?: boolean;
  /** 内边距大小 */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

/**
 * 卡片头部组件属性
 */
export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 标题 */
  title?: string;
  /** 副标题 */
  subtitle?: string;
  /** 右侧操作区域 */
  actions?: React.ReactNode;
}

/**
 * 卡片内容组件属性
 */
export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * 卡片底部组件属性
 */
export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

/**
 * 卡片组件
 * 
 * @example
 * ```tsx
 * <Card shadow padding="md">
 *   <CardHeader title="标题" subtitle="副标题" />
 *   <CardContent>
 *     内容区域
 *   </CardContent>
 *   <CardFooter>
 *     底部操作
 *   </CardFooter>
 * </Card>
 * ```
 */
export const Card: React.FC<CardProps> = ({
  shadow = true,
  border = true,
  padding = 'none',
  className,
  children,
  ...props
}) => {
  const cardClasses = cn(
    'bg-white rounded-lg',
    shadow && 'shadow-sm',
    border && 'border border-gray-200',
    paddingClasses[padding],
    className
  );

  return (
    <div className={cardClasses} {...props}>
      {children}
    </div>
  );
};

/**
 * 卡片头部组件
 */
export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  actions,
  className,
  children,
  ...props
}) => {
  const headerClasses = cn(
    'flex items-center justify-between',
    'px-6 py-4 border-b border-gray-200',
    className
  );

  return (
    <div className={headerClasses} {...props}>
      <div className="flex-1">
        {title && (
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        )}
        {subtitle && (
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        )}
        {children}
      </div>
      {actions && (
        <div className="flex items-center space-x-2">{actions}</div>
      )}
    </div>
  );
};

/**
 * 卡片内容组件
 */
export const CardContent: React.FC<CardContentProps> = ({
  className,
  children,
  ...props
}) => {
  const contentClasses = cn('px-6 py-4', className);

  return (
    <div className={contentClasses} {...props}>
      {children}
    </div>
  );
};

/**
 * 卡片底部组件
 */
export const CardFooter: React.FC<CardFooterProps> = ({
  className,
  children,
  ...props
}) => {
  const footerClasses = cn(
    'px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg',
    className
  );

  return (
    <div className={footerClasses} {...props}>
      {children}
    </div>
  );
};

export default Card;