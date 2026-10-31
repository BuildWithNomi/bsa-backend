import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

interface HealthReport {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  timestamp: string;
  uptimeSeconds: number;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Liveness + database reachability',
    description:
      'Returns 503 when Postgres cannot be reached so load balancers can act on it.',
  })
  @ApiOkResponse({ type: Object })
  async check(): Promise<HealthReport> {
    const databaseUp = await this.prisma.isDatabaseReachable();

    const report: HealthReport = {
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'up' : 'down',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };

    if (!databaseUp) {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }
}
