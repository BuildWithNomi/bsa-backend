import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../generated/prisma/client';
import type { ClassifierModel } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { toModelResponse } from './models.mapper';
import type { ModelResponseDto } from './dto/model-response.dto';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';

/** Roles that may see drafts and write catalogue entries. */
const AUTHORS: Role[] = [Role.ADMIN, Role.RADIOLOGIST];

function isAuthor(role: Role): boolean {
  return AUTHORS.includes(role);
}

/** Fields `PATCH` may touch. `name` is intentionally absent (stable key). */
type ModelPatch = Omit<UpdateModelDto, 'name'>;

/**
 * Model catalogue for the RBAC criteria.
 *
 * Reads are open to any authenticated caller but drafts are hidden from `USER`;
 * writes are `RADIOLOGIST`+`ADMIN`, deactivation and deletion are `ADMIN` only.
 * The service never touches weights — only metadata rows.
 */
@Injectable()
export class ModelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser): Promise<ModelResponseDto[]> {
    const rows = await this.prisma.classifierModel.findMany({
      where: isAuthor(actor.role) ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map(toModelResponse);
  }

  /**
   * A draft is reported as 404 — not 403 — to a plain USER, so the API does not
   * confirm that an unpublished entry exists.
   */
  async getById(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ModelResponseDto> {
    const row = await this.prisma.classifierModel.findUnique({ where: { id } });

    if (!row || (!row.isActive && !isAuthor(actor.role))) {
      throw new NotFoundException('Model not found');
    }

    return toModelResponse(row);
  }

  async create(
    dto: CreateModelDto,
    actor: AuthenticatedUser,
  ): Promise<ModelResponseDto> {
    try {
      const row = await this.prisma.classifierModel.create({
        data: {
          name: dto.name,
          version: dto.version,
          task: dto.task,
          labels: dto.labels,
          description: dto.description ?? null,
          downloadUrl: dto.downloadUrl ?? null,
          sizeBytes: dto.sizeBytes ?? null,
          isActive: dto.isActive ?? false,
          createdById: actor.id,
        },
      });

      return toModelResponse(row);
    } catch (error) {
      // Unique index race on `name` — the same guard `AuthService` uses for email.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          `A model named "${dto.name}" already exists`,
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: ModelPatch,
    actor: AuthenticatedUser,
  ): Promise<ModelResponseDto> {
    const existing = await this.findOrThrow(id);

    // RADIOLOGIST may publish (false → true) but never take a model away from users.
    if (dto.isActive === false && actor.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only an administrator can deactivate a model',
      );
    }

    const data: {
      version?: string;
      task?: string;
      labels?: string[];
      description?: string | null;
      downloadUrl?: string | null;
      sizeBytes?: number | null;
      isActive?: boolean;
    } = {};

    if (dto.version !== undefined) data.version = dto.version;
    if (dto.task !== undefined) data.task = dto.task;
    if (dto.labels !== undefined) data.labels = dto.labels;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.downloadUrl !== undefined) data.downloadUrl = dto.downloadUrl;
    if (dto.sizeBytes !== undefined) data.sizeBytes = dto.sizeBytes;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const row = await this.prisma.classifierModel.update({
      where: { id: existing.id },
      data,
    });

    return toModelResponse(row);
  }

  /** ADMIN-only (enforced by `@Roles`); `onDelete: Restrict` keeps the author honest. */
  async remove(id: string): Promise<{ success: true }> {
    await this.findOrThrow(id);
    await this.prisma.classifierModel.delete({ where: { id } });

    return { success: true };
  }

  private async findOrThrow(id: string): Promise<ClassifierModel> {
    const row = await this.prisma.classifierModel.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Model not found');
    }
    return row;
  }
}
