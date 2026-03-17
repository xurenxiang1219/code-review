import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  DataEncryption, 
  KeyManager, 
  SensitiveDataManager,
  SENSITIVE_FIELD_PREFIX 
} from '@/lib/utils/crypto';
import { ConfigEncryptionService } from '@/lib/services/config-encryption';
import { DatabaseEncryptionService } from '@/lib/services/database-encryption';

describe('敏感信息加密功能', () => {
  let dataEncryption: DataEncryption;
  let keyManager: KeyManager;
  let sensitiveDataManager: SensitiveDataManager;
  let configEncryptionService: ConfigEncryptionService;
  let databaseEncryptionService: DatabaseEncryptionService;

  const testPassword = 'test_encryption_key_32_characters_long';
  const testData = 'sensitive_information_to_encrypt';

  beforeEach(() => {
    dataEncryption = new DataEncryption();
    keyManager = new KeyManager();
    sensitiveDataManager = new SensitiveDataManager();
    configEncryptionService = new ConfigEncryptionService();
    databaseEncryptionService = new DatabaseEncryptionService();

    // 设置测试环境变量 - 使用不同的密钥来测试派生功能
    process.env.ENCRYPTION_KEY = testPassword;
    // 不设置专用密钥，让系统使用派生密钥
    delete process.env.DB_ENCRYPTION_KEY;
    delete process.env.CONFIG_ENCRYPTION_KEY;
    delete process.env.LOG_ENCRYPTION_KEY;
  });

  afterEach(() => {
    // 清理环境变量
    delete process.env.ENCRYPTION_KEY;
    delete process.env.DB_ENCRYPTION_KEY;
    delete process.env.CONFIG_ENCRYPTION_KEY;
    delete process.env.LOG_ENCRYPTION_KEY;
  });

  describe('DataEncryption 类', () => {
    it('应该能够加密和解密数据', () => {
      const encrypted = dataEncryption.encrypt(testData, testPassword);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(testData);

      const decrypted = dataEncryption.decrypt(encrypted, testPassword);
      expect(decrypted).toBe(testData);
    });

    it('应该在密码错误时抛出解密错误', () => {
      const encrypted = dataEncryption.encrypt(testData, testPassword);
      
      expect(() => {
        dataEncryption.decrypt(encrypted, 'wrong_password');
      }).toThrow('数据解密失败');
    });

    it('应该能够检测加密字段', () => {
      const plainText = 'plain_text';
      const encryptedText = SENSITIVE_FIELD_PREFIX + 'encrypted_data';

      expect(dataEncryption.isEncrypted(plainText)).toBe(false);
      expect(dataEncryption.isEncrypted(encryptedText)).toBe(true);
    });

    it('应该能够批量加密对象中的敏感字段', () => {
      const testObj = {
        username: 'testuser',
        password: 'secret123',
        apiKey: 'api_key_123',
        normalField: 'normal_value',
      };

      const sensitiveFields = ['password', 'apiKey'];
      const encrypted = dataEncryption.encryptSensitiveFields(testObj, sensitiveFields, testPassword);

      expect(encrypted.username).toBe(testObj.username);
      expect(encrypted.normalField).toBe(testObj.normalField);
      expect(encrypted.password).toContain(SENSITIVE_FIELD_PREFIX);
      expect(encrypted.apiKey).toContain(SENSITIVE_FIELD_PREFIX);
    });

    it('应该能够批量解密对象中的敏感字段', () => {
      const testObj = {
        username: 'testuser',
        password: 'secret123',
        apiKey: 'api_key_123',
        normalField: 'normal_value',
      };

      const sensitiveFields = ['password', 'apiKey'];
      const encrypted = dataEncryption.encryptSensitiveFields(testObj, sensitiveFields, testPassword);
      const decrypted = dataEncryption.decryptSensitiveFields(encrypted, sensitiveFields, testPassword);

      expect(decrypted).toEqual(testObj);
    });

    it('应该能够验证加密数据的完整性', () => {
      const encrypted = dataEncryption.encrypt(testData, testPassword);
      
      expect(dataEncryption.validateEncryptedData(encrypted, testPassword)).toBe(true);
      expect(dataEncryption.validateEncryptedData(encrypted, 'wrong_password')).toBe(false);
      expect(dataEncryption.validateEncryptedData('invalid_data', testPassword)).toBe(false);
    });

    it('应该能够重新加密数据（密钥轮换）', () => {
      const oldPassword = 'old_password_32_characters_long';
      const newPassword = 'new_password_32_characters_long';
      
      const encrypted = dataEncryption.encrypt(testData, oldPassword);
      const reencrypted = dataEncryption.reencrypt(encrypted, oldPassword, newPassword);
      
      expect(reencrypted).not.toBe(encrypted);
      expect(dataEncryption.decrypt(reencrypted, newPassword)).toBe(testData);
    });
  });

  describe('KeyManager 类', () => {
    it('应该能够获取主加密密钥', () => {
      const masterKey = keyManager.getMasterKey();
      expect(masterKey).toBe(testPassword);
    });

    it('应该在未配置主密钥时抛出错误', () => {
      delete process.env.ENCRYPTION_KEY;
      
      expect(() => {
        keyManager.getMasterKey();
      }).toThrow('主加密密钥未配置');
    });

    it('应该在密钥长度不足时抛出错误', () => {
      process.env.ENCRYPTION_KEY = 'short_key';
      
      expect(() => {
        keyManager.getMasterKey();
      }).toThrow('主加密密钥长度必须至少为32个字符');
    });

    it('应该能够派生不同类型的密钥', () => {
      const dbKey = keyManager.getDatabaseKey();
      const configKey = keyManager.getConfigKey();
      const logKey = keyManager.getLogKey();

      expect(dbKey).toBeDefined();
      expect(configKey).toBeDefined();
      expect(logKey).toBeDefined();
      expect(dbKey).not.toBe(configKey);
      expect(configKey).not.toBe(logKey);
    });

    it('应该能够生成随机密钥', () => {
      const key1 = keyManager.generateKey();
      const key2 = keyManager.generateKey();

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2);
      expect(key1.length).toBeGreaterThan(40); // Base64 编码后的长度
    });

    it('应该能够验证密钥强度', () => {
      const weakKey = 'weak';
      const strongKey = 'Strong_Password_123!@#_32_chars_min';

      const weakResult = keyManager.validateKeyStrength(weakKey);
      const strongResult = keyManager.validateKeyStrength(strongKey);

      expect(weakResult.valid).toBe(false);
      expect(weakResult.message).toContain('长度');

      expect(strongResult.valid).toBe(true);
    });

    it('应该能够判断密钥是否需要轮换', () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25小时前
      const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1小时前

      expect(keyManager.shouldRotateKey(oldDate)).toBe(true);
      expect(keyManager.shouldRotateKey(recentDate)).toBe(false);
    });
  });

  describe('SensitiveDataManager 类', () => {
    it('应该能够脱敏敏感信息用于日志记录', () => {
      const testObj = {
        username: 'testuser',
        password: 'secret123',
        apiKey: 'very_long_api_key_for_testing',
        token: 'short',
        normalField: 'normal_value',
      };

      const sanitized = sensitiveDataManager.sanitizeForLogging(testObj);

      expect(sanitized.username).toBe(testObj.username);
      expect(sanitized.normalField).toBe(testObj.normalField);
      expect(sanitized.password).toBe('se***23'); // secret123 -> se***23
      expect(sanitized.apiKey).toBe('very***ting');
      expect(sanitized.token).toBe('***');
    });

    it('应该能够识别和标记加密字段', () => {
      const testObj = {
        normalField: 'normal_value',
        encryptedField: SENSITIVE_FIELD_PREFIX + 'encrypted_data',
      };

      const sanitized = sensitiveDataManager.sanitizeForLogging(testObj);

      expect(sanitized.normalField).toBe(testObj.normalField);
      expect(sanitized.encryptedField).toBe('[ENCRYPTED]');
    });

    it('应该能够处理嵌套对象的脱敏', () => {
      const testObj = {
        user: {
          name: 'testuser',
          credentials: {
            password: 'secret123',
            apiKey: 'api_key_123',
          },
        },
        config: {
          database: {
            password: 'db_password',
          },
        },
      };

      const sanitized = sensitiveDataManager.sanitizeForLogging(testObj);

      expect(sanitized.user.name).toBe(testObj.user.name);
      expect(sanitized.user.credentials.password).toBe('se***23'); // secret123 -> se***23
      expect(sanitized.user.credentials.apiKey).toBe('ap***23'); // api_key_123 -> ap***23
      expect(sanitized.config.database.password).toBe('db***rd'); // db_password -> db***rd
    });
  });

  describe('ConfigEncryptionService 类', () => {
    it('应该能够加密和解密配置对象', () => {
      const testConfig = {
        aiModel: {
          provider: 'openai',
          model: 'gpt-4',
          apiKey: 'sk-test-api-key-123',
        },
        git: {
          accessToken: 'github_token_123',
          webhookSecret: 'webhook_secret_123',
        },
        normalField: 'normal_value',
      };

      const encrypted = configEncryptionService.encryptConfig(testConfig);
      expect(encrypted.normalField).toBe(testConfig.normalField);
      expect(encrypted.aiModel.provider).toBe(testConfig.aiModel.provider);
      expect(encrypted.aiModel.apiKey).toContain(SENSITIVE_FIELD_PREFIX);

      const decrypted = configEncryptionService.decryptConfig(encrypted);
      expect(decrypted).toEqual(testConfig);
    });

    it('应该能够验证配置完整性', () => {
      const testConfig = {
        aiModel: {
          apiKey: 'sk-test-api-key-123',
        },
      };

      const encrypted = configEncryptionService.encryptConfig(testConfig);
      const validation = configEncryptionService.validateConfigIntegrity(encrypted);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('应该能够获取配置的安全摘要', () => {
      const testConfig = {
        aiModel: {
          provider: 'openai',
          apiKey: 'sk-test-api-key-123',
        },
        normalField: 'normal_value',
      };

      const summary = configEncryptionService.getConfigSummary(testConfig);

      expect(summary.normalField).toBe(testConfig.normalField);
      expect(summary.aiModel.provider).toBe(testConfig.aiModel.provider);
      expect(summary.aiModel.apiKey).toBe('sk-t***-123'); // sk-test-api-key-123 -> sk-t***-123
    });
  });

  describe('DatabaseEncryptionService 类', () => {
    it('应该能够加密和解密数据库记录', () => {
      const testRecord = {
        id: '123',
        ai_model_config: JSON.stringify({
          provider: 'openai',
          apiKey: 'sk-test-api-key-123',
        }),
        notification_config: JSON.stringify({
          smtp: {
            password: 'smtp_password_123',
          },
        }),
        normalField: 'normal_value',
      };

      const encrypted = databaseEncryptionService.encryptRecord('review_config', testRecord);
      expect(encrypted.id).toBe(testRecord.id);
      expect(encrypted.normalField).toBe(testRecord.normalField);
      expect(encrypted.ai_model_config).toContain(SENSITIVE_FIELD_PREFIX);

      const decrypted = databaseEncryptionService.decryptRecord('review_config', encrypted);
      expect(decrypted).toEqual(testRecord);
    });

    it('应该能够批量处理数据库记录', () => {
      const testRecords = [
        {
          id: '1',
          ai_model_config: JSON.stringify({ apiKey: 'key1' }),
        },
        {
          id: '2',
          ai_model_config: JSON.stringify({ apiKey: 'key2' }),
        },
      ];

      const encrypted = databaseEncryptionService.encryptRecords('review_config', testRecords);
      const decrypted = databaseEncryptionService.decryptRecords('review_config', encrypted);

      expect(decrypted).toEqual(testRecords);
    });

    it('应该能够验证记录的加密完整性', () => {
      const testRecord = {
        id: '123',
        ai_model_config: JSON.stringify({ apiKey: 'sk-test-key' }),
      };

      const encrypted = databaseEncryptionService.encryptRecord('review_config', testRecord);
      const validation = databaseEncryptionService.validateRecordIntegrity('review_config', encrypted);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('应该能够获取记录的安全摘要', () => {
      const testRecord = {
        id: '123',
        ai_model_config: JSON.stringify({
          provider: 'openai',
          apiKey: 'sk-test-api-key-123',
        }),
      };

      const summary = databaseEncryptionService.getRecordSummary('review_config', testRecord);

      expect(summary.id).toBe(testRecord.id);
      expect(summary.ai_model_config).toContain('***');
    });

    it('应该能够管理表的加密配置', () => {
      const tableName = 'test_table';
      const sensitiveFields = ['password', 'token'];

      databaseEncryptionService.addTableConfig(tableName, sensitiveFields);
      
      const config = databaseEncryptionService.getTableConfig(tableName);
      expect(config).toEqual(sensitiveFields);

      databaseEncryptionService.removeTableConfig(tableName);
      
      const removedConfig = databaseEncryptionService.getTableConfig(tableName);
      expect(removedConfig).toEqual([]);
    });
  });

  describe('集成测试', () => {
    it('应该能够完整地处理配置的加密存储和读取流程', () => {
      const originalConfig = {
        aiModel: {
          provider: 'openai',
          model: 'gpt-4',
          apiKey: 'sk-test-api-key-123',
          temperature: 0.3,
        },
        git: {
          repository: 'test/repo',
          accessToken: 'github_token_123',
          webhookSecret: 'webhook_secret_123',
        },
        notification: {
          email: {
            enabled: true,
            smtpPassword: 'smtp_password_123',
          },
        },
      };

      // 1. 加密配置
      const encryptedConfig = configEncryptionService.encryptConfig(originalConfig);
      
      // 2. 验证敏感字段已加密
      expect(encryptedConfig.aiModel.provider).toBe(originalConfig.aiModel.provider);
      expect(encryptedConfig.aiModel.temperature).toBe(originalConfig.aiModel.temperature);
      expect(encryptedConfig.aiModel.apiKey).toContain(SENSITIVE_FIELD_PREFIX);
      expect(encryptedConfig.git.repository).toBe(originalConfig.git.repository);
      expect(encryptedConfig.git.accessToken).toContain(SENSITIVE_FIELD_PREFIX);

      // 3. 解密配置
      const decryptedConfig = configEncryptionService.decryptConfig(encryptedConfig);
      
      // 4. 验证解密后的数据完整性
      expect(decryptedConfig).toEqual(originalConfig);

      // 5. 验证日志脱敏
      const logSummary = configEncryptionService.getConfigSummary(originalConfig);
      expect(logSummary.aiModel.apiKey).toBe('sk-t***-123'); // sk-test-api-key-123 -> sk-t***-123
      expect(logSummary.git.accessToken).toBe('gith***_123'); // github_token_123 -> gith***_123
    });

    it('应该能够处理密钥轮换场景', () => {
      const testData = 'sensitive_data_for_rotation';
      const oldPassword = 'old_password_32_characters_long';
      const newPassword = 'new_password_32_characters_long';

      // 1. 使用旧密钥加密
      const encrypted = dataEncryption.encrypt(testData, oldPassword);
      
      // 2. 密钥轮换
      const reencrypted = dataEncryption.reencrypt(encrypted, oldPassword, newPassword);
      
      // 3. 验证新密钥可以解密
      const decrypted = dataEncryption.decrypt(reencrypted, newPassword);
      expect(decrypted).toBe(testData);
      
      // 4. 验证旧密钥无法解密新数据
      expect(() => {
        dataEncryption.decrypt(reencrypted, oldPassword);
      }).toThrow();
    });
  });
});