import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../generated/prisma/client';
import { CreateModelDto } from './dto/create-model.dto';
import { ModelResponseDto } from './dto/model-response.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { ModelsService } from './models.service';

/**
 * Model catalogue.
 *
 * Reads need a valid access token (the global `JwtAuthGuard` already denies anonymous
 * callers); writes are restricted with `@Roles`, which `RolesGuard` — also global —
 * only evaluates on decorated handlers.
 */
@ApiTags('models')
@ApiBearerAuth('access-token')
@Controller('models')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get()
  @ApiOperation({
    summary: 'List catalogue entries',
    description:
      'USER sees published entries only; RADIOLOGIST and ADMIN also see drafts.',
  })
  @ApiOkResponse({ type: ModelResponseDto, isArray: true })
  list(@CurrentUser() actor: AuthenticatedUser): Promise<ModelResponseDto[]> {
    return this.modelsService.list(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch one catalogue entry' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ModelResponseDto })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ModelResponseDto> {
    return this.modelsService.getById(id, actor);
  }

  @Post()
  @Roles(Role.ADMIN, Role.RADIOLOGIST)
  @ApiOperation({
    summary: 'Create a catalogue entry (ADMIN, RADIOLOGIST)',
    description:
      'New entries are drafts (`isActive: false`) unless the caller asks to publish them.',
  })
  @ApiCreatedResponse({ type: ModelResponseDto })
  create(
    @Body() body: CreateModelDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ModelResponseDto> {
    return this.modelsService.create(body, actor);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.RADIOLOGIST)
  @ApiOperation({
    summary: 'Update a catalogue entry (ADMIN, RADIOLOGIST)',
    description:
      'RADIOLOGIST may publish (`isActive: true`); only ADMIN can deactivate, because ' +
      'taking a published model away from users is an administrative action.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ModelResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateModelDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ModelResponseDto> {
    return this.modelsService.update(id, body, actor);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a catalogue entry (ADMIN)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    schema: { properties: { success: { type: 'boolean', example: true } } },
  })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ success: true }> {
    return this.modelsService.remove(id);
  }
}
