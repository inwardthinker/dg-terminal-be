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
    const primaryToken = request.headers?.['privy-id-token'];
    if (typeof primaryToken === 'string' && primaryToken.trim()) {
      return primaryToken;
    }
    if (Array.isArray(primaryToken) && primaryToken[0]?.trim()) {
      return primaryToken[0];
    }

    const fallbackToken = request.headers?.['privy-token'];
    if (typeof fallbackToken === 'string' && fallbackToken.trim()) {
      return fallbackToken;
    }
    if (Array.isArray(fallbackToken) && fallbackToken[0]?.trim()) {
      return fallbackToken[0];
    }

    throw new UnauthorizedException('Missing Privy identity token header');
  }
}
