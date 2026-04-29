import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrivyIdentityService } from '../privy-identity.service';

type PrivyIdentity = {
  privyDid: string;
  email: string | null;
  walletAddress: string | null;
  providerUsername: string | null;
};

type UsersRequest = {
  headers?: Record<string, string | string[] | undefined>;
  privyIdentity?: PrivyIdentity;
};

@Injectable()
export class UsersPrivyAuthGuard implements CanActivate {
  constructor(private readonly privyIdentityService: PrivyIdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<UsersRequest>();
    const token = this.extractPrivyIdToken(request);
    request.privyIdentity =
      await this.privyIdentityService.getIdentityFromToken(token);
    return true;
  }

  private extractPrivyIdToken(request: UsersRequest): string {
    const headerToken = request.headers?.['privy-id-token'];
    if (typeof headerToken === 'string' && headerToken.trim()) {
      return headerToken;
    }
    if (Array.isArray(headerToken) && headerToken[0]?.trim()) {
      return headerToken[0];
    }

    throw new UnauthorizedException('Missing Privy identity token header');
  }
}
