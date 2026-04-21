import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PG_POOL } from './database.constants';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('db_hostname');
        const port = Number.parseInt(
          configService.get<string>('db_port', '5432'),
          10,
        );
        const database = configService.get<string>('db_name');
        const user = configService.get<string>('db_username');
        const password = configService.get<string>('db_password');

        return new Pool({
          host: host || 'localhost',
          port: Number.isNaN(port) ? 5432 : port,
          database: database || 'postgres',
          user: user || 'postgres',
          password: password || 'postgres',
          ssl: { rejectUnauthorized: false },
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
