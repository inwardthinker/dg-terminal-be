import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { GetUserSessionQueryDto } from './dto/get-user-session.query.dto';
import { OnboardingAuthBodyDto } from './dto/onboarding-auth.body.dto';
import { UpdateOnboardingStepBodyDto } from './dto/update-onboarding-step.body.dto';
import { UserProfileService } from './user-profile.service';

@Controller('api/user-profile')
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Post('onboarding/auth')
  onAuth(@Body() body: OnboardingAuthBodyDto) {
    return this.userProfileService.onAuth(
      body.userId,
      body.username,
      body.walletAddress,
      body.email,
    );
  }

  @Patch('onboarding/step')
  updateOnboardingStep(@Body() body: UpdateOnboardingStepBodyDto) {
    return this.userProfileService.updateOnboardingStep(
      body.userId,
      body.step,
      body.username,
    );
  }

  @Get('session')
  getSession(@Query() query: GetUserSessionQueryDto) {
    return this.userProfileService.getSession(query.userId);
  }
}
