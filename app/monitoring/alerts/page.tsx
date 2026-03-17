import { AlertManager } from '@/components/monitoring/AlertManager';

/**
 * 告警管理页面
 */
export default function AlertsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <AlertManager />
    </div>
  );
}

/**
 * 页面元数据
 */
export const metadata = {
  title: '告警管理 - CodeReview',
  description: '管理系统告警、查看告警历史和统计信息',
};