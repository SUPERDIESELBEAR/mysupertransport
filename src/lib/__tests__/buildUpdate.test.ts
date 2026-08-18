import { beforeEach, describe, expect, it } from 'vitest';
import { isAppShellCacheName, shouldOfferBuildUpdate } from '@/lib/buildUpdate';

describe('build update guard', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('offers the first mismatched remote build', () => {
    expect(shouldOfferBuildUpdate('old123', 'new123')).toBe(true);
  });

  it('suppresses a build the user already attempted to load', () => {
    window.sessionStorage.setItem('superdrive_build_update_attempted', 'new123');
    expect(shouldOfferBuildUpdate('old123', 'new123')).toBe(false);
  });

  it('clears the attempted build after local and remote synchronize', () => {
    window.sessionStorage.setItem('superdrive_build_update_attempted', 'new123');
    expect(shouldOfferBuildUpdate('new123', 'new123')).toBe(false);
    expect(window.sessionStorage.getItem('superdrive_build_update_attempted')).toBeNull();
    expect(shouldOfferBuildUpdate('new123', 'next12')).toBe(true);
  });

  it('only identifies SUPERDRIVE app-shell caches', () => {
    expect(isAppShellCacheName('sd-pages')).toBe(true);
    expect(isAppShellCacheName('sd-assets')).toBe(true);
    expect(isAppShellCacheName('workbox-precache-v2-https://mysupertransport.lovable.app/')).toBe(true);
    expect(isAppShellCacheName('firebase-messaging-store')).toBe(false);
    expect(isAppShellCacheName('unrelated-runtime-cache')).toBe(false);
  });
});