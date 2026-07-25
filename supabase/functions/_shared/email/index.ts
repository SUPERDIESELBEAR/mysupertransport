// Re-export barrel so functions can `import { ... } from '../_shared/email/index.ts'`
export * from './auth.ts';
export * from './respond.ts';
export * from './send.ts';
export * from './sender.ts';
// URL builder is re-exported here so any function that imports email helpers
// automatically gets the sanitized `buildAppUrl` — no more hand-rolled
// `mysupertransport.lovable.app` constants that miss the marketing-host guard.
export { buildAppUrl } from '../app-url.ts';