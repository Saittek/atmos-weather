export interface SolaraWidgetPlugin {
  setSnapshot(options: {
    json: string
  }): Promise<{ ok?: boolean; file?: boolean; defaults?: boolean }>
  reload(): Promise<{ ok?: boolean }>
  getSnapshot(): Promise<{ json?: string | null }>
}

export declare const SolaraWidget: SolaraWidgetPlugin
