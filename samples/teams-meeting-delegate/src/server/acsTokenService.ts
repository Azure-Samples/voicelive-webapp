import type { AcsTokenResponse } from '../shared/protocol.js';

import { CommunicationIdentityClient } from '@azure/communication-identity';

export class AcsTokenService {
  readonly #client: CommunicationIdentityClient;

  public constructor(connectionString: string) {
    this.#client = new CommunicationIdentityClient(connectionString);
  }

  public async createToken(displayName: string): Promise<AcsTokenResponse> {
    const result = await this.#client.createUserAndToken(['voip']);
    return {
      token: result.token,
      userId: result.user.communicationUserId,
      expiresOn: result.expiresOn.toISOString(),
      displayName,
    };
  }
}
