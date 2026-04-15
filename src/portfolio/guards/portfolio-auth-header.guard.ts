import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class PortfolioAuthHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const authorization = request.headers?.authorization;

    if (typeof authorization !== 'string' || !authorization.trim()) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header',
      );
    }

    return true;
  }
}
