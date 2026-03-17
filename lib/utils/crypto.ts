import crypto from 'crypto';
import { logger } from '@/lib/utils/logger';

/**
 * 签名算法枚举
 */
export enum SignatureAlgorithm {
  SHA1 = 'sha1',
  SHA256 = 'sha256',
  SHA512 = 'sha512',
}

/**
 * 签名验证结果
 */
export interface SignatureVerificationResult {
  /** 是否验证成功 */
  valid: boolean;
  /** 错误消息（验证失败时） */
  error?: string;
}

/**
 * Webhook 签名验证器
 */
export class WebhookSignatureVerifier {
  private readonly secret: string;
  private readonly algorithm: SignatureAlgorithm;

  constructor(secret: string, algorithm: SignatureAlgorithm = SignatureAlgorithm.SHA256) {
    if (!secret) {
      throw new Error('Webhook secret is required');
    }
    this.secret = secret;
    this.algorithm = algorithm;
  }

  /**
   * 验证 Webhook 签名
   * 
   * @param payload - 请求体内容
   * @param signature - 签名字符串
   * @returns 验证结果
   */
  verify(payload: string | Buffer, signature: string): SignatureVerificationResult {
    try {
      if (!signature) {
        return {
          valid: false,
          error: '签名不能为空',
        };
      }

      // 计算期望的签名
      const expectedSignature = this.generateSignature(payload);
      
      // 安全比较签名
      const isValid = this.safeCompare(signature, expectedSignature);
      
      if (!isValid) {
        logger.security('Webhook signature verification failed', {
          providedSignature: this.maskSignature(signature),
          expectedSignature: this.maskSignature(expectedSignature),
          algorithm: this.algorithm,
        });
        
        return {
          valid: false,
          error: '签名验证失败',
        };
      }

      logger.debug('Webhook signature verified successfully', {
        algorithm: this.algorithm,
      });

      return { valid: true };
    } catch (error) {
      logger.error('Webhook signature verification error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        algorithm: this.algorithm,
      });

      return {
        valid: false,
        error: '签名验证过程中发生错误',
      };
    }
  }

  /**
   * 生成签名
   * @param payload - 请求体内容
   * @returns 签名字符串
   */
  generateSignature(payload: string | Buffer): string {
    const hmac = crypto.createHmac(this.algorithm, this.secret);
    hmac.update(payload);
    return `${this.algorithm}=${hmac.digest('hex')}`;
  }

  /**
   * 安全比较两个签名字符串
   * 使用时间常数比较，防止时序攻击
   * @param provided - 提供的签名
   * @param expected - 期望的签名
   * @returns 是否相等
   */
  private safeCompare(provided: string, expected: string): boolean {
    if (provided.length !== expected.length) {
      return false;
    }

    // 使用 crypto.timingSafeEqual 进行时间常数比较
    const providedBuffer = Buffer.from(provided, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    try {
      return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * 掩码签名用于日志记录
   * @param signature - 原始签名
   * @returns 掩码后的签名
   */
  private maskSignature(signature: string): string {
    if (signature.length <= 10) {
      return '***';
    }
    return `${signature.substring(0, 5)}***${signature.substring(signature.length - 5)}`;
  }
}

/**
 * GitHub Webhook 签名验证器
 * 专门用于验证 GitHub 的 X-Hub-Signature-256 头
 */
export class GitHubWebhookVerifier extends WebhookSignatureVerifier {
  constructor(secret: string) {
    super(secret, SignatureAlgorithm.SHA256);
  }

  /**
   * 验证 GitHub Webhook 签名
   * @param payload - 请求体内容
   * @param signature - X-Hub-Signature-256 头的值（格式：sha256=xxx）
   * @returns 验证结果
   */
  verifyGitHubSignature(payload: string | Buffer, signature: string): SignatureVerificationResult {
    // GitHub 的签名格式是 "sha256=<hash>"
    if (!signature.startsWith('sha256=')) {
      return {
        valid: false,
        error: 'GitHub 签名格式错误，应以 "sha256=" 开头',
      };
    }

    // 直接调用父类的 verify 方法，它会生成带前缀的签名进行比较
    return this.verify(payload, signature);
  }
}

/**
 * GitLab Webhook 签名验证器
 * 专门用于验证 GitLab 的 X-Gitlab-Token 头
 */
export class GitLabWebhookVerifier {
  private readonly token: string;

  constructor(token: string) {
    if (!token) {
      throw new Error('GitLab token is required');
    }
    this.token = token;
  }

  /**
   * 验证 GitLab Webhook Token
   * @param providedToken - X-Gitlab-Token 头的值
   * @returns 验证结果
   */
  verifyGitLabToken(providedToken: string): SignatureVerificationResult {
    try {
      if (!providedToken) {
        return {
          valid: false,
          error: 'GitLab token 不能为空',
        };
      }

      // 使用时间常数比较
      const providedBuffer = Buffer.from(providedToken, 'utf8');
      const expectedBuffer = Buffer.from(this.token, 'utf8');

      if (providedBuffer.length !== expectedBuffer.length) {
        return {
          valid: false,
          error: 'GitLab token 验证失败',
        };
      }

      const isValid = crypto.timingSafeEqual(providedBuffer, expectedBuffer);

      if (!isValid) {
        logger.security('GitLab token verification failed', {
          providedToken: this.maskToken(providedToken),
        });

        return {
          valid: false,
          error: 'GitLab token 验证失败',
        };
      }

      logger.debug('GitLab token verified successfully');
      return { valid: true };
    } catch (error) {
      logger.error('GitLab token verification error', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        valid: false,
        error: 'Token 验证过程中发生错误',
      };
    }
  }

  /**
   * 掩码 Token 用于日志记录
   * @param token - 原始 Token
   * @returns 掩码后的 Token
   */
  private maskToken(token: string): string {
    if (token.length <= 8) {
      return '***';
    }
    return `${token.substring(0, 4)}***${token.substring(token.length - 4)}`;
  }
}

/**
 * 敏感字段标识符
 */
export const SENSITIVE_FIELD_PREFIX = 'enc:';

/**
 * 敏感字段配置
 */
export interface SensitiveFieldConfig {
  /** 字段名称 */
  fieldName: string;
  /** 是否必须加密 */
  required: boolean;
  /** 加密算法 */
  algorithm?: string;
}

/**
 * 数据加密工具类
 * 提供完整的敏感信息加密、解密和管理功能
 */
export class DataEncryption {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits
  private readonly saltLength = 16; // 128 bits

  /**
   * 生成加密密钥
   * @param password - 密码
   * @param salt - 盐值
   * @returns 密钥
   */
  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, 100000, this.keyLength, 'sha256');
  }

  /**
   * 加密数据
   * @param data - 要加密的数据
   * @param password - 加密密码
   * @returns 加密结果（包含盐值、IV、标签和密文）
   */
  encrypt(data: string, password: string): string {
    try {
      if (!data || !password) {
        throw new Error('数据和密码不能为空');
      }

      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      const key = this.deriveKey(password, salt);
      
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      const result = Buffer.concat([salt, iv, tag, Buffer.from(encrypted, 'hex')]);
      
      return result.toString('base64');
    } catch (error) {
      logger.error('Data encryption failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('数据加密失败');
    }
  }

  /**
   * 解密数据
   * @param encryptedData - 加密的数据
   * @param password - 解密密码
   * @returns 解密后的数据
   */
  decrypt(encryptedData: string, password: string): string {
    try {
      if (!encryptedData || !password) {
        throw new Error('加密数据和密码不能为空');
      }

      const data = Buffer.from(encryptedData, 'base64');
      
      if (data.length < this.saltLength + this.ivLength + this.tagLength) {
        throw new Error('加密数据格式无效');
      }

      const salt = data.subarray(0, this.saltLength);
      const iv = data.subarray(this.saltLength, this.saltLength + this.ivLength);
      const tag = data.subarray(this.saltLength + this.ivLength, this.saltLength + this.ivLength + this.tagLength);
      const encrypted = data.subarray(this.saltLength + this.ivLength + this.tagLength);
      
      const key = this.deriveKey(password, salt);
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Data decryption failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('数据解密失败');
    }
  }

  /**
   * 批量加密对象中的敏感字段
   * @param obj - 要加密的对象
   * @param sensitiveFields - 敏感字段列表
   * @param password - 加密密码
   * @returns 加密后的对象
   */
  encryptSensitiveFields<T extends Record<string, any>>(
    obj: T,
    sensitiveFields: string[],
    password: string
  ): T {
    const encrypted = { ...obj };

    for (const field of sensitiveFields) {
      if (!(field in encrypted) || encrypted[field] == null) {
        continue;
      }

      // 对象类型序列化为JSON字符串，其他类型转为字符串
      const value = typeof encrypted[field] === 'object' 
        ? JSON.stringify(encrypted[field])
        : String(encrypted[field]);
      
      if (value && !this.isEncrypted(value)) {
        encrypted[field] = SENSITIVE_FIELD_PREFIX + this.encrypt(value, password);
      }
    }

    return encrypted;
  }

  /**
   * 批量解密对象中的敏感字段
   * @param obj - 要解密的对象
   * @param sensitiveFields - 敏感字段列表
   * @param password - 解密密码
   * @returns 解密后的对象
   */
  decryptSensitiveFields<T extends Record<string, any>>(
    obj: T,
    sensitiveFields: string[],
    password: string
  ): T {
    const decrypted = { ...obj };

    for (const field of sensitiveFields) {
      if (!(field in decrypted) || decrypted[field] == null) {
        continue;
      }

      const value = String(decrypted[field]);
      if (!this.isEncrypted(value)) {
        continue;
      }

      try {
        const encryptedData = value.substring(SENSITIVE_FIELD_PREFIX.length);
        const decryptedValue = this.decrypt(encryptedData, password);
        
        // 尝试解析为JSON对象，失败则保持字符串
        try {
          decrypted[field] = JSON.parse(decryptedValue);
        } catch {
          decrypted[field] = decryptedValue;
        }
      } catch (error) {
        logger.error(`解密字段失败: ${field}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        // 保持原值，避免系统崩溃
        decrypted[field] = value;
      }
    }

    return decrypted;
  }

  /**
   * 检查字符串是否已加密
   * @param value - 要检查的值
   * @returns 是否已加密
   */
  isEncrypted(value: string): boolean {
    return value.startsWith(SENSITIVE_FIELD_PREFIX);
  }

  /**
   * 验证加密数据的完整性
   * @param encryptedData - 加密数据
   * @param password - 密码
   * @returns 是否有效
   */
  validateEncryptedData(encryptedData: string, password: string): boolean {
    try {
      this.decrypt(encryptedData, password);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 重新加密数据（用于密钥轮换）
   * @param encryptedData - 旧的加密数据
   * @param oldPassword - 旧密码
   * @param newPassword - 新密码
   * @returns 新的加密数据
   */
  reencrypt(encryptedData: string, oldPassword: string, newPassword: string): string {
    const decrypted = this.decrypt(encryptedData, oldPassword);
    return this.encrypt(decrypted, newPassword);
  }
}

/**
 * 哈希工具函数
 */
export class HashUtils {
  /**
   * 计算字符串的 SHA256 哈希
   * @param data - 要哈希的数据
   * @returns 哈希值（十六进制）
   */
  static sha256(data: string): string {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * 计算字符串的 MD5 哈希
   * @param data - 要哈希的数据
   * @returns 哈希值（十六进制）
   */
  static md5(data: string): string {
    return crypto.createHash('md5').update(data, 'utf8').digest('hex');
  }

  /**
   * 生成随机字符串
   * @param length - 字符串长度
   * @returns 随机字符串
   */
  static generateRandomString(length: number): string {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  /**
   * 生成 UUID v4
   * @returns UUID 字符串
   */
  static generateUUID(): string {
    return crypto.randomUUID();
  }
}

/**
 * 密钥管理器
 * 负责密钥的生成、存储、轮换和管理
 */
export class KeyManager {
  private readonly keyCache = new Map<string, string>();
  private readonly keyRotationInterval = 24 * 60 * 60 * 1000; // 24小时

  /**
   * 获取主加密密钥
   * @returns 主密钥
   */
  getMasterKey(): string {
    const masterKey = process.env.ENCRYPTION_KEY || process.env.MASTER_ENCRYPTION_KEY;
    
    if (!masterKey) {
      throw new Error('主加密密钥未配置，请设置 ENCRYPTION_KEY 或 MASTER_ENCRYPTION_KEY 环境变量');
    }

    if (masterKey.length < 32) {
      throw new Error('主加密密钥长度必须至少为32个字符');
    }

    return masterKey;
  }

  /**
   * 获取数据库加密密钥
   * @returns 数据库密钥
   */
  getDatabaseKey(): string {
    const dbKey = process.env.DB_ENCRYPTION_KEY;
    
    if (dbKey) {
      if (dbKey.length < 32) {
        throw new Error('数据库加密密钥长度必须至少为32个字符');
      }
      return dbKey;
    }

    // 如果没有专门的数据库密钥，使用主密钥派生
    const masterKey = this.getMasterKey();
    return this.deriveKey(masterKey, 'database');
  }

  /**
   * 获取配置加密密钥
   * @returns 配置密钥
   */
  getConfigKey(): string {
    const configKey = process.env.CONFIG_ENCRYPTION_KEY;
    
    if (configKey) {
      if (configKey.length < 32) {
        throw new Error('配置加密密钥长度必须至少为32个字符');
      }
      return configKey;
    }

    // 如果没有专门的配置密钥，使用主密钥派生
    const masterKey = this.getMasterKey();
    return this.deriveKey(masterKey, 'config');
  }

  /**
   * 获取日志加密密钥
   * @returns 日志密钥
   */
  getLogKey(): string {
    const logKey = process.env.LOG_ENCRYPTION_KEY;
    
    if (logKey) {
      if (logKey.length < 32) {
        throw new Error('日志加密密钥长度必须至少为32个字符');
      }
      return logKey;
    }

    // 如果没有专门的日志密钥，使用主密钥派生
    const masterKey = this.getMasterKey();
    return this.deriveKey(masterKey, 'logs');
  }

  /**
   * 派生子密钥
   * @param masterKey - 主密钥
   * @param context - 上下文标识
   * @returns 派生的密钥
   */
  private deriveKey(masterKey: string, context: string): string {
    const salt = crypto.createHash('sha256').update(context).digest();
    const derivedKey = crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
    return derivedKey.toString('hex'); // 使用 hex 而不是 base64 确保长度一致
  }

  /**
   * 生成新的随机密钥
   * @param length - 密钥长度（字节）
   * @returns 新密钥
   */
  generateKey(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64');
  }

  /**
   * 验证密钥强度
   * @param key - 要验证的密钥
   * @returns 验证结果
   */
  validateKeyStrength(key: string): { valid: boolean; message?: string } {
    if (!key) {
      return { valid: false, message: '密钥不能为空' };
    }

    if (key.length < 32) {
      return { valid: false, message: '密钥长度必须至少为32个字符' };
    }

    // 检查密钥复杂度
    const hasLower = /[a-z]/.test(key);
    const hasUpper = /[A-Z]/.test(key);
    const hasNumber = /\d/.test(key);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(key);

    const complexityScore = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;

    if (complexityScore < 3) {
      return { 
        valid: false, 
        message: '密钥复杂度不足，应包含大小写字母、数字和特殊字符中的至少3种' 
      };
    }

    return { valid: true };
  }

  /**
   * 检查密钥是否需要轮换
   * @param keyCreatedAt - 密钥创建时间
   * @returns 是否需要轮换
   */
  shouldRotateKey(keyCreatedAt: Date): boolean {
    const now = new Date();
    const keyAge = now.getTime() - keyCreatedAt.getTime();
    return keyAge > this.keyRotationInterval;
  }

  /**
   * 清理密钥缓存
   */
  clearKeyCache(): void {
    this.keyCache.clear();
    logger.info('Key cache cleared');
  }
}

/**
 * 敏感信息管理器
 * 提供统一的敏感信息加密、解密和脱敏功能
 */
export class SensitiveDataManager {
  private readonly encryption: DataEncryption;
  private readonly keyManager: KeyManager;

  constructor() {
    this.encryption = new DataEncryption();
    this.keyManager = new KeyManager();
  }

  /**
   * 加密配置中的敏感字段
   * @param config - 配置对象
   * @param sensitiveFields - 敏感字段列表
   * @returns 加密后的配置
   */
  encryptConfig<T extends Record<string, any>>(
    config: T,
    sensitiveFields: string[] = this.getDefaultSensitiveFields()
  ): T {
    const configKey = this.keyManager.getConfigKey();
    return this.encryption.encryptSensitiveFields(config, sensitiveFields, configKey);
  }

  /**
   * 解密配置中的敏感字段
   * @param config - 加密的配置对象
   * @param sensitiveFields - 敏感字段列表
   * @returns 解密后的配置
   */
  decryptConfig<T extends Record<string, any>>(
    config: T,
    sensitiveFields: string[] = this.getDefaultSensitiveFields()
  ): T {
    const configKey = this.keyManager.getConfigKey();
    return this.encryption.decryptSensitiveFields(config, sensitiveFields, configKey);
  }

  /**
   * 加密数据库记录中的敏感字段
   * @param record - 数据库记录
   * @param sensitiveFields - 敏感字段列表
   * @returns 加密后的记录
   */
  encryptDatabaseRecord<T extends Record<string, any>>(
    record: T,
    sensitiveFields: string[]
  ): T {
    const dbKey = this.keyManager.getDatabaseKey();
    return this.encryption.encryptSensitiveFields(record, sensitiveFields, dbKey);
  }

  /**
   * 解密数据库记录中的敏感字段
   * @param record - 加密的数据库记录
   * @param sensitiveFields - 敏感字段列表
   * @returns 解密后的记录
   */
  decryptDatabaseRecord<T extends Record<string, any>>(
    record: T,
    sensitiveFields: string[]
  ): T {
    const dbKey = this.keyManager.getDatabaseKey();
    return this.encryption.decryptSensitiveFields(record, sensitiveFields, dbKey);
  }

  /**
   * 脱敏敏感信息用于日志记录
   * @param obj - 要脱敏的对象
   * @param sensitiveFields - 敏感字段列表
   * @returns 脱敏后的对象
   */
  sanitizeForLogging<T extends Record<string, any>>(
    obj: T,
    sensitiveFields: string[] = this.getDefaultSensitiveFields()
  ): T {
    const sanitized = { ...obj };

    const sanitizeValue = (value: any, key: string): any => {
      if (typeof value === 'string') {
        if (this.encryption.isEncrypted(value)) {
          return '[ENCRYPTED]';
        }
        
        // 检查是否为敏感字段
        const isSensitive = sensitiveFields.some(field => 
          key.toLowerCase().includes(field.toLowerCase())
        );
        
        if (isSensitive) {
          return this.maskSensitiveValue(value);
        }
        
        return value;
      }
      
      if (Array.isArray(value)) {
        return value.map((item, index) => sanitizeValue(item, `${key}[${index}]`));
      }
      
      if (value && typeof value === 'object') {
        const sanitizedObj: any = {};
        for (const [objKey, objValue] of Object.entries(value)) {
          sanitizedObj[objKey] = sanitizeValue(objValue, objKey);
        }
        return sanitizedObj;
      }
      
      return value;
    };

    for (const [key, value] of Object.entries(sanitized)) {
      sanitized[key] = sanitizeValue(value, key);
    }

    return sanitized;
  }

  /**
   * 掩码敏感值
   * @param value - 原始值
   * @returns 掩码后的值
   */
  private maskSensitiveValue(value: string): string {
    if (value.length <= 6) {
      return '***';
    }
    
    if (value.length <= 12) {
      return `${value.substring(0, 2)}***${value.substring(value.length - 2)}`;
    }
    
    return `${value.substring(0, 4)}***${value.substring(value.length - 4)}`;
  }

  /**
   * 获取默认的敏感字段列表
   * @returns 敏感字段数组
   */
  private getDefaultSensitiveFields(): string[] {
    return [
      'password',
      'token',
      'apiKey',
      'secret',
      'key',
      'accessToken',
      'refreshToken',
      'privateKey',
      'publicKey',
      'certificate',
      'smtpPassword',
      'dbPassword',
      'redisPassword',
      'webhookSecret',
      'jwtSecret',
      'encryptionKey',
      'masterKey',
    ];
  }

  /**
   * 轮换密钥
   * @param oldData - 使用旧密钥加密的数据
   * @param dataType - 数据类型（config、database、log）
   * @returns 使用新密钥加密的数据
   */
  rotateKey(oldData: string, dataType: 'config' | 'database' | 'log'): string {
    const oldKey = this.getOldKey(dataType);
    const newKey = this.getNewKey(dataType);
    
    return this.encryption.reencrypt(oldData, oldKey, newKey);
  }

  /**
   * 获取旧密钥（用于密钥轮换）
   * @param dataType - 数据类型
   * @returns 旧密钥
   */
  private getOldKey(dataType: string): string {
    // 这里应该从安全存储中获取旧密钥
    // 为了简化，暂时使用当前密钥
    switch (dataType) {
      case 'config':
        return this.keyManager.getConfigKey();
      case 'database':
        return this.keyManager.getDatabaseKey();
      case 'log':
        return this.keyManager.getLogKey();
      default:
        throw new Error(`未知的数据类型: ${dataType}`);
    }
  }

  /**
   * 获取新密钥（用于密钥轮换）
   * @param dataType - 数据类型
   * @returns 新密钥
   */
  private getNewKey(dataType: string): string {
    // 这里应该生成或获取新密钥
    // 为了简化，暂时生成新密钥
    return this.keyManager.generateKey();
  }
}

// 导出单例实例
export const keyManager = new KeyManager();
export const sensitiveDataManager = new SensitiveDataManager();

// 导出便捷函数
export const createGitHubVerifier = (secret: string) => new GitHubWebhookVerifier(secret);
export const createGitLabVerifier = (token: string) => new GitLabWebhookVerifier(token);
export const createDataEncryption = () => new DataEncryption();