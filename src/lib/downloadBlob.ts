/**
 * Download a file by fetching it as a blob and triggering a programmatic
 * download. This bypasses the cross-origin limitation where browsers ignore
 * the HTML `download` attribute for remote URLs.
 *
 * On iOS Safari / PWA WebViews the `download` attribute is silently ignored,
 * so we open the blob in a new tab instead so the OS presents its native
 * "Save to Files / Share" sheet — the only reliable save path on iOS.
 */
function isIOSLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = (navigator as any).platform || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    (platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1); // iPadOS
  return iOS;
}

export async function downloadBlob(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    if (isIOSLike()) {
      // iOS ignores the download attribute — open the blob so the OS shows
      // its native share/save sheet.
      const win = window.open(blobUrl, '_blank');
      if (!win) {
        // Popup blocked — fall back to same-tab navigation.
        window.location.href = blobUrl;
      }
    } else {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // Delay revoke so the new tab / download has time to consume the blob.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (err) {
    console.error('downloadBlob failed:', err);
    try {
      const { toast } = await import('@/hooks/use-toast');
      toast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Could not download the file.',
        variant: 'destructive',
      });
    } catch {
      /* noop */
    }
  }
}
