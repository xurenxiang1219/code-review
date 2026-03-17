import RedisClient from './redis-client';
import { logger } from '@/lib/utils/logger';

/**
 * 缓存选项
 */
interface CacheOptions {
  ttl?: number; // 过期时间（秒）
  nx?: boolean; // 仅在键不存在时设置
  xx?: boolean; // 仅在键存在时设置
}

/**
 * 队列选项
 */
interface QueueOptions {
  maxLength?: number; // 队列最大长度
  trimStrategy?: 'MAXLEN' | 'MINID'; // 修剪策略
}

/**
 * Redis 工具函数集合
 */
export class RedisUtils {
  /**
   * 设置缓存
   */
  static async setCache(
    key: string,
    value: string | object,
    options: CacheOptions = {}
  ): Promise<void> {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (options.ttl) {
        if (options.nx) {
          await RedisClient.executeCommand('setex', key, options.ttl, serialized);
        } else {
          await RedisClient.executeCommand('setex', key, options.ttl, serialized);
        }
      } else {
        const setArgs = [key, serialized];
        if (options.nx) setArgs.push('NX');
        if (options.xx) setArgs.push('XX');
        
        await RedisClient.executeCommand('set', ...setArgs);
      }
      
      logger.debug('缓存设置成功', { key, ttl: options.ttl });
    } catch (error) {
      logger.error('缓存设置失败', { key, error });
      throw error;
    }
  }

  /**
   * 获取缓存
   */
  static async getCache<T = string>(key: string, parseJson = false): Promise<T | null> {
    try {
      const value = await RedisClient.executeCommand<string | null>('get', key);
      
      if (!value) {
        return null;
      }
      
      if (parseJson) {
        return JSON.parse(value) as T;
      }
      
      return value as T;
    } catch (error) {
      logger.error('缓存获取失败', { key, error });
      return null;
    }
  }

  /**
   * 删除缓存
   */
  static async deleteCache(key: string): Promise<boolean> {
    try {
      const result = await RedisClient.executeCommand<number>('del', key);
      logger.debug('缓存删除', { key, deleted: result > 0 });
      return result > 0;
    } catch (error) {
      logger.error('缓存删除失败', { key, error });
      throw error;
    }
  }
  /**
   * 批量删除缓存（支持模式匹配）
   */
  static async deleteCachePattern(pattern: string): Promise<number> {
    try {
      const keys = await RedisClient.executeCommand<string[]>('keys', pattern);
      
      if (keys.length === 0) {
        return 0;
      }
      
      const deleted = await RedisClient.executeCommand<number>('del', ...keys);
      logger.debug('批量缓存删除', { pattern, count: deleted });
      return deleted;
    } catch (error) {
      logger.error('批量缓存删除失败', { pattern, error });
      throw error;
    }
  }

  /**
   * 检查缓存是否存在
   */
  static async cacheExists(key: string): Promise<boolean> {
    try {
      const exists = await RedisClient.executeCommand<number>('exists', key);
      return exists === 1;
    } catch (error) {
      logger.error('缓存存在性检查失败', { key, error });
      return false;
    }
  }

  /**
   * 设置缓存过期时间
   */
  static async expireCache(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await RedisClient.executeCommand<number>('expire', key, seconds);
      return result === 1;
    } catch (error) {
      logger.error('设置缓存过期时间失败', { key, seconds, error });
      throw error;
    }
  }

  /**
   * 获取缓存剩余过期时间
   */
  static async getTTL(key: string): Promise<number> {
    try {
      return await RedisClient.executeCommand<number>('ttl', key);
    } catch (error) {
      logger.error('获取缓存TTL失败', { key, error });
      throw error;
    }
  }

  /**
   * 原子递增
   */
  static async increment(key: string, delta = 1): Promise<number> {
    try {
      if (delta === 1) {
        return await RedisClient.executeCommand<number>('incr', key);
      } else {
        return await RedisClient.executeCommand<number>('incrby', key, delta);
      }
    } catch (error) {
      logger.error('原子递增失败', { key, delta, error });
      throw error;
    }
  }

  /**
   * 原子递减
   */
  static async decrement(key: string, delta = 1): Promise<number> {
    try {
      if (delta === 1) {
        return await RedisClient.executeCommand<number>('decr', key);
      } else {
        return await RedisClient.executeCommand<number>('decrby', key, delta);
      }
    } catch (error) {
      logger.error('原子递减失败', { key, delta, error });
      throw error;
    }
  }

  /**
   * 列表左侧推入
   */
  static async listLeftPush(key: string, ...values: string[]): Promise<number> {
    try {
      return await RedisClient.executeCommand<number>('lpush', key, ...values);
    } catch (error) {
      logger.error('列表左侧推入失败', { key, count: values.length, error });
      throw error;
    }
  }

  /**
   * 列表右侧推入
   */
  static async listRightPush(key: string, ...values: string[]): Promise<number> {
    try {
      return await RedisClient.executeCommand<number>('rpush', key, ...values);
    } catch (error) {
      logger.error('列表右侧推入失败', { key, count: values.length, error });
      throw error;
    }
  }

  /**
   * 列表左侧弹出
   */
  static async listLeftPop(key: string): Promise<string | null> {
    try {
      return await RedisClient.executeCommand<string | null>('lpop', key);
    } catch (error) {
      logger.error('列表左侧弹出失败', { key, error });
      throw error;
    }
  }

  /**
   * 列表右侧弹出
   */
  static async listRightPop(key: string): Promise<string | null> {
    try {
      return await RedisClient.executeCommand<string | null>('rpop', key);
    } catch (error) {
      logger.error('列表右侧弹出失败', { key, error });
      throw error;
    }
  }

  /**
   * 获取列表长度
   */
  static async listLength(key: string): Promise<number> {
    try {
      return await RedisClient.executeCommand<number>('llen', key);
    } catch (error) {
      logger.error('获取列表长度失败', { key, error });
      throw error;
    }
  }

  /**
   * 获取列表范围内的元素
   */
  static async listRange(key: string, start = 0, stop = -1): Promise<string[]> {
    try {
      return await RedisClient.executeCommand<string[]>('lrange', key, start, stop);
    } catch (error) {
      logger.error('获取列表范围失败', { key, start, stop, error });
      throw error;
    }
  }

  /**
   * 有序集合添加成员
   */
  static async sortedSetAdd(key: string, score: number, member: string): Promise<number> {
    try {
      return await RedisClient.executeCommand<number>('zadd', key, score, member);
    } catch (error) {
      logger.error('有序集合添加失败', { key, score, member, error });
      throw error;
    }
  }

  /**
   * 有序集合批量添加成员
   */
  static async sortedSetAddMultiple(
    key: string, 
    members: Array<{ score: number; member: string }>
  ): Promise<number> {
    try {
      const args = members.flatMap(({ score, member }) => [score, member]);
      return await RedisClient.executeCommand<number>('zadd', key, ...args);
    } catch (error) {
      logger.error('有序集合批量添加失败', { key, count: members.length, error });
      throw error;
    }
  }

  /**
   * 有序集合移除成员
   */
  static async sortedSetRemove(key: string, ...members: string[]): Promise<number> {
    try {
      return await RedisClient.executeCommand<number>('zrem', key, ...members);
    } catch (error) {
      logger.error('有序集合移除失败', { key, members, error });
      throw error;
    }
  }

  /**
   * 有序集合按分数范围获取成员
   */
  static async sortedSetRangeByScore(
    key: string,
    min: number | string,
    max: number | string,
    withScores = false
  ): Promise<string[]> {
    try {
      const args = [key, min, max];
      if (withScores) args.push('WITHSCORES');
      
      return await RedisClient.executeCommand<string[]>('zrangebyscore', ...args);
    } catch (error) {
      logger.error('有序集合按分数范围获取失败', { key, min, max, error });
      throw error;
    }
  }

  /**
   * 有序集合获取成员数量
   */
  static async sortedSetCount(key: string): Promise<number> {
    try {
      return await RedisClient.executeCommand<number>('zcard', key);
    } catch (error) {
      logger.error('获取有序集合数量失败', { key, error });
      throw error;
    }
  }

  /**
   * 集合添加成员
   */
  static async setAdd(key: string, ...members: string[]): Promise<number> {
    try {
      return await RedisClient.executeCommand<number>('sadd', key, ...members);
    } catch (error) {
      logger.error('集合添加失败', { key, members, error });
      throw error;
    }
  }

  /**
   * 集合移除成员
   */
  static async setRemove(key: string, ...members: string[]): Promise<number> {
    try {
      return await RedisClient.executeCommand<number>('srem', key, ...members);
    } catch (error) {
      logger.error('集合移除失败', { key, members, error });
      throw error;
    }
  }

  /**
   * 检查集合成员是否存在
   */
  static async setIsMember(key: string, member: string): Promise<boolean> {
    try {
      const result = await RedisClient.executeCommand<number>('sismember', key, member);
      return result === 1;
    } catch (error) {
      logger.error('检查集合成员失败', { key, member, error });
      throw error;
    }
  }

  /**
   * 获取集合所有成员
   */
  static async setMembers(key: string): Promise<string[]> {
    try {
      return await RedisClient.executeCommand<string[]>('smembers', key);
    } catch (error) {
      logger.error('获取集合成员失败', { key, error });
      throw error;
    }
  }

  /**
   * 获取集合成员数量
   */
  static async setCount(key: string): Promise<number> {
    try {
      return await RedisClient.executeCommand<number>('scard', key);
    } catch (error) {
      logger.error('获取集合数量失败', { key, error });
      throw error;
    }
  }

  /**
   * 哈希表设置字段
   */
  static async hashSet(key: string, field: string, value: string): Promise<number> {
    try {
      return await RedisClient.executeCommand<number>('hset', key, field, value);
    } catch (error) {
      logger.error('哈希表设置失败', { key, field, error });
      throw error;
    }
  }

  /**
   * 哈希表批量设置字段
   */
  static async hashSetMultiple(key: string, fields: Record<string, string>): Promise<string> {
    try {
      const args = Object.entries(fields).flat();
      return await RedisClient.executeCommand<string>('hmset', key, ...args);
    } catch (error) {
      logger.error('哈希表批量设置失败', { key, fieldCount: Object.keys(fields).length, error });
      throw error;
    }
  }

  /**
   * 哈希表获取字段
   */
  static async hashGet(key: string, field: string): Promise<string | null> {
    try {
      return await RedisClient.executeCommand<string | null>('hget', key, field);
    } catch (error) {
      logger.error('哈希表获取失败', { key, field, error });
      throw error;
    }
  }

  /**
   * 哈希表获取所有字段
   */
  static async hashGetAll(key: string): Promise<Record<string, string>> {
    try {
      const result = await RedisClient.executeCommand<string[]>('hgetall', key);
      const hash: Record<string, string> = {};
      
      for (let i = 0; i < result.length; i += 2) {
        hash[result[i]] = result[i + 1];
      }
      
      return hash;
    } catch (error) {
      logger.error('哈希表获取所有字段失败', { key, error });
      throw error;
    }
  }

  /**
   * 哈希表删除字段
   */
  static async hashDelete(key: string, ...fields: string[]): Promise<number> {
    try {
      return await RedisClient.executeCommand<number>('hdel', key, ...fields);
    } catch (error) {
      logger.error('哈希表删除字段失败', { key, fields, error });
      throw error;
    }
  }

  /**
   * 分布式锁获取
   */
  static async acquireLock(
    key: string,
    value: string,
    ttlSeconds: number
  ): Promise<boolean> {
    try {
      const result = await RedisClient.executeCommand<string | null>(
        'set',
        key,
        value,
        'EX',
        ttlSeconds,
        'NX'
      );
      return result === 'OK';
    } catch (error) {
      logger.error('获取分布式锁失败', { key, ttlSeconds, error });
      throw error;
    }
  }

  /**
   * 分布式锁释放（使用 Lua 脚本确保原子性）
   */
  static async releaseLock(key: string, value: string): Promise<boolean> {
    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      
      const result = await RedisClient.executeCommand<number>('eval', script, 1, key, value);
      return result === 1;
    } catch (error) {
      logger.error('释放分布式锁失败', { key, error });
      throw error;
    }
  }
}

// 导出工具函数的便捷访问方法
export const {
  setCache,
  getCache,
  deleteCache,
  deleteCachePattern,
  cacheExists,
  expireCache,
  getTTL,
  increment,
  decrement,
  listLeftPush,
  listRightPush,
  listLeftPop,
  listRightPop,
  listLength,
  listRange,
  sortedSetAdd,
  sortedSetAddMultiple,
  sortedSetRemove,
  sortedSetRangeByScore,
  sortedSetCount,
  setAdd,
  setRemove,
  setIsMember,
  setMembers,
  setCount,
  hashSet,
  hashSetMultiple,
  hashGet,
  hashGetAll,
  hashDelete,
  acquireLock,
  releaseLock,
} = RedisUtils;

// 导出类型
export type { CacheOptions, QueueOptions };