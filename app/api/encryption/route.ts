import { NextRequest, NextResponse } from 'next/server';
import { 
  successResponse, 
  errorResponse, 
  handleApiRequest,
  internalErrorResponse,
} from '@/lib/utils/api-response';
import { ApiCode } from '@/lib/constants/api-codes';
import { keyRotationService } from '@/lib/services/key-rotation';
import { databaseEncryptionService } from '@/lib/services/database-encryption';
import { logger } from '@/lib/utils/logger';
import { authenticateApiRoute } from '@/lib/middleware/api-auth';
import { Permission } from '@/types/auth';

/**
 * 获取加密状态和配置信息
 * GET /api/encryption
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiRoute(request, {
    requiredPermissions: [Permission.CONFIG_READ],
    enableRateLimit: true,
  });
  
  if (auth instanceof NextResponse) {
    return auth;
  }

  return handleApiRequest(async () => {
    logger.encryption('获取加密状态', 'system', {
      userId: auth.user.id,
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
          lastRotation: rotationHistory.find(r => r.keyType === 'config')?.completedAt,
        },
        database: {
          needed: databaseRotationNeeded,
          lastRotation: rotationHistory.find(r => r.keyType === 'database')?.completedAt,
        },
        log: {
          needed: logRotationNeeded,
          lastRotation: rotationHistory.find(r => r.keyType === 'log')?.completedAt,
        },
      },
      encryptedTables: tableConfigs.map(config => ({
        tableName: config.tableName,
        sensitiveFieldsCount: config.sensitiveFields.length,
        sensitiveFields: config.sensitiveFields,
      })),
      recentRotations: rotationHistory.slice(0, 5),
    };

    return successResponse(encryptionStatus);
  });
}

/**
 * 执行密钥轮换操作
 * POST /api/encryption/rotate
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateApiRoute(request, {
    requiredPermissions: [Permission.CONFIG_WRITE],
    enableRateLimit: true,
  });
  
  if (auth instanceof NextResponse) {
    return auth;
  }

  return handleApiRequest(async () => {
    const body = await request.json();
    const { keyType, force = false } = body;

    if (!keyType || !['config', 'database', 'log'].includes(keyType)) {
      return errorResponse(
        ApiCode.BAD_REQUEST,
        '无效的密钥类型，支持的类型：config, database, log'
      );
    }

    logger.encryption('开始密钥轮换', keyType, {
      userId: auth.user.id,
      force,
    });

    // 检查是否需要轮换（除非强制执行）
    if (!force) {
      const rotationNeeded = await keyRotationService.shouldRotateKey(keyType);
      if (!rotationNeeded) {
        return errorResponse(
          ApiCode.BAD_REQUEST,
          '密钥尚未到轮换时间，如需强制轮换请设置 force: true'
        );
      }
    }

    try {
      const rotationResult = keyType === 'config'
        ? await keyRotationService.rotateConfigKeys()
        : await keyRotationService.rotateDatabaseKeys();

      logger.encryption('密钥轮换完成', keyType, {
        userId: auth.user.id,
        rotationId: rotationResult.id,
        affectedRecords: rotationResult.affectedRecords,
        duration: rotationResult.completedAt 
          ? rotationResult.completedAt.getTime() - rotationResult.startedAt.getTime()
          : 0,
      });

      return successResponse(rotationResult, '密钥轮换完成');
    } catch (error) {
      logger.error('密钥轮换失败', {
        keyType,
        userId: auth.user.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return internalErrorResponse('密钥轮换失败');
    }
  });
}

/**
 * 验证加密数据完整性
 * POST /api/encryption/validate
 */
export async function PUT(request: NextRequest) {
  const auth = await authenticateApiRoute(request, {
    requiredPermissions: [Permission.CONFIG_READ],
    enableRateLimit: true,
  });
  
  if (auth instanceof NextResponse) {
    return auth;
  }

  return handleApiRequest(async () => {
    logger.encryption('开始验证加密数据完整性', 'system', {
      userId: auth.user.id,
    });

    try {
      const validationResult = await keyRotationService.validateAllEncryptedData();

      logger.encryption('加密数据完整性验证完成', 'system', {
        userId: auth.user.id,
        valid: validationResult.valid,
        errorsCount: validationResult.errors.length,
      });

      return successResponse(validationResult, '数据完整性验证完成');
    } catch (error) {
      logger.error('数据完整性验证失败', {
        userId: auth.user.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return internalErrorResponse('数据完整性验证失败');
    }
  });
}