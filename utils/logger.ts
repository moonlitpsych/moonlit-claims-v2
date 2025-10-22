/**
 * HIPAA-Compliant Logger
 *
 * Critical Rules:
 * 1. NEVER log PHI (Protected Health Information) in plain text
 * 2. Use patient/appointment IDs instead of names/DOB
 * 3. All data access must be logged to audit_log table
 * 4. Log levels: error, warn, info, debug
 */

import { getServiceRoleClient } from '@/lib/supabase/client';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

interface LogContext {
  [key: string]: any;
}

interface AuditLogEntry {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  changes?: any;
  ipAddress?: string;
  userAgent?: string;
}

class Logger {
  private logLevel: LogLevel;

  constructor() {
    // Set log level from environment or default to INFO
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    this.logLevel = this.parseLogLevel(envLevel) || LogLevel.INFO;
  }

  private parseLogLevel(level?: string): LogLevel | null {
    switch (level) {
      case 'error':
        return LogLevel.ERROR;
      case 'warn':
        return LogLevel.WARN;
      case 'info':
        return LogLevel.INFO;
      case 'debug':
        return LogLevel.DEBUG;
      default:
        return null;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
    return levels.indexOf(level) <= levels.indexOf(this.logLevel);
  }

  /**
   * Format log message with timestamp and context
   */
  private formatLog(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(this.sanitizeContext(context))}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  /**
   * Sanitize context to ensure no PHI is logged
   * Removes common PHI fields and warns if detected
   */
  private sanitizeContext(context: LogContext): LogContext {
    const phiFields = [
      'firstName',
      'lastName',
      'dateOfBirth',
      'ssn',
      'email',
      'phone',
      'address',
      'name',
    ];

    const sanitized = { ...context };

    phiFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
        console.warn(`⚠️ WARNING: PHI field "${field}" detected in log context and redacted`);
      }
    });

    return sanitized;
  }

  /**
   * Error logging - always logged
   */
  error(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatLog(LogLevel.ERROR, message, context));
    }
  }

  /**
   * Warning logging
   */
  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatLog(LogLevel.WARN, message, context));
    }
  }

  /**
   * Info logging - general application flow
   */
  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatLog(LogLevel.INFO, message, context));
    }
  }

  /**
   * Debug logging - detailed information for development
   */
  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatLog(LogLevel.DEBUG, message, context));
    }
  }

  /**
   * Audit logging - HIPAA-required audit trail
   * Writes to database audit_log table
   * Gracefully skips if Supabase is not configured
   */
  async audit(entry: AuditLogEntry): Promise<void> {
    try {
      const supabase = getServiceRoleClient();

      // Skip audit logging if Supabase is not configured
      if (!supabase) {
        this.debug('Audit logging skipped - Supabase not configured', {
          action: entry.action,
        });
        return;
      }

      const { error } = await supabase.from('audit_log').insert({
        user_id: entry.userId || null,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId || null,
        changes: entry.changes || null,
        ip_address: entry.ipAddress || null,
        user_agent: entry.userAgent || null,
      });

      if (error) {
        this.error('Failed to write audit log', {
          error: error.message,
          action: entry.action,
        });
      }
    } catch (err) {
      this.error('Audit logging exception', {
        error: err instanceof Error ? err.message : 'Unknown error',
        action: entry.action,
      });
    }
  }
}

// Export singleton instance
export const logger = new Logger();

/**
 * Usage Examples:
 *
 * // ✅ GOOD - No PHI in logs
 * logger.info('Claim created', {
 *   claimId: claim.id,
 *   appointmentId: appointment.id,
 *   status: 'draft',
 * });
 *
 * // ❌ BAD - Contains PHI
 * logger.info('Claim created for patient John Doe, DOB 1990-01-01');
 *
 * // ✅ GOOD - Structured error without PHI
 * logger.error('Claim submission failed', {
 *   claimId: claim.id,
 *   error: error.message,
 *   errorCode: error.code,
 * });
 *
 * // ✅ GOOD - Audit log for HIPAA compliance
 * await logger.audit({
 *   userId: userId,
 *   action: 'claim_viewed',
 *   resourceType: 'claim',
 *   resourceId: claimId,
 *   ipAddress: req.socket.remoteAddress,
 *   userAgent: req.headers['user-agent'],
 * });
 */
