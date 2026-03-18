import { v4 as uuidv4 } from 'uuid';
import type { AuditLog, AuthUser, SecurityEvent, SecurityEventType } from '@/types/auth';
import { logger } from '@/lib/utils/logger';
import { db } from '@/lib/db/client';

/**
 * 审计日志服务类
 */
export class AuditLoggerService {
  /**
   * 记录审计日志
   * @param params - 审计日志参数
   */
  async logAudit(params: {
    user: AuthUser;
    action: string;
    resource: string;
    resourceId?: string;
    method: string;
    path: string;
    ip: string;
    userAgent: string;
    requestId: string;
    success: boolean;
    error?: string;
    statusCode: number;
    duration: number;
  }): Promise<void> {
    try {
      const auditLog: AuditLog = {
        id: uuidv4(),
        userId: params.user.id,
        userEmail: params.user.email,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        method: params.method,
        path: params.path,
        ip: params.ip,
        userAgent: params.userAgent,
        requestId: params.requestId,
        success: params.success,
        error: params.error,
        statusCode: params.statusCode,
        duration: params.duration,
        createdAt: new Date(),
      };

      // 存储到数据库
      await this.saveAuditLog(auditLog);

      // 记录到日志文件
      logger.info('审计日志', {
        auditId: auditLog.id,
        userId: auditLog.userId,
        action: auditLog.action,
        resource: auditLog.resource,
        success: auditLog.success,
        duration: auditLog.duration,
      });
    } catch (error) {
      logger.error('记录审计日志失败', { error, params });
    }
  }

  /**
   * 记录安全事件
   * @param event - 安全事件
   */
  async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'createdAt'>): Promise<void> {
    try {
      const securityEvent: SecurityEvent = {
        ...event,
        id: uuidv4(),
        createdAt: new Date(),
      };

      // 存储到数据库
      await this.saveSecurityEvent(securityEvent);

      // 记录到日志文件
      logger.warn('安全事件', {
        eventId: securityEvent.id,
        type: securityEvent.type,
        severity: securityEvent.severity,
        ip: securityEvent.ip,
        path: securityEvent.path,
        description: securityEvent.description,
      });

      // 如果是高危事件，发送告警
      if (securityEvent.severity === 'high' || securityEvent.severity === 'critical') {
        await this.sendSecurityAlert(securityEvent);
      }
    } catch (error) {
      logger.error('记录安全事件失败', { error, event });
    }
  }

  /**
   * 保存审计日志到数据库
   * @param auditLog 审计日志对象
   */
  private async saveAuditLog(auditLog: AuditLog): Promise<void> {
    try {
      await db.initialize();
      
      const query = `
        INSERT INTO audit_logs (
          id, user_id, user_email, action, resource, resource_id,
          method, path, ip, user_agent, request_id, success,
          error, status_code, duration, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        auditLog.id,
        auditLog.userId,
        auditLog.userEmail,
        auditLog.action,
        auditLog.resource,
        auditLog.resourceId ?? null,
        auditLog.method,
        auditLog.path,
        auditLog.ip,
        auditLog.userAgent,
        auditLog.requestId,
        auditLog.success,
        auditLog.error ?? null,
        auditLog.statusCode,
        auditLog.duration,
        auditLog.createdAt,
      ];

      await db.execute(query, values);
    } catch (error) {
      logger.error('保存审计日志到数据库失败', {
        error: error instanceof Error ? error.message : String(error),
        auditLogId: auditLog.id,
      });
      throw error;
    }
  }

  /**
   * 保存安全事件到数据库
   * @param event 安全事件对象
   */
  private async saveSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      await db.initialize();
      
      const query = `
        INSERT INTO security_events (
          id, type, severity, description, ip, user_agent,
          path, user_id, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        event.id,
        event.type,
        event.severity,
        event.description,
        event.ip,
        event.userAgent ?? null,
        event.path ?? null,
        event.userId ?? null,
        JSON.stringify(event.metadata ?? {}),
        event.createdAt,
      ];

      await db.execute(query, values);
    } catch (error) {
      logger.error('保存安全事件到数据库失败', {
        error: error instanceof Error ? error.message : String(error),
        eventId: event.id,
      });
      throw error;
    }
  }

  /**
   * 发送安全告警
   * @param event - 安全事件
   */
  private async sendSecurityAlert(event: SecurityEvent): Promise<void> {
    // TODO: 实现安全告警逻辑（邮件、短信、即时消息等）
    logger.error('安全告警', {
      eventId: event.id,
      type: event.type,
      severity: event.severity,
      description: event.description,
      ip: event.ip,
      path: event.path,
    });
  }

  /**
   * 查询审计日志
   * @param params 查询参数
   * @returns 审计日志列表
   */
  async getAuditLogs(params: {
    userId?: string;
    action?: string;
    resource?: string;
    startTime?: Date;
    endTime?: Date;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: AuditLog[]; total: number }> {
    try {
      await db.initialize();
      
      const conditions: string[] = [];
      const values: any[] = [];

      if (params.userId) {
        conditions.push('user_id = ?');
        values.push(params.userId);
      }

      if (params.action) {
        conditions.push('action = ?');
        values.push(params.action);
      }

      if (params.resource) {
        conditions.push('resource = ?');
        values.push(params.resource);
      }

      if (params.startTime) {
        conditions.push('created_at >= ?');
        values.push(params.startTime);
      }

      if (params.endTime) {
        conditions.push('created_at <= ?');
        values.push(params.endTime);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // 查询总数
      const countQuery = `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`;
      const countResult = await db.query<{ total: number }>(countQuery, values);
      const total = countResult[0]?.total ?? 0;

      // 查询数据
      const page = params.page || 1;
      const pageSize = params.pageSize || 20;
      const offset = (page - 1) * pageSize;

      const dataQuery = `
        SELECT * FROM audit_logs 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      const rows = await db.query<any>(dataQuery, [...values, pageSize, offset]);

      const items = (rows || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        userEmail: row.user_email,
        action: row.action,
        resource: row.resource,
        resourceId: row.resource_id,
        method: row.method,
        path: row.path,
        ip: row.ip,
        userAgent: row.user_agent,
        requestId: row.request_id,
        success: row.success,
        error: row.error,
        statusCode: row.status_code,
        duration: row.duration,
        createdAt: new Date(row.created_at),
      }));

      return { items, total };
    } catch (error) {
      logger.error('查询审计日志失败', {
        error: error instanceof Error ? error.message : String(error),
        params,
      });
      return { items: [], total: 0 };
    }
  }
}

/**
 * 审计日志服务实例
 */
export const auditLogger = new AuditLoggerService();