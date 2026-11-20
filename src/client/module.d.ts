declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

// Vite build-time env (declaration merging needs interfaces here).
interface ImportMetaEnv {
  /** Set to "1" to run against localStorage instead of the Devvit server. */
  readonly VITE_LOCAL_DEMO?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
