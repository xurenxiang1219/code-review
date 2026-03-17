import mysql from 'mysql2/promise';
import { logger } from '@/lib/utils/logger';

/**
 * MySQL 连接配置
 */
interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
  acquireTimeout: number;
  timeout: number;
  reconnect: boolean;
  charset: string;
}

/**
 * 获取数据库配置
 * 从环境变量读取数据库连接参数
 */
function getDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ai_code_review',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
    acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '60000'),
    timeout: parseInt(process.env.DB_TIMEOUT || '60000'),
    reconnect: true,
    charset: 'utf8mb4',
  };
}

/**
 * MySQL 数据库客户端类
 */
class DatabaseClient {
  private static instance: DatabaseClient | null = null;
  private pool: mysql.Pool | null = null;
  private config: DatabaseConfig | null = null;

  private constructor() {
    // 不在构造函数中初始化配置，而是在 initialize 时初始化
  }

  /**
   * 获取数据库客户端实例（单例模式）
   */
  static getInstance(): DatabaseClient {
    if (!this.instance) {
      this.instance = new DatabaseClient();
    }
    return this.instance;
  }

  /**
   * 初始化连接池
   */
  async initialize(): Promise<void> {
    if (this.pool) {
      return;
    }

    // 在初始化时读取配置，确保环境变量已加载
    this.config = getDatabaseConfig();

    try {
      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        waitForConnections: true,
        connectionLimit: this.config.connectionLimit,
        queueLimit: 0,
        charset: this.config.charset,
        timezone: '+00:00',
        dateStrings: false,
        supportBigNumbers: true,
        bigNumberStrings: false,
      });

      // 测试连接
      await this.healthCheck();
      
      logger.info('MySQL 连接池初始化成功', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        connectionLimit: this.config.connectionLimit,
      });
    } catch (error) {
      logger.error('MySQL 连接池初始化失败', { 
        error: error instanceof Error ? error.message : String(error),
        config: {
          host: this.config.host,
          port: this.config.port,
          database: this.config.database,
        }
      });
      throw error;
    }
  }

  /**
   * 获取连接池
   */
  getPool(): mysql.Pool {
    if (!this.pool) {
      throw new Error('数据库连接池未初始化，请先调用 initialize() 方法');
    }
    return this.pool;
  }

  /**
   * 执行查询
   */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const pool = this.getPool();
    
    try {
      const startTime = Date.now();
      const [rows] = await pool.execute(sql, params);
      const duration = Date.now() - startTime;
      
      logger.debug('SQL 查询执行完成', {
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        params: params?.length ? `${params.length} 个参数` : '无参数',
        duration: `${duration}ms`,
        rowCount: Array.isArray(rows) ? rows.length : 0,
      });
      
      return rows as T[];
    } catch (error) {
      logger.error('SQL 查询执行失败', {
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        params: params?.length ? `${params.length} 个参数` : '无参数',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 执行单条查询（返回第一行）
   */
  async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * 执行插入/更新/删除操作
   */
  async execute(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
    const pool = this.getPool();
    
    try {
      const startTime = Date.now();
      const [result] = await pool.execute(sql, params);
      const duration = Date.now() - startTime;
      
      const resultHeader = result as mysql.ResultSetHeader;
      
      logger.debug('SQL 执行完成', {
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        params: params?.length ? `${params.length} 个参数` : '无参数',
        duration: `${duration}ms`,
        affectedRows: resultHeader.affectedRows,
        insertId: resultHeader.insertId,
      });
      
      return resultHeader;
    } catch (error) {
      logger.error('SQL 执行失败', {
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        params: params?.length ? `${params.length} 个参数` : '无参数',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 开始事务
   */
  async beginTransaction(): Promise<mysql.PoolConnection> {
    const pool = this.getPool();
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    logger.debug('数据库事务开始', { connectionId: connection.threadId });
    return connection;
  }

  /**
   * 提交事务
   */
  async commitTransaction(connection: mysql.PoolConnection): Promise<void> {
    try {
      await connection.commit();
      logger.debug('数据库事务提交', { connectionId: connection.threadId });
    } finally {
      connection.release();
    }
  }

  /**
   * 回滚事务
   */
  async rollbackTransaction(connection: mysql.PoolConnection): Promise<void> {
    try {
      await connection.rollback();
      logger.debug('数据库事务回滚', { connectionId: connection.threadId });
    } finally {
      connection.release();
    }
  }

  /**
   * 数据库健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.queryOne<{ result: number }>('SELECT 1 as result');
      const isHealthy = result?.result === 1;
      
      if (isHealthy) {
        logger.debug('数据库健康检查通过');
      } else {
        logger.warn('数据库健康检查失败：查询结果异常');
      }
      
      return isHealthy;
    } catch (error) {
      logger.error('数据库健康检查失败', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * 获取连接池状态
   * 注意：mysql2 库不提供实时连接数指标，仅返回配置信息
   */
  getPoolStatus(): { connectionLimit: number } {
    if (!this.pool || !this.config) {
      throw new Error('数据库连接池未初始化');
    }

    return {
      connectionLimit: this.config.connectionLimit,
    };
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('MySQL 连接池已关闭');
    }
  }
}

// 导出单例实例
export const db = DatabaseClient.getInstance();

// 导出类型
export type { DatabaseConfig };
export { DatabaseClient };