import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'you@example.com', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254, { message: 'Email must be at most 254 characters' })
  email!: string;

  @ApiProperty({
    description:
      'Password as chosen at registration. Length policy is not re-applied on login so that a future policy change cannot lock existing accounts out.',
    example: 'Str0ngPass!',
    minLength: 1,
    maxLength: 255,
    writeOnly: true,
  })
  @IsString({ message: 'Password must be a string' })
  @MinLength(1, { message: 'Password is required' })
  @MaxLength(255, { message: 'Password must be at most 255 characters' })
  password!: string;
}
