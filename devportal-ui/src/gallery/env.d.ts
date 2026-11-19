interface ImportMetaEnv {
  /** Turns analytics on. Unset means off. */
  readonly VITE_ANALYTICS_DOMAIN?: string;
  /** Plausible-compatible script URL. Must be the "manual" variant. */
  readonly VITE_ANALYTICS_SRC?: string;
}
