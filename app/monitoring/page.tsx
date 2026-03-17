import { MonitoringDashboard } from '@/components/monitoring/MonitoringDashboard';

/**
 * 监控页面
 */
export default function MonitoringPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <MonitoringDashboard />
    </div>
  );
}

/**
 * 页面元数据
 */
export const metadata = {
  title: '监控面板',
  description: '实时监控系统性能与告警状态',
};