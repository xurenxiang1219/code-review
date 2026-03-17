'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@/lib/utils/logger';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

/**
 * 错误边界状态接口
 */
interface ErrorBoundaryState {
  /** 是否有错误 */
  hasError: boolean;
  /** 错误对象 */
  error: Error | null;
  /** 错误信息 */
  errorInfo: ErrorInfo | null;
  /** 错误ID */
  errorId: string | null;
}

/**
 * 错误边界属性接口
 */
interface ErrorBoundaryProps {
  /** 子组件 */
  children: ReactNode;
  /** 自定义错误UI */
  fallback?: (error: Error, errorId: string, retry: () => void) => ReactNode;
  /** 错误回调函数 */
  onError?: (error: Error, errorInfo: ErrorInfo, errorId: string) => void;
  /** 是否显示错误详情（开发环境） */
  showErrorDetails?: boolean;
  /** 组件名称（用于日志） */
  componentName?: string;
}

/**
 * React错误边界组件
 * 
 * 用于捕获React组件树中的JavaScript错误，记录错误并显示备用UI
 * 
 * 功能特性：
 * - 自动捕获组件渲染错误
 * - 结构化错误日志记录
 * - 用户友好的错误提示
 * - 错误恢复重试机制
 * - 开发环境详细错误信息
 * 
 * 使用示例：
 * ```tsx
 * <ErrorBoundary componentName="Dashboard">
 *   <DashboardContent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const errorId = this.state.errorId || `error_${Date.now()}`;
    
    this.setState({ errorInfo, errorId });
    this.logError(error, errorInfo, errorId);

    if (this.props.onError) {
      this.props.onError(error, errorInfo, errorId);
    }
  }

  componentWillUnmount(): void {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  private logError(error: Error, errorInfo: ErrorInfo, errorId: string): void {
    const componentName = this.props.componentName || 'UnknownComponent';
    
    logger.error('React组件错误', {
      errorId,
      component: componentName,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      componentStack: errorInfo.componentStack,
      type: 'react_error_boundary',
    });
  }

  private handleRetry = (): void => {
    logger.info('用户触发错误恢复重试', {
      errorId: this.state.errorId,
      component: this.props.componentName,
    });

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    });
  };

  private renderDefaultErrorUI(error: Error, errorId: string): ReactNode {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const showDetails = this.props.showErrorDetails ?? isDevelopment;

    return (
      <div className="min-h-[200px] flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <Alert type="error" className="mb-4">
            <div className="space-y-2">
              <h3 className="font-semibold">页面加载出错</h3>
              <p className="text-sm">
                抱歉，页面遇到了一个错误。我们已经记录了这个问题，请稍后重试。
              </p>
              {showDetails && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    错误详情 (开发环境)
                  </summary>
                  <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                    <div><strong>错误ID:</strong> {errorId}</div>
                    <div><strong>组件:</strong> {this.props.componentName || 'Unknown'}</div>
                    <div><strong>错误:</strong> {error.message}</div>
                    {this.state.errorInfo?.componentStack && (
                      <div className="mt-2">
                        <strong>组件堆栈:</strong>
                        <pre className="whitespace-pre-wrap text-xs">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          </Alert>

          <div className="flex gap-2 justify-center">
            <Button 
              onClick={this.handleRetry}
              variant="outline"
              size="sm"
            >
              重试
            </Button>
            <Button 
              onClick={() => window.location.reload()}
              variant="primary"
              size="sm"
            >
              刷新页面
            </Button>
          </div>

          {!showDetails && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              错误ID: {errorId}
            </p>
          )}
        </div>
      </div>
    );
  }

  render(): ReactNode {
    const { hasError, error, errorId } = this.state;
    
    if (!hasError || !error || !errorId) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(error, errorId, this.handleRetry);
    }

    return this.renderDefaultErrorUI(error, errorId);
  }
}

/**
 * 高阶组件：为组件添加错误边界
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: {
    componentName?: string;
    fallback?: ErrorBoundaryProps['fallback'];
    onError?: ErrorBoundaryProps['onError'];
  } = {}
) {
  const WithErrorBoundaryComponent = (props: P) => (
    <ErrorBoundary
      componentName={options.componentName || WrappedComponent.displayName || WrappedComponent.name}
      fallback={options.fallback}
      onError={options.onError}
    >
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundaryComponent.displayName = `withErrorBoundary(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return WithErrorBoundaryComponent;
}

export function useErrorHandler(componentName?: string) {
  const handleError = React.useCallback((error: Error, errorInfo?: any) => {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    logger.error('函数组件错误', {
      errorId,
      component: componentName || 'UnknownFunctionComponent',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      errorInfo,
      type: 'function_component_error',
    });

    if (process.env.NODE_ENV === 'development') {
      throw error;
    }
  }, [componentName]);

  return handleError;
}

export function useAsyncErrorHandler(componentName?: string) {
  const handleError = useErrorHandler(componentName);

  const handleAsyncError = React.useCallback(
    async <T,>(
      asyncOperation: () => Promise<T>,
      operationName?: string
    ): Promise<T | null> => {
      try {
        return await asyncOperation();
      } catch (error) {
        const enhancedError = error instanceof Error 
          ? error 
          : new Error(String(error));
        
        if (operationName) {
          enhancedError.message = `${operationName}: ${enhancedError.message}`;
        }

        handleError(enhancedError, { operationName });
        return null;
      }
    },
    [handleError]
  );

  return handleAsyncError;
}