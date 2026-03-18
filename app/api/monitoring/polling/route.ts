import { NextRequest, NextResponse } from 'next/server';
import { handleApiRequest } from '@/lib/utils/api-response';
import { configRepository } from '@/lib/db/repositories/config';

/**
 * 轮询状态接口
 */
interface PollingStatus {
  id: string;
  repository: string;
  branch: string;
  enabled: boolean;
  interval: number;
  lastScanTime?: string;
  nextScanTime?: string;
  status: 'running' | 'stopped' | 'error';
  errorMessage?: string;
  scanCount: number;
  successCount: number;
  failureCount: number;
}

/**
 * 获取轮询状态
 * @param request 请求对象
 * @returns 轮询状态数据
 */
export async function GET(request: NextRequest) {
  return handleApiRequest(async () => {
    const pollingConfigs = await configRepository.getPollingEnabledConfigs();
    const { pollingLogsRepository } = await import('@/lib/db/repositories/polling-logs');
    
    const pollingStatuses: PollingStatus[] = await Promise.all(
      (pollingConfigs ?? []).map(async (config) => {
        const now = new Date();
        const intervalMs = config.pollingInterval * 1000;
        const nextScanTime = new Date(now.getTime() + intervalMs);
        
        // 获取该仓库的统计数据
        const stats = await pollingLogsRepository.getStats(config.repository, config.git?.defaultBranch);
        const repoStats = stats?.[0];
        
        return {
          id: config.repository.replace(/[^a-zA-Z0-9]/g, '_'),
          repository: config.repository,
          branch: config.git?.defaultBranch ?? 'main',
          enabled: config.pollingEnabled,
          interval: config.pollingInterval,
          lastScanTime: repoStats?.lastScanAt ?? config.updatedAt,
          nextScanTime: nextScanTime.toISOString(),
          status: config.pollingEnabled ? 'running' : 'stopped',
          scanCount: repoStats?.totalScans ?? 0,
          successCount: repoStats?.successfulScans ?? 0,
          failureCount: repoStats?.failedScans ?? 0,
        };
      })
    );

    return {
      pollingStatuses,
      totalConfigs: pollingConfigs?.length ?? 0,
      activeConfigs: (pollingConfigs ?? []).filter(c => c?.pollingEnabled).length,
      timestamp: new Date().toISOString(),
    };
  });
}