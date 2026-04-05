import { Request, Response, NextFunction } from 'express';
import logger from '../../shared/utils/logger';

interface PerformanceMetrics {
  duration: number;
  method: string;
  path: string;
  statusCode: number;
  timestamp: number;
}

class PerformanceTracker {
  private metrics: PerformanceMetrics[] = [];
  private readonly maxMetrics = 10000; // Keep last 10k requests in memory

  recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    // Prevent memory leak by keeping only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Calculate percentile from stored metrics
   * @param percentile - Value between 0 and 100
   */
  private calculatePercentile(percentile: number): number {
    if (this.metrics.length === 0) return 0;

    const sorted = [...this.metrics]
      .map((m) => m.duration)
      .sort((a, b) => a - b);

    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }

  /**
   * Get performance statistics
   */
  getStats() {
    if (this.metrics.length === 0) {
      return {
        requestCount: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0,
        avg: 0,
      };
    }

    const durations = this.metrics.map((m) => m.duration);
    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      requestCount: this.metrics.length,
      p50: this.calculatePercentile(50),
      p95: this.calculatePercentile(95),
      p99: this.calculatePercentile(99),
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: Math.round(sum / durations.length),
    };
  }

  /**
   * Get metrics filtered by path pattern
   */
  getMetricsByPath(pathPattern: string) {
    const filtered = this.metrics.filter((m) =>
      m.path.includes(pathPattern)
    );

    if (filtered.length === 0) {
      return {
        requestCount: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0,
        avg: 0,
      };
    }

    const durations = filtered.map((m) => m.duration);
    const sorted = [...durations].sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      requestCount: filtered.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: Math.round(sum / durations.length),
    };
  }

  /**
   * Reset metrics (useful for testing)
   */
  reset(): void {
    this.metrics = [];
  }
}

// Global instance
export const performanceTracker = new PerformanceTracker();

/**
 * Performance middleware
 * Tracks response times, logs slow requests (>1000ms), and calculates percentiles
 */
export const performanceMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();

  // Override res.on('finish') to capture response metrics
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const metric: PerformanceMetrics = {
      duration,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      timestamp: startTime,
    };

    // Record the metric
    performanceTracker.recordMetric(metric);

    // Log slow requests
    if (duration > 1000) {
      logger.warn(
        `Slow request: ${req.method} ${req.path} - ${duration}ms (${res.statusCode})`
      );
    }

    // Optional: Log very slow requests with more details
    if (duration > 5000) {
      const stats = performanceTracker.getStats();
      logger.warn(
        `Critical slow request: ${req.method} ${req.path} - ${duration}ms. Current P95: ${stats.p95}ms`
      );
    }
  });

  next();
};

/**
 * Health check endpoint handler for performance metrics
 * Usage: app.get('/metrics/performance', performanceMetricsHandler)
 */
export const performanceMetricsHandler = (_req: Request, res: Response): void => {
  const stats = performanceTracker.getStats();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    metrics: stats,
  });
};

/**
 * Health check endpoint handler for path-specific metrics
 * Usage: app.get('/metrics/performance/:pathParam', performanceMetricsByPathHandler)
 */
export const performanceMetricsByPathHandler = (
  req: Request,
  res: Response
): void => {
  const pathPattern = (req.params.pathParam as string) || '';
  const stats = performanceTracker.getMetricsByPath(pathPattern);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    pathPattern,
    metrics: stats,
  });
};
