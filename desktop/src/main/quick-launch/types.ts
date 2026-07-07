import type {
  QuickLaunchProviderId,
  QuickLaunchResult,
} from '@/contracts/quick_launch';

export interface QuickLaunchProviderContext {
  query: string;
  limit: number;
}

export interface QuickLaunchProvider {
  id: QuickLaunchProviderId;
  search: (context: QuickLaunchProviderContext) => Promise<QuickLaunchResult[]>;
  refresh?: () => Promise<void>;
}
