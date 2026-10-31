import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * At least one lowercase, one uppercase and one digit.
 * Symbols are deliberately allowed so password managers keep working.
 */
const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

/** Letters (any script), apostrophe, space, hyphen and period — full names only. */
const NAME_PATTERN = /^[\p{L}][\p{L}' .-]*$/u;

export class RegisterDto {
  @ApiProperty({
    description: 'Display name shown in the app',
    example: 'Noman Khan',
    minLength: 2,
    maxLength: 80,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Full name must be a string' })
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  @MaxLength(80, { message: 'Full name must be at most 80 characters' })
  @Matches(NAME_PATTERN, {
    message:
      'Full name may contain letters, spaces, hyphens, periods and apostrophes only',
  })
  fullName!: string;

  @ApiProperty({
    description: 'Normalized to lower case before storage',
    example: 'you@example.com',
    maxLength: 254,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254, { message: 'Email must be at most 254 characters' })
  email!: string;

  @ApiProperty({
    description:
      '8–72 characters with at least one lowercase letter, one uppercase letter and one digit',
    example: 'Str0ngPass!',
    minLength: 8,
    maxLength: 72,
    writeOnly: true,
  })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  @Matches(PASSWORD_COMPLEXITY, {
    message:
      'Password needs at least one lowercase letter, one uppercase letter and one digit',
  })
  password!: string;
}
