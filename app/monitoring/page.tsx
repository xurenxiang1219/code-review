'use client';

import { MonitoringDashboard } from '@/components/monitoring/MonitoringDashboard';
import { useAuth } from '@/lib/contexts/auth-context';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/**
 * 监控页面
 */
export default function MonitoringPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" text="加载中..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <MonitoringDashboard />
    </div>
  );
}