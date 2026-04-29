import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersPrivyAuthGuard } from './guards/users-privy-auth.guard';
import { UsersController } from './users.controller';
import { PrivyIdentityService } from './privy-identity.service';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [ConfigModule],
  controllers: [UsersController],
  providers: [
    UsersRepository,
    UsersService,
    PrivyIdentityService,
    UsersPrivyAuthGuard,
  ],
  exports: [UsersService],
})
export class UsersModule {}
