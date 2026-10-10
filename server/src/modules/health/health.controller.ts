import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { HealthReport, HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Not routed through the error contract: an unhealthy dependency is a normal answer for a
   * probe, so the report is the body either way and only the status code changes.
   */
  @Get()
  @ApiOperation({ summary: 'Liveness and database connectivity' })
  @ApiResponse({ status: 200, description: 'All dependencies are up.' })
  @ApiResponse({ status: 503, description: 'A dependency is down.' })
  async getHealth(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthReport> {
    const report = await this.healthService.checkHealth();
    void reply.status(report.status === 'ok' ? 200 : 503);
    return report;
  }
}
