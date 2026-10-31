import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: () => ({
              databaseUrl: 'postgresql://user:pass@127.0.0.1:5432/bsa_test',
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(PrismaService);
  });

  it('wires Prisma into the Nest lifecycle', async () => {
    const connect = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  describe('isDatabaseReachable', () => {
    it('resolves true when SELECT 1 succeeds', async () => {
      const spy = jest
        .spyOn(service, '$queryRaw')
        .mockResolvedValueOnce([{ ok: 1 }] as never);

      await expect(service.isDatabaseReachable()).resolves.toBe(true);
      expect(spy).toHaveBeenCalled();
    });

    it('resolves false — never throws — when the query fails', async () => {
      jest
        .spyOn(service, '$queryRaw')
        .mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(service.isDatabaseReachable()).resolves.toBe(false);
    });
  });
});
