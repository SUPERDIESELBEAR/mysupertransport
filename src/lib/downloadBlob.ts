/**
 * Download a file by fetching it as a blob and triggering a programmatic
 * download. This bypasses the cross-origin limitation where browsers ignore
 * the HTML `download` attribute for remote URLs.
 */
export async function downloadBlob(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}
