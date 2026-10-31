import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** The subset of a catalogue row that is ever sent over the wire. */
export class ModelResponseDto {
  @ApiProperty({ example: '6f1d0b3e-4a68-4a5a-9a0b-1b7e3f0d1c22' })
  id!: string;

  @ApiProperty({ example: 'brain-tumor-mri' })
  name!: string;

  @ApiProperty({ example: '1.0.0' })
  version!: string;

  @ApiProperty({ example: 'brain-tumor-classification' })
  task!: string;

  @ApiProperty({
    description: 'Class labels in inference order',
    example: ['glioma', 'meningioma', 'notumor', 'pituitary'],
    type: [String],
  })
  labels!: string[];

  @ApiPropertyOptional({
    example: 'Four-class MRI classifier, 64×64 grayscale.',
  })
  description!: string | null;

  @ApiPropertyOptional({
    example: 'https://models.brainsightai.app/mri/1.0.0/model.pt',
  })
  downloadUrl!: string | null;

  @ApiPropertyOptional({ example: 2_129_951 })
  sizeBytes!: number | null;

  @ApiProperty({
    description: 'false while the entry is still a draft',
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({
    description: 'Account that created the entry',
    example: '11111111-1111-4111-8111-111111111111',
  })
  createdById!: string;

  @ApiProperty({ example: '2026-10-30T09:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-10-30T09:00:00.000Z' })
  updatedAt!: Date;
}
