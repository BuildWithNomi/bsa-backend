import type { ClassifierModel } from '../generated/prisma/client';
import type { ModelResponseDto } from './dto/model-response.dto';

/**
 * The single place a catalogue row becomes a wire object — mirrors
 * `common/mappers/user.mapper.ts` for the same reason.
 */
export function toModelResponse(model: ClassifierModel): ModelResponseDto {
  return {
    id: model.id,
    name: model.name,
    version: model.version,
    task: model.task,
    labels: model.labels,
    description: model.description,
    downloadUrl: model.downloadUrl,
    sizeBytes: model.sizeBytes,
    isActive: model.isActive,
    createdById: model.createdById,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}
