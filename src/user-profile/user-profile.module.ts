import { Module } from '@nestjs/common';
import { UserProfileController } from './user-profile.controller';
import { UserProfileRepository } from './user-profile.repository';
import { UserProfileService } from './user-profile.service';

@Module({
  controllers: [UserProfileController],
  providers: [UserProfileRepository, UserProfileService],
  exports: [UserProfileService],
})
export class UserProfileModule {}
