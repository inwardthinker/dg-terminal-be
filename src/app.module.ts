import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PositionsModule } from './positions/positions.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PositionsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
