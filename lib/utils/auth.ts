import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import type { 
  JWTPayload, 
  AuthUser, 
  AuthResult, 
  ApiKeyInfo 
} from '@/types/auth';
import { UserRole, Permission } from '@/types/auth';
import { logger } from './logger';

/**
 * JWT 工具类
 */
export class JWTUtils {
  private static secret: string;
  private static issuer: string;
  private static audience: string;

  /**
   * 初始化 JWT 配置
   */
  static init(secret: string, issuer: string, audience: string) {
    this.secret = secret;
    this.issuer = issuer;
    this.audience = audience;
  }

  /**
   * 生成 JWT Token
   * @param payload - JWT 载荷
   * @param expiresIn - 过期时间（默认 24 小时）
   * @returns JWT Token
   */
  static generateToken(
    payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>,
    expiresIn: string = '24h'
  ): string {
    const now = Math.floor(Date.now() / 1000);
    
    const fullPayload: JWTPayload = {
      ...payload,
      iat: now,
      exp: now + this.parseExpiresIn(expiresIn),
      iss: this.issuer,
      aud: this.audience,
    };

    return jwt.sign(fullPayload, this.secret, { algorithm: 'HS256' });
  }

  /**
   * 验证 JWT Token
   * @param token - JWT Token
   * @returns 验证结果
   */
  static verifyToken(token: string): AuthResult {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      }) as JWTPayload;

      const user: AuthUser = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        permissions: decoded.permissions,
        authMethod: 'jwt',
      };

      return { success: true, user };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof jwt.TokenExpiredError) {
        return { 
          success: false, 
          error: 'Token 已过期', 
          errorCode: 'TOKEN_EXPIRED' 
        };
      }
      
      if (error instanceof jwt.JsonWebTokenError) {
        return { 
          success: false, 
          error: 'Token 无效', 
          errorCode: 'INVALID_TOKEN' 
        };
      }

      return { 
        success: false, 
        error: errorMessage, 
        errorCode: 'TOKEN_VERIFICATION_FAILED' 
      };
    }
  }
  /**
   * 解析过期时间字符串为秒数
   * @param expiresIn - 过期时间字符串（如 '24h', '7d', '30m'）
   * @returns 秒数
   */
  private static parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`无效的过期时间格式: ${expiresIn}`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    return value * multipliers[unit as keyof typeof multipliers];
  }
}

/**
 * API Key 工具类
 */
export class ApiKeyUtils {
  /**
   * 生成 API Key
   * @param prefix - 前缀（可选）
   * @returns API Key
   */
  static generateApiKey(prefix: string = 'ak'): string {
    const randomPart = randomBytes(32).toString('hex');
    return `${prefix}_${randomPart}`;
  }

  /**
   * 哈希 API Key
   * @param apiKey - 原始 API Key
   * @returns 哈希后的 API Key
   */
  static hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * 验证 API Key
   * @param apiKey - 原始 API Key
   * @param hashedKey - 哈希后的 API Key
   * @returns 是否匹配
   */
  static verifyApiKey(apiKey: string, hashedKey: string): boolean {
    const computedHash = this.hashApiKey(apiKey);
    return computedHash === hashedKey;
  }
}

/**
 * 密码工具类
 */
export class PasswordUtils {
  private static readonly SALT_ROUNDS = 12;

  /**
   * 哈希密码
   * @param password - 原始密码
   * @returns 哈希后的密码
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * 验证密码
   * @param password - 原始密码
   * @param hashedPassword - 哈希后的密码
   * @returns 是否匹配
   */
  static async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  /**
   * 生成随机密码
   * @param length - 密码长度（默认 16）
   * @returns 随机密码
   */
  static generateRandomPassword(length: number = 16): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }
    
    return password;
  }
}

/**
 * 权限检查工具类
 */
export class PermissionUtils {
  /**
   * 检查用户是否具有指定权限
   * @param user - 用户信息
   * @param requiredPermission - 所需权限
   * @returns 是否具有权限
   */
  static hasPermission(user: AuthUser, requiredPermission: Permission): boolean {
    // 管理员拥有所有权限
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    // 检查用户权限列表
    return user.permissions.includes(requiredPermission);
  }

  /**
   * 检查用户是否具有任一权限
   * @param user - 用户信息
   * @param permissions - 权限列表
   * @returns 是否具有任一权限
   */
  static hasAnyPermission(user: AuthUser, permissions: Permission[]): boolean {
    return permissions.some(permission => this.hasPermission(user, permission));
  }

  /**
   * 检查用户是否具有所有权限
   * @param user - 用户信息
   * @param permissions - 权限列表
   * @returns 是否具有所有权限
   */
  static hasAllPermissions(user: AuthUser, permissions: Permission[]): boolean {
    return permissions.every(permission => this.hasPermission(user, permission));
  }

  /**
   * 根据角色获取默认权限
   * @param role - 用户角色
   * @returns 权限列表
   */
  static getDefaultPermissions(role: UserRole): Permission[] {
    switch (role) {
      case UserRole.ADMIN:
        return Object.values(Permission);
      
      case UserRole.DEVELOPER:
        return [
          Permission.REVIEW_READ,
          Permission.REVIEW_WRITE,
          Permission.CONFIG_READ,
          Permission.CONFIG_WRITE,
          Permission.HEALTH_CHECK,
        ];
      
      case UserRole.VIEWER:
        return [
          Permission.REVIEW_READ,
          Permission.CONFIG_READ,
          Permission.HEALTH_CHECK,
        ];
      
      case UserRole.SYSTEM:
        return [
          Permission.WEBHOOK_RECEIVE,
          Permission.REVIEW_WRITE,
          Permission.HEALTH_CHECK,
        ];
      
      default:
        return [];
    }
  }
}

/**
 * 安全工具类
 */
export class SecurityUtils {
  /**
   * 生成安全的随机字符串
   * @param length - 字符串长度
   * @returns 随机字符串
   */
  static generateSecureRandom(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * 验证邮箱格式
   * @param email - 邮箱地址
   * @returns 是否有效
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * 验证密码强度
   * @param password - 密码
   * @returns 验证结果
   */
  static validatePasswordStrength(password: string): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('密码长度至少 8 位');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('密码必须包含大写字母');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('密码必须包含小写字母');
    }

    if (!/\d/.test(password)) {
      errors.push('密码必须包含数字');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('密码必须包含特殊字符');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 清理敏感信息
   * @param obj - 对象
   * @param sensitiveFields - 敏感字段列表
   * @returns 清理后的对象
   */
  static sanitizeSensitiveData<T extends Record<string, any>>(
    obj: T,
    sensitiveFields: string[] = ['password', 'token', 'apiKey', 'secret']
  ): T {
    const sanitized = { ...obj };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}

/**
 * 初始化认证工具
 */
export function initializeAuth() {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtIssuer = process.env.JWT_ISSUER || 'ai-code-review-system';
  const jwtAudience = process.env.JWT_AUDIENCE || 'ai-code-review-api';

  if (!jwtSecret) {
    throw new Error('JWT_SECRET 环境变量未设置');
  }

  JWTUtils.init(jwtSecret, jwtIssuer, jwtAudience);
  
  logger.info('认证系统初始化完成', {
    issuer: jwtIssuer,
    audience: jwtAudience,
  });
}

/**
 * 验证 API Key（从请求中提取并验证）
 * @param request - Next.js 请求对象
 * @returns 验证结果，包含 valid 标志和权限信息
 */
export async function verifyApiKey(request: Request): Promise<{
  valid: boolean;
  apiKey?: string;
  permissions?: string[];
  error?: string;
}> {
  try {
    // 从请求头中提取 API Key
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return { valid: false, error: '缺少 Authorization 头' };
    }

    // 支持 Bearer token 格式
    const apiKey = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    if (!apiKey) {
      return { valid: false, error: 'API Key 为空' };
    }

    // 验证 API Key（这里需要从数据库或配置中验证）
    // 简化实现：检查环境变量中的管理员 API Key
    const adminApiKey = process.env.ADMIN_API_KEY;
    
    if (apiKey === adminApiKey) {
      return {
        valid: true,
        apiKey,
        permissions: ['encryption:read', 'encryption:write', 'monitoring:read', 'monitoring:write'],
      };
    }

    return { valid: false, error: 'API Key 无效' };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : '验证失败' 
    };
  }
}
