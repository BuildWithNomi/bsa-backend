import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Lowercase slug — the stable key clients use, e.g. `brain-tumor-mri`. */
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** `1.2.3`, optionally with a pre-release / build suffix. */
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * Creates a catalogue entry for an on-device model.
 *
 * The row is metadata only: no weights and no scan data ever reach the API.
 * `isActive` defaults to `false`, so a RADIOLOGIST's new entry starts as a draft
 * that only privileged roles can see until it is published.
 */
export class CreateModelDto {
  @ApiProperty({
    description: 'Unique lowercase slug identifying the model',
    example: 'brain-tumor-mri',
    minLength: 2,
    maxLength: 64,
  })
  @IsString({ message: 'name must be a string' })
  @Matches(NAME_PATTERN, {
    message:
      'name must be a lowercase slug: a–z, 0–9 and hyphens, 2–64 characters',
  })
  name!: string;

  @ApiProperty({ description: 'Release label', example: '1.0.0' })
  @IsString({ message: 'version must be a string' })
  @Matches(VERSION_PATTERN, {
    message: 'version must look like a semantic version, e.g. 1.0.0',
  })
  version!: string;

  @ApiProperty({
    description: 'What the model does',
    example: 'brain-tumor-classification',
    minLength: 2,
    maxLength: 64,
  })
  @IsString({ message: 'task must be a string' })
  @MinLength(2, { message: 'task must be at least 2 characters' })
  @MaxLength(64, { message: 'task must be at most 64 characters' })
  task!: string;

  @ApiProperty({
    description:
      'Class labels in inference order — must match the training encoder',
    example: ['glioma', 'meningioma', 'notumor', 'pituitary'],
    maxItems: 32,
  })
  @IsArray({ message: 'labels must be an array' })
  @ArrayNotEmpty({ message: 'labels must not be empty' })
  @ArrayMaxSize(32, { message: 'labels must contain at most 32 entries' })
  @IsString({ each: true, message: 'each label must be a string' })
  @IsNotEmpty({ each: true, message: 'labels must not contain empty values' })
  @MaxLength(64, {
    each: true,
    message: 'each label must be at most 64 characters',
  })
  labels!: string[];

  @ApiPropertyOptional({
    description: 'Human-readable summary',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MaxLength(500, { message: 'description must be at most 500 characters' })
  description?: string;

  @ApiPropertyOptional({
    description: 'HTTPS endpoint the app downloads the weights from',
    example: 'https://models.brainsightai.app/brain-tumor-mri/1.0.0/model.pt',
  })
  @IsOptional()
  @IsUrl(
    { protocols: ['https'], require_protocol: true, require_tld: true },
    { message: 'downloadUrl must be an https URL' },
  )
  downloadUrl?: string;

  @ApiPropertyOptional({
    description: 'Weight file size in bytes (for download progress)',
    example: 2_129_951,
    minimum: 1,
  })
  @IsOptional()
  @IsInt({ message: 'sizeBytes must be a number' })
  @Min(1, { message: 'sizeBytes must be at least 1' })
  // Postgres INTEGER ceiling — a bigger payload needs a BIGINT column.
  @Max(2_147_483_647, { message: 'sizeBytes must be at most 2147483647' })
  sizeBytes?: number;

  @ApiPropertyOptional({
    description:
      'Publish immediately. Omitted/false leaves the entry as a draft visible only to RADIOLOGIST and ADMIN',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : value,
  )
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}
