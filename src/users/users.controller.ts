import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { OnboardingAuthBodyDto } from './dto/onboarding-auth.body.dto';
import { UpdateOnboardingStepBodyDto } from './dto/update-onboarding-step.body.dto';
import { UsersPrivyAuthGuard } from './guards/users-privy-auth.guard';
import { UsernameAvailabilityResponse } from './types/users.type';
import { UsersService } from './users.service';

@Controller('api/users')
@UseGuards(UsersPrivyAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('onboarding/auth')
  async onAuth(@Body() body: OnboardingAuthBodyDto, @Req() req: Request) {
    const identity = this.getIdentity(req);
    return this.usersService.onAuth(
      identity.privyDid,
      identity.email ?? body.email,
      body.username,
      identity.walletAddress ?? undefined,
    );
  }

  @Patch('onboarding/step')
  async updateOnboardingStep(
    @Body() body: UpdateOnboardingStepBodyDto,
    @Req() req: Request,
  ) {
    const identity = this.getIdentity(req);
    return this.usersService.updateOnboardingStep(
      identity.privyDid,
      body.step,
      body.username,
      body.streams,
    );
  }

  @Post('onboarding/username-availability')
  async checkUsernameAvailability(
    @Body() body: { username?: unknown },
  ): Promise<UsernameAvailabilityResponse> {
    return this.usersService.checkUsernameAvailability(body?.username);
  }

  @Get('session')
  async getSession(@Req() req: Request) {
    const identity = this.getIdentity(req);
    return this.usersService.getSession(identity.privyDid);
  }

  private getIdentity(req: Request): {
    privyDid: string;
    email: string | null;
    walletAddress: string | null;
    providerUsername: string | null;
  } {
    const request = req as Request & {
      privyIdentity?: {
        privyDid: string;
        email: string | null;
        walletAddress: string | null;
        providerUsername: string | null;
      };
    };
    if (!request.privyIdentity) {
      throw new UnauthorizedException('Missing authenticated user identity');
    }
    return request.privyIdentity;
  }
}
