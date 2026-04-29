import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { OnboardingAuthBodyDto } from './dto/onboarding-auth.body.dto';
import { UpdateOnboardingStepBodyDto } from './dto/update-onboarding-step.body.dto';
import { PrivyIdentityService } from './privy-identity.service';
import { UsersService } from './users.service';

@Controller('api/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly privyIdentityService: PrivyIdentityService,
  ) {}

  @Post('onboarding/auth')
  async onAuth(@Body() body: OnboardingAuthBodyDto, @Req() req: Request) {
    const identity = await this.privyIdentityService.getIdentityFromToken(
      this.extractPrivyIdToken(req),
    );
    return this.usersService.onAuth(
      identity.privyDid,
      identity.email ?? body.email,
      body.username ?? identity.providerUsername ?? undefined,
      identity.walletAddress ?? undefined,
    );
  }

  @Patch('onboarding/step')
  async updateOnboardingStep(
    @Body() body: UpdateOnboardingStepBodyDto,
    @Req() req: Request,
  ) {
    const identity = await this.privyIdentityService.getIdentityFromToken(
      this.extractPrivyIdToken(req),
    );
    return this.usersService.updateOnboardingStep(
      identity.privyDid,
      body.step,
      body.username,
      body.streams,
    );
  }

  @Get('session')
  async getSession(@Req() req: Request) {
    const identity = await this.privyIdentityService.getIdentityFromToken(
      this.extractPrivyIdToken(req),
    );
    return this.usersService.getSession(identity.privyDid);
  }

  private extractPrivyIdToken(req: Request): string {
    const headerToken = req.headers['privy-id-token'];
    if (typeof headerToken === 'string' && headerToken.length > 0) {
      return headerToken;
    }
    if (Array.isArray(headerToken) && headerToken[0]) {
      return headerToken[0];
    }

    const cookieHeader = req.headers.cookie;
    if (typeof cookieHeader === 'string') {
      const fromHeader = readCookie(cookieHeader, 'privy-id-token');
      if (fromHeader) {
        return fromHeader;
      }
    }

    return '';
  }
}

function readCookie(cookieHeader: string, key: string): string | null {
  const prefix = `${key}=`;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}
