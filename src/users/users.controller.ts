import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { GetUserSessionQueryDto } from './dto/get-user-session.query.dto';
import { OnboardingAuthBodyDto } from './dto/onboarding-auth.body.dto';
import { UpdateOnboardingStepBodyDto } from './dto/update-onboarding-step.body.dto';
import { UsersService } from './users.service';

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('onboarding/auth')
  onAuth(@Body() body: OnboardingAuthBodyDto) {
    return this.usersService.onAuth(
      body.userId,
      body.username,
      body.walletAddress,
      body.email,
    );
  }

  @Patch('onboarding/step')
  updateOnboardingStep(@Body() body: UpdateOnboardingStepBodyDto) {
    return this.usersService.updateOnboardingStep(
      body.userId,
      body.step,
      body.username,
    );
  }

  @Get('session')
  getSession(@Query() query: GetUserSessionQueryDto) {
    return this.usersService.getSession(query.userId);
  }
}
