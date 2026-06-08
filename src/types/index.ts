export type LoaderKind = 'forge' | 'fabric' | 'neoforge';

export interface MinecraftVersion {
  id: string;
  label: string;
  loader: LoaderKind;
  recommended?: boolean;
}

export interface ChartPoint {
  x: number;
  y: number;
}
