import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    controller = moduleRef.get(AppController);
  });

  describe('getIndex', () => {
    it('advertises the service name, docs and health paths', () => {
      const index = controller.getIndex();

      expect(index).toEqual({
        name: 'BrainSightAI API',
        version: '1.0.0',
        status: 'ok',
        docs: '/api/docs',
        health: '/api/v1/health',
      });
    });
  });
});
