import { PartialType } from '@nestjs/swagger';
import { CreateModelDto } from './create-model.dto';

/**
 * Partial update: every field is optional and unknown fields are still rejected.
 *
 * `name` is deliberately *not* patchable — it is the stable key clients cache, so it
 * changes only by creating a new entry. Deactivating (`isActive: false`) is additionally
 * restricted to ADMIN in the service.
 */
export class UpdateModelDto extends PartialType(CreateModelDto) {}
