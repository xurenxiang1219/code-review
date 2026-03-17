import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  handleApiRequest, 
  successResponse, 
  validationErrorResponse,
  ApiError,
} from '@/lib/utils/api-response';
import { ApiCode } from '@/lib/constants/api-codes';
import { configRepository, UpdateConfigParams } from '@/lib/db/repositories/config';
import { logger } from '@/lib/utils/logger';
import { authenticateApiRouteSimple } from '@/lib/middleware/api-auth-simple';
import { Permission } from '@/types/auth';
import '@/lib/init/auth';

/**
 * AI 模型配置验证 Schema
 */
const AIModelConfigSchema = z.object({
  provider: z.string().min(1, 'AI 模型提供商不能为空'),
  model: z.string().min(1, 'AI 模型名称不能为空'),
  temperature: z.number().min(0).max(2, 'AI 模型温度必须在 0-2 之间'),
  maxTokens: z.number().min(100).max(8000, 'AI 模型最大 token 数必须在 100-8000 之间'),
  apiKey: z.string().optional(),
  baseUrl: z.string().url('AI 模型 API 地址格式错误').optional(),
});

/**
 * 通知配置验证 Schema
 */
/**
 * 通知配置验证 Schema
 */
/**
 * 通知配置验证 Schema
 */
const NotificationConfigSchema = z.object({
  email: z.object({
    enabled: z.boolean(),
    recipients: z.array(z.string().email('邮箱格式错误')).default([]),
    criticalOnly: z.boolean(),
  }).refine((data) => {
    // 启用邮件通知时必须有收件人
    return !data.enabled || (data.recipients?.length > 0);
  }, {
    message: '启用邮件通知时必须设置收件人',
    path: ['recipients'],
  }),
  im: z.object({
    enabled: z.boolean(),
    webhook: z.string().default(''),
    channels: z.array(z.string()).default([]),
  }).refine((data) => {
    if (!data.enabled) return true;

    // 验证 webhook 地址
    if (!data.webhook?.trim()) return false;
    try {
      new URL(data.webhook);
    } catch {
      return false;
    }

    // 验证频道列表
    return data.channels?.length > 0;
  }, {
    message: '启用即时消息通知时必须设置有效的 Webhook 地址和频道',
    path: ['webhook'],
  }),
  gitComment: z.object({
    enabled: z.boolean(),
    summaryOnly: z.boolean(),
  }),
});

/**
 * Git 配置验证 Schema
 */
const GitConfigSchema = z.object({
  baseUrl: z.string().url('Git API 地址格式错误').optional(),
  accessToken: z.string().optional(),
  defaultBranch: z.string().min(1, '默认分支不能为空'),
  watchedBranches: z.array(z.string().min(1, '分支名不能为空')),
  webhookSecret: z.string().optional(),
  timeout: z.number().min(5000).max(120000, '超时时间必须在 5000-120000 毫秒之间').optional(),
});

/**
 * 配置更新请求验证 Schema
 */
const UpdateConfigSchema = z.object({
  reviewFocus: z.array(z.string()).optional(),
  fileWhitelist: z.array(z.string()).optional(),
  ignorePatterns: z.array(z.string()).optional(),
  aiModel: AIModelConfigSchema.optional(),
  promptTemplate: z.string().optional(),
  git: GitConfigSchema.optional(),
  pollingEnabled: z.union([z.boolean(), z.number()]).transform(val => Boolean(val)).optional(),
  pollingInterval: z.number().min(30).max(3600, '轮询间隔必须在 30-3600 秒之间').optional(),
  notificationConfig: NotificationConfigSchema.optional(),
});

/**
 * 配置脱敏处理
 */
function sanitizeConfig(config: any) {
  return {
    ...config,
    aiModel: {
      ...config.aiModel,
      apiKey: config.aiModel.apiKey ? '***已配置***' : undefined,
    },
  };
}

/**
 * GET /api/config/all - 获取所有配置
 * 
 * 响应:
 * - 200: 返回所有配置列表
 * - 500: 服务器错误
 */
export async function GET(request: NextRequest) {
  // 检查路径是否为 /api/config/all
  if (request.nextUrl.pathname === '/api/config/all') {
    const auth = await authenticateApiRouteSimple(request, {
      requiredPermissions: [Permission.CONFIG_READ],
    });
    
    if (auth instanceof NextResponse) {
      return auth;
    }

    return handleApiRequest(async () => {
      const reqLogger = logger.child({ 
        operation: 'getAllConfigs',
        requestId: auth.requestId,
        userId: auth.user.id,
      });

      reqLogger.info('开始获取所有配置');

      const configs = await configRepository.getAllConfigs();

      reqLogger.info('所有配置获取成功', { count: configs.length });

      // 脱敏处理
      const sanitizedConfigs = configs.map(config => sanitizeConfig(config));

      return successResponse(sanitizedConfigs, '配置列表获取成功');
    });
  }

  // 原有的单个配置查询逻辑
  const auth = await authenticateApiRouteSimple(request, {
    requiredPermissions: [Permission.CONFIG_READ],
  });
  
  if (auth instanceof NextResponse) {
    return auth;
  }

  return handleApiRequest(async () => {
    const searchParams = request.nextUrl.searchParams;
    const repository = searchParams.get('repository');

    if (!repository) {
      throw new ApiError(ApiCode.MISSING_REQUIRED_FIELD, '缺少 repository 参数');
    }

    const reqLogger = logger.child({ 
      operation: 'getConfig',
      repository,
      requestId: auth.requestId,
      userId: auth.user.id,
    });

    reqLogger.info('开始查询配置');

    // 查询配置
    const config = await configRepository.getConfig(repository);

    if (!config) {
      reqLogger.warn('配置不存在');
      throw new ApiError(ApiCode.CONFIG_NOT_FOUND, '该仓库的配置不存在');
    }

    reqLogger.info('配置查询成功', { 
      configId: config.id,
      pollingEnabled: config.pollingEnabled 
    });

    return successResponse(sanitizeConfig(config), '配置查询成功');
  });
}

/**
 * PUT /api/config - 更新配置
 * 
 * 查询参数:
 * - repository: 仓库名称 (必填)
 * 
 * 请求体:
 * - reviewFocus?: string[] - 审查关注点
 * - fileWhitelist?: string[] - 文件白名单
 * - ignorePatterns?: string[] - 忽略模式
 * - aiModel?: AIModelConfig - AI 模型配置
 * - promptTemplate?: string - 提示词模板
 * - pollingEnabled?: boolean - 是否启用轮询
 * - pollingInterval?: number - 轮询间隔（秒）
 * - notificationConfig?: NotificationConfig - 通知配置
 * 
 * 响应:
 * - 200: 更新成功，返回更新后的配置
 * - 400: 参数错误或验证失败
 * - 404: 配置不存在时会自动创建默认配置
 * - 500: 服务器错误
 */
export async function PUT(request: NextRequest) {
  const auth = await authenticateApiRouteSimple(request, {
    requiredPermissions: [Permission.CONFIG_WRITE],
  });
  
  if (auth instanceof NextResponse) {
    return auth;
  }

  return handleApiRequest(async () => {
    const searchParams = request.nextUrl.searchParams;
    const repository = searchParams.get('repository');

    if (!repository) {
      throw new ApiError(ApiCode.MISSING_REQUIRED_FIELD, '缺少 repository 参数');
    }

    const reqLogger = logger.child({ 
      operation: 'updateConfig',
      repository,
      requestId: auth.requestId,
      userId: auth.user.id,
    });

    reqLogger.info('开始更新配置');

    // 解析请求体
    let requestBody: any;
    try {
      requestBody = await request.json();
    } catch (error) {
      reqLogger.warn('请求体解析失败', { error });
      throw new ApiError(ApiCode.INVALID_PARAMETERS, '请求体格式错误');
    }

    // 验证请求数据
    const validation = UpdateConfigSchema.safeParse(requestBody);
    if (!validation.success) {
      const errors = validation.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));

      reqLogger.warn('配置验证失败', { errors });
      return validationErrorResponse(errors);
    }

    const updateParams: UpdateConfigParams = validation.data;

    // 使用仓库层的验证
    const repoValidation = configRepository.validateConfig(updateParams);
    if (!repoValidation.valid) {
      const errors = repoValidation.errors.map(error => ({
        field: 'config',
        message: error,
      }));

      reqLogger.warn('配置业务验证失败', { errors: repoValidation.errors });
      return validationErrorResponse(errors);
    }

    reqLogger.debug('配置验证通过', { updateFields: Object.keys(updateParams) });

    // 更新配置
    const updatedConfig = await configRepository.updateConfig(repository, updateParams);

    reqLogger.info('配置更新成功', { 
      configId: updatedConfig.id,
      updatedFields: Object.keys(updateParams),
      pollingEnabled: updatedConfig.pollingEnabled 
    });

    return successResponse(sanitizeConfig(updatedConfig), '配置更新成功');
  });
}

/**
 * POST /api/config - 创建默认配置
 * 
 * 查询参数:
 * - repository: 仓库名称 (必填)
 * 
 * 响应:
 * - 201: 创建成功，返回默认配置
 * - 400: 参数错误
 * - 409: 配置已存在
 * - 500: 服务器错误
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateApiRouteSimple(request, {
    requiredPermissions: [Permission.CONFIG_WRITE],
  });
  
  if (auth instanceof NextResponse) {
    return auth;
  }

  return handleApiRequest(async () => {
    const searchParams = request.nextUrl.searchParams;
    const repository = searchParams.get('repository');

    if (!repository) {
      throw new ApiError(ApiCode.MISSING_REQUIRED_FIELD, '缺少 repository 参数');
    }

    const reqLogger = logger.child({ 
      operation: 'createDefaultConfig',
      repository,
      requestId: auth.requestId,
      userId: auth.user.id,
    });

    reqLogger.info('开始创建默认配置');

    // 检查配置是否已存在
    const existingConfig = await configRepository.getConfig(repository);
    if (existingConfig) {
      reqLogger.warn('配置已存在');
      throw new ApiError(ApiCode.COMMIT_ALREADY_PROCESSED, '该仓库的配置已存在');
    }

    // 创建默认配置
    const defaultConfig = await configRepository.createDefaultConfigWithoutEncryption(repository);

    reqLogger.info('默认配置创建成功', { 
      configId: defaultConfig.id 
    });

    return successResponse(sanitizeConfig(defaultConfig), '默认配置创建成功', 201);
  });
}

/**
 * DELETE /api/config - 删除配置
 * 
 * 查询参数:
 * - repository: 仓库名称 (必填)
 * 
 * 响应:
 * - 200: 删除成功
 * - 400: 参数错误
 * - 404: 配置不存在
 * - 500: 服务器错误
 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateApiRouteSimple(request, {
    requiredPermissions: [Permission.CONFIG_WRITE],
  });
  
  if (auth instanceof NextResponse) {
    return auth;
  }

  return handleApiRequest(async () => {
    const searchParams = request.nextUrl.searchParams;
    const repository = searchParams.get('repository');

    if (!repository) {
      throw new ApiError(ApiCode.MISSING_REQUIRED_FIELD, '缺少 repository 参数');
    }

    const reqLogger = logger.child({ 
      operation: 'deleteConfig',
      repository,
      requestId: auth.requestId,
      userId: auth.user.id,
    });

    reqLogger.info('开始删除配置');

    // 删除配置
    const deleted = await configRepository.deleteConfig(repository);

    if (!deleted) {
      reqLogger.warn('配置不存在');
      throw new ApiError(ApiCode.CONFIG_NOT_FOUND, '该仓库的配置不存在');
    }

    reqLogger.info('配置删除成功');

    return successResponse(null, '配置删除成功');
  });
}