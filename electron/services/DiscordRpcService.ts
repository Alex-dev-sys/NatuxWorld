import { BRAND } from '../../brand.config';

export interface RichPresenceInput {
  username: string;
  server?: string;
}

type RpcClient = {
  login: () => Promise<void>;
  setActivity: (activity: unknown) => Promise<void>;
  clearActivity: () => Promise<void>;
  destroy: () => void;
};

/**
 * Discord Rich Presence: "playing NATUX WORLD" with the player's nick and time.
 * Fully opt-out-by-default-safe: disabled unless BRAND.discordClientId is set,
 * every Discord call is fire-and-forget, and failures never touch the game.
 */
export class DiscordRpcService {
  private client: RpcClient | null = null;
  private connecting: Promise<void> | null = null;
  private startedAt: number | null = null;

  private get enabled(): boolean {
    return typeof BRAND.discordClientId === 'string' && BRAND.discordClientId.length > 0;
  }

  private async ensureClient(): Promise<RpcClient | null> {
    if (!this.enabled) return null;
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        try {
          const { Client } = await import('@xhayper/discord-rpc');
          const client = new Client({ clientId: BRAND.discordClientId }) as unknown as RpcClient;
          await client.login();
          this.client = client;
        } catch {
          // Discord not running / not installed — silently disable for this session.
          this.client = null;
        }
      })();
    }
    await this.connecting;
    return this.client;
  }

  async setInGame(input: RichPresenceInput): Promise<void> {
    const client = await this.ensureClient();
    if (!client) return;
    if (this.startedAt === null) this.startedAt = Date.now();
    try {
      await client.setActivity({
        details: 'Играет на сервере',
        state: input.server ? input.username : `${input.username} · ${BRAND.serverHost}`,
        startTimestamp: this.startedAt,
        largeImageKey: 'natux',
        largeImageText: BRAND.name,
        instance: false,
      });
    } catch {
      /* presence is cosmetic */
    }
  }

  async clear(): Promise<void> {
    this.startedAt = null;
    if (!this.client) return;
    try {
      await this.client.clearActivity();
    } catch {
      /* ignore */
    }
  }

  destroy(): void {
    try {
      this.client?.destroy();
    } catch {
      /* ignore */
    }
    this.client = null;
    this.connecting = null;
    this.startedAt = null;
  }
}

/** Shared instance so main-process shutdown and LauncherService drive one connection. */
export const discordRpc = new DiscordRpcService();
