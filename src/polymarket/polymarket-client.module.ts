import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PolymarketClientService } from './polymarket-client.service';
import { CLOB_CLIENT } from './polymarket.constants';

@Global()
@Module({
  providers: [
    {
      provide: CLOB_CLIENT,
      useFactory: async (configService: ConfigService) => {
        const host = configService.get<string>(
          'POLYMARKET_BASE_URL',
          'https://clob.polymarket.com',
        );
        if (process.env.JEST_WORKER_ID) {
          return { host };
        }

        const { ClobClient, Chain } = await import('@polymarket/clob-client');
        const key = configService.get<string>('POLYMARKET_API_KEY');
        const secret = configService.get<string>('POLYMARKET_SECRET');
        const passphrase = configService.get<string>('POLYMARKET_PASSPHRASE');

        const creds =
          key && secret && passphrase ? { key, secret, passphrase } : undefined;

        return new ClobClient(host, Chain.POLYGON, undefined, creds);
      },
      inject: [ConfigService],
    },
    PolymarketClientService,
  ],
  exports: [CLOB_CLIENT, PolymarketClientService],
})
export class PolymarketClientModule {}
