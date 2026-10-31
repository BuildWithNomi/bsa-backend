import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserResponseDto } from '../common/dto/user-response.dto';
import { toUserResponse } from '../common/mappers/user.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { type User } from '../generated/prisma/client';
import { ListUsersQueryDto } from './dto/list-users.query';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

export interface PaginatedUsers {
  items: UserResponseDto[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * User administration for the RBAC criteria.
 *
 * Deliberately narrow: there is no user-created content in this system, so this service
 * only reads accounts and changes the two fields that gate authentication (`role`,
 * `isActive`). It cannot touch passwords or token records.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUsersQueryDto): Promise<PaginatedUsers> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    return { items: users.map(toUserResponse), total, limit, offset };
  }

  async getById(id: string): Promise<UserResponseDto> {
    return toUserResponse(await this.findOrThrow(id));
  }

  async updateRole(
    id: string,
    dto: UpdateUserRoleDto,
    actorId: string,
  ): Promise<UserResponseDto> {
    this.assertNotSelf(id, actorId, 'You cannot change your own role');

    await this.findOrThrow(id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
    });

    // A demotion ends the sessions that were granted under the old role.
    if (dto.role !== 'ADMIN') {
      await this.revokeSessions(id);
    }

    return toUserResponse(updated);
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
    actorId: string,
  ): Promise<UserResponseDto> {
    this.assertNotSelf(
      id,
      actorId,
      'You cannot change your own account status',
    );

    await this.findOrThrow(id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: dto.isActive },
    });

    if (!dto.isActive) {
      await this.revokeSessions(id);
    }

    return toUserResponse(updated);
  }

  private async findOrThrow(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async revokeSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Prevents an administrator from locking themselves out — the classic "last admin
   * demotes themselves" incident.
   */
  private assertNotSelf(id: string, actorId: string, message: string): void {
    if (id === actorId) {
      throw new BadRequestException(message);
    }
  }
}
