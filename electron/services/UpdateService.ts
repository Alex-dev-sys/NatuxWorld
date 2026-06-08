export interface UpdateInfo {
  available: boolean;
  version?: string;
  notes?: string;
  url?: string;
}

export class UpdateService {
  async check(): Promise<UpdateInfo> {
    return { available: false };
  }

  async download(_info: UpdateInfo): Promise<void> {
    return;
  }

  async install(): Promise<void> {
    return;
  }
}
