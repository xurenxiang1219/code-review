import { NextRequest, NextResponse } from 'next/server';
import { apiRoute } from '@/lib/utils/api-response';
import { keyRotationService } from '@/lib/services/key-rotation';
import { databaseEncryptionService } from '@/lib/services/database-encryption';
import { logger } from '@/lib/utils/logger';
import { authenticateApiRoute } from '@/lib/middleware/api-auth';
import { Permission } from '@/types/auth';

/**
 * 统一认证检查辅助函数
 */
async function checkAuth(request: NextRequest, permissions: Permission[]) {
  const auth = await authenticateApiRoute(request, {
    requiredPermissions: permissions,
    enableRateLimit: true,
  });
  
  if (auth instanceof NextResponse) {
    throw new Error('认证失败');
  }
  
  return auth;
}

/**
 * 获取加密状态和配置信息
 * GET /api/encryption
 */
export const GET = apiRoute(async (request: NextRequest) => {
  const auth = await checkAuth(request, [Permission.CONFIG_READ]);

  logger.encryption('获取加密状态', 'system', {
    userId: auth?.user?.id,
  });

  // 检查各类密钥是否需要轮换
  const configRotationNeeded = await keyRotationService.shouldRotateKey('config');
  const databaseRotationNeeded = await keyRotationService.shouldRotateKey('database');
  const logRotationNeeded = await keyRotationService.shouldRotateKey('log');

  // 获取轮换历史
  const rotationHistory = await keyRotationService.getRotationHistory(undefined, 10);

  // 获取加密字段配置
  const tableConfigs = databaseEncryptionService.getAllTableConfigs();

  const encryptionStatus = {
    keyRotation: {
      config: {
        needed: configRotationNeeded,
        lastRotation: rotationHistory?.find?.(r => r?.keyType === 'config')?.completedAt,
      },
      database: {
        needed: databaseRotationNeeded,
        lastRotation: rotationHistory?.find?.(r => r?.keyType === 'database')?.completedAt,
      },
      log: {
        needed: logRotationNeeded,
        lastRotation: rotationHistory?.find?.(r => r?.keyType === 'log')?.completedAt,
      },
    },
    encryptedTables: (tableConfigs || []).map(config => ({
      tableName: config?.tableName,
      sensitiveFieldsCount: config?.sensitiveFields?.length ?? 0,
      sensitiveFields: config?.sensitiveFields ?? [],
    })),
    recentRotations: (rotationHistory || []).slice(0, 5),
  };

  return encryptionStatus;
});

/**
 * 执行密钥轮换操作
 * POST /api/encryption
 */
export const POST = apiRoute(async (request: NextRequest) => {
  const auth = await checkAuth(request, [Permission.CONFIG_WRITE]);

  const body = await request?.json?.() ?? {};
  const { keyType, force = false } = body;

  const validKeyTypes = ['config', 'database', 'log'];
  if (!keyType || !validKeyTypes.includes(keyType)) {
    throw new Error(`无效的密钥类型，支持的类型：${validKeyTypes.join(', ')}`);
  }

  logger.encryption('开始密钥轮换', keyType, {
    userId: auth?.user?.id,
    force,
  });

  // 检查是否需要轮换（除非强制执行）
  if (!force && !await keyRotationService.shouldRotateKey(keyType)) {
    throw new Error('密钥尚未到轮换时间，如需强制轮换请设置 force: true');
  }

  try {
    const rotationResult = keyType === 'config'
      ? await keyRotationService.rotateConfigKeys()
      : await keyRotationService.rotateDatabaseKeys();

    logger.encryption('密钥轮换完成', keyType, {
      userId: auth?.user?.id,
      rotationId: rotationResult?.id,
      affectedRecords: rotationResult?.affectedRecords,
      duration: rotationResult?.completedAt && rotationResult?.startedAt 
        ? rotationResult.completedAt.getTime() - rotationResult.startedAt.getTime()
        : 0,
    });

    return rotationResult;
  } catch (error) {
    logger.error('密钥轮换失败', {
      keyType,
      userId: auth?.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new Error('密钥轮换失败');
  }
});

/**
 * 验证加密数据完整性
 * PUT /api/encryption
 */
export const PUT = apiRoute(async (request: NextRequest) => {
  const auth = await checkAuth(request, [Permission.CONFIG_READ]);

  logger.encryption('开始验证加密数据完整性', 'system', {
    userId: auth?.user?.id,
  });

  try {
    const validationResult = await keyRotationService.validateAllEncryptedData();

    logger.encryption('加密数据完整性验证完成', 'system', {
      userId: auth?.user?.id,
      valid: validationResult?.valid,
      errorsCount: validationResult?.errors?.length ?? 0,
    });

    return validationResult;
  } catch (error) {
    logger.error('数据完整性验证失败', {
      userId: auth?.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new Error('数据完整性验证失败');
  }
});