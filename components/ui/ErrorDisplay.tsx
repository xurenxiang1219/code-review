'use client';

import { AlertTriangle, RefreshCw, Home, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, AlertType } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';

/**
 * 错误类型枚举
 */
export enum ErrorType {
  NETWORK = 'network',
  SERVER = 'server',
  AUTH = 'auth',
  PERMISSION = 'permission',
  BUSINESS = 'business',
  UNKNOWN = 'unknown',
}

/**
 * 错误显示属性接口
 */
interface ErrorDisplayProps {
  type: ErrorType;
  title?: string;
  message?: string;
  code?: string | number;
  errorId?: string;
  retryable?: boolean;
  onRetry?: () => void;
  showDetails?: boolean;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  }>;
  className?: string;
}

const ERROR_CONFIG = {
  [ErrorType.NETWORK]: {
    icon: RefreshCw,
    title: '网络连接错误',
    defaultMessage: '无法连接到服务器，请检查网络连接后重试',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    suggestions: [
      '检查网络连接是否正常',
      '尝试刷新页面',
      '稍后再试',
    ],
  },
  [ErrorType.SERVER]: {
    icon: AlertTriangle,
    title: '服务器错误',
    defaultMessage: '服务器暂时无法处理请求，请稍后重试',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    suggestions: [
      '稍后重试',
      '如果问题持续存在，请联系技术支持',
    ],
  },
  [ErrorType.AUTH]: {
    icon: AlertTriangle,
    title: '认证失败',
    defaultMessage: '登录已过期，请重新登录',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    suggestions: [
      '重新登录',
      '检查登录凭据是否正确',
    ],
  },
  [ErrorType.PERMISSION]: {
    icon: AlertTriangle,
    title: '权限不足',
    defaultMessage: '您没有权限执行此操作',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    suggestions: [
      '联系管理员获取权限',
      '确认您的账户角色',
    ],
  },
  [ErrorType.BUSINESS]: {
    icon: AlertTriangle,
    title: '操作失败',
    defaultMessage: '操作无法完成，请检查输入信息',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    suggestions: [
      '检查输入信息是否正确',
      '确认操作条件是否满足',
    ],
  },
  [ErrorType.UNKNOWN]: {
    icon: AlertTriangle,
    title: '未知错误',
    defaultMessage: '发生了未知错误，请稍后重试',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    suggestions: [
      '刷新页面重试',
      '如果问题持续存在，请联系技术支持',
    ],
  },
};

/**
 * 渲染建议列表
 */
function SuggestionsList({ suggestions }: { suggestions: string[] }) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-sm font-medium text-gray-600 mb-2">建议解决方案：</p>
      <ul className="text-sm text-gray-600 space-y-1">
        {suggestions.map((suggestion, index) => (
          <li key={index} className="flex items-start">
            <span className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 mr-2 flex-shrink-0" />
            {suggestion}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 错误详情展开框
 */
function ErrorDetails({ code, errorId }: { code?: string | number; errorId?: string }) {
  if (!code && !errorId) return null;

  return (
    <details className="mb-4">
      <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
        错误详情
      </summary>
      <div className="mt-2 p-3 bg-white rounded border text-sm font-mono">
        {code && (
          <div className="mb-1">
            <span className="font-semibold">错误代码:</span> {code}
          </div>
        )}
        {errorId && (
          <div>
            <span className="font-semibold">错误ID:</span> {errorId}
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * 居中错误卡片布局
 */
function CenteredErrorCard({
  icon: Icon,
  title,
  message,
  onRetry,
  children,
}: {
  icon: React.ComponentType<{ className: string }>;
  title: string;
  message: string;
  onRetry?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Icon className="h-12 w-12 text-gray-400 mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 mb-4">{message}</p>
      {children}
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          重新加载
        </Button>
      )}
    </div>
  );
}

export function ErrorDisplay({
  type,
  title,
  message,
  code,
  errorId,
  retryable = false,
  onRetry,
  showDetails = false,
  actions = [],
  className = '',
}: ErrorDisplayProps) {
  const config = ERROR_CONFIG[type];
  const IconComponent = config.icon;
  const displayTitle = title || config.title;
  const displayMessage = message || config.defaultMessage;

  return (
    <Card className={`p-6 ${config.bgColor} ${config.borderColor} border ${className}`}>
      <div className="flex items-start space-x-4">
        <div className={`flex-shrink-0 ${config.color}`}>
          <IconComponent className="h-6 w-6" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className={`text-lg font-semibold ${config.color} mb-2`}>
            {displayTitle}
          </h3>

          <p className="text-gray-700 mb-4">
            {displayMessage}
          </p>

          <SuggestionsList suggestions={config.suggestions} />

          {showDetails && <ErrorDetails code={code} errorId={errorId} />}

          <div className="flex flex-wrap gap-2">
            {retryable && onRetry && (
              <Button
                onClick={onRetry}
                variant="primary"
                size="sm"
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                重试
              </Button>
            )}

            {actions.map((action, index) => (
              <Button
                key={index}
                onClick={action.onClick}
                variant={action.variant || 'outline'}
                size="sm"
              >
                {action.label}
              </Button>
            ))}

            <Button
              onClick={() => window.location.href = '/'}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Home className="h-4 w-4" />
              返回首页
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

interface SimpleErrorProps {
  message: string;
  retryable?: boolean;
  onRetry?: () => void;
  type?: AlertType;
}

export function SimpleError({
  message,
  retryable = false,
  onRetry,
  type = 'error',
}: SimpleErrorProps) {
  return (
    <Alert type={type} className="my-4">
      <AlertTriangle className="h-4 w-4" />
      <div className="flex-1">
        <p>{message}</p>
        {retryable && onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            size="sm"
            className="mt-2"
          >
            重试
          </Button>
        )}
      </div>
    </Alert>
  );
}

export function LoadingError({ resource = '数据', onRetry }: { resource?: string; onRetry?: () => void }) {
  return (
    <CenteredErrorCard
      icon={AlertTriangle}
      title="加载失败"
      message={`无法加载${resource}，请稍后重试`}
      onRetry={onRetry}
    />
  );
}

export function NetworkError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorDisplay
      type={ErrorType.NETWORK}
      retryable={onRetry !== undefined}
      onRetry={onRetry}
      actions={[
        {
          label: '检查网络',
          onClick: () => window.open('https://www.baidu.com', '_blank'),
          variant: 'outline',
        },
      ]}
    />
  );
}

export function ServerError({ code, errorId, onRetry }: { 
  code?: string | number;
  errorId?: string;
  onRetry?: () => void;
}) {
  return (
    <ErrorDisplay
      type={ErrorType.SERVER}
      code={code}
      errorId={errorId}
      retryable={onRetry !== undefined}
      onRetry={onRetry}
      showDetails
      actions={[
        {
          label: '联系支持',
          onClick: () => window.location.href = 'mailto:support@example.com',
          variant: 'outline',
        },
      ]}
    />
  );
}

export function AuthError() {
  return (
    <ErrorDisplay
      type={ErrorType.AUTH}
      actions={[
        {
          label: '重新登录',
          onClick: () => window.location.href = '/login',
          variant: 'primary',
        },
      ]}
    />
  );
}

export function PermissionError({ resource }: { resource?: string }) {
  const message = resource 
    ? `您没有权限访问${resource}` 
    : '您没有权限执行此操作';

  return (
    <ErrorDisplay
      type={ErrorType.PERMISSION}
      message={message}
      actions={[
        {
          label: '申请权限',
          onClick: () => window.location.href = 'mailto:admin@example.com',
          variant: 'outline',
        },
      ]}
    />
  );
}

export function BusinessError({ message, suggestions = [] }: { 
  message: string;
  suggestions?: string[];
}) {
  return (
    <div className="space-y-4">
      <ErrorDisplay
        type={ErrorType.BUSINESS}
        message={message}
      />
      {suggestions.length > 0 && (
        <Alert type="info">
          <div>
            <h4 className="font-medium mb-2">解决建议：</h4>
            <ul className="text-sm space-y-1">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start">
                  <span className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 mr-2 flex-shrink-0" />
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        </Alert>
      )}
    </div>
  );
}

export function TimeoutError({ onRetry }: { onRetry?: () => void }) {
  return (
    <CenteredErrorCard
      icon={Clock}
      title="请求超时"
      message="服务器响应时间过长，请稍后重试"
      onRetry={onRetry}
    />
  );
}