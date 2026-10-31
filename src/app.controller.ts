import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { AppService } from './app.service';

interface ServiceIndex {
  name: string;
  version: string;
  status: string;
  docs: string;
  health: string;
}

@ApiTags('meta')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Service index — points at docs and health' })
  @ApiOkResponse({ type: Object })
  getIndex(): ServiceIndex {
    return this.appService.getServiceIndex();
  }
}
