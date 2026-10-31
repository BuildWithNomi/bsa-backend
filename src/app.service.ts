import { Injectable } from '@nestjs/common';
import { API_PREFIX } from './configure-app';

@Injectable()
export class AppService {
  /** Static service metadata — no I/O, safe to answer before the database is up. */
  getServiceIndex(): {
    name: string;
    version: string;
    status: string;
    docs: string;
    health: string;
  } {
    return {
      name: 'BrainSightAI API',
      version: '1.0.0',
      status: 'ok',
      docs: '/api/docs',
      health: `/${API_PREFIX}/health`,
    };
  }
}
