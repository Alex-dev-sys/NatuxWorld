import type { NatuxAPI } from './native';

export type {
  AccountResult,
  BootstrapResult,
  LauncherLog,
  LoginOutcome,
  NatuxAPI,
} from './native';

declare global {
  interface Window {
    natux?: NatuxAPI;
  }
}

export {};
