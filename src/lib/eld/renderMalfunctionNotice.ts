import * as pdfLib from 'pdf-lib';
import {
  buildMalfunctionNotice,
  type MalfunctionNoticeData,
} from '../../../supabase/functions/_shared/malfunctionNoticeCore';

export type { MalfunctionNoticeData };

/** Browser-side notice generation — same module the edge function uses. */
export async function renderMalfunctionNotice(data: MalfunctionNoticeData): Promise<Uint8Array> {
  return buildMalfunctionNotice(pdfLib as unknown as Parameters<typeof buildMalfunctionNotice>[0], data);
}

export async function renderMalfunctionNoticeBlob(data: MalfunctionNoticeData): Promise<Blob> {
  const bytes = await renderMalfunctionNotice(data);
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}