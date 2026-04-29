import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrivyClient } from '@privy-io/node';

type LinkedAccount = {
  type?: unknown;
  address?: unknown;
  email?: unknown;
  username?: unknown;
  name?: unknown;
  [key: string]: unknown;
};

type PrivyIdentity = {
  privyDid: string;
  email: string | null;
  walletAddress: string | null;
  providerUsername: string | null;
};

@Injectable()
export class PrivyIdentityService {
  private readonly privyClient: PrivyClient;

  constructor(private readonly configService: ConfigService) {
    const appId = this.configService.get<string>('PRIVY_APP_ID');
    const appSecret = this.configService.get<string>('PRIVY_APP_SECRET');

    if (!appId || !appSecret) {
      throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET must be configured');
    }

    this.privyClient = new PrivyClient({ appId, appSecret });
  }

  async getIdentityFromToken(idToken: string): Promise<PrivyIdentity> {
    if (!idToken) {
      throw new UnauthorizedException('Missing Privy identity token');
    }

    try {
      const user = (await this.privyClient
        .users()
        .get({ id_token: idToken })) as unknown as Record<string, unknown>;

      const privyDid = asString(user.id);
      if (!privyDid) {
        throw new UnauthorizedException('Invalid Privy identity token');
      }

      const linkedAccounts = asLinkedAccounts(user.linked_accounts);
      return {
        privyDid,
        email: firstNonEmpty([
          this.extractEmailFromLinkedAccounts(linkedAccounts),
          asString(user.email),
        ]),
        walletAddress:
          this.extractWalletAddressFromLinkedAccounts(linkedAccounts),
        providerUsername: firstNonEmpty([
          this.extractUsernameFromLinkedAccounts(linkedAccounts),
          asString(user.name),
        ]),
      };
    } catch {
      throw new UnauthorizedException('Invalid Privy identity token');
    }
  }

  private extractEmailFromLinkedAccounts(
    linkedAccounts: LinkedAccount[],
  ): string | null {
    for (const account of linkedAccounts) {
      const email = asString(account.email) ?? asString(account.address);
      if (email && email.includes('@')) {
        return email.toLowerCase();
      }
    }
    return null;
  }

  private extractWalletAddressFromLinkedAccounts(
    linkedAccounts: LinkedAccount[],
  ): string | null {
    for (const account of linkedAccounts) {
      const address = asString(account.address);
      if (address && /^0x[a-fA-F0-9]{40}$/.test(address)) {
        return address;
      }
    }
    return null;
  }

  private extractUsernameFromLinkedAccounts(
    linkedAccounts: LinkedAccount[],
  ): string | null {
    for (const account of linkedAccounts) {
      const username = firstNonEmpty([
        asString(account.username),
        asString(account.name),
      ]);
      if (username) {
        return username;
      }
    }
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asLinkedAccounts(value: unknown): LinkedAccount[] {
  return Array.isArray(value) ? (value as LinkedAccount[]) : [];
}

function firstNonEmpty(values: Array<string | null>): string | null {
  for (const value of values) {
    if (value) {
      return value;
    }
  }
  return null;
}
