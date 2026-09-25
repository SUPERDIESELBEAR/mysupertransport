/**
 * The invoice packet — shared by build-invoice-packet (preview) and
 * send-invoice-packet (the email to the factor). P79: order and contents come
 * from the carrier's document_requirements; a built-in order is used only when
 * the carrier has no rows.
 *
 * Every part is returned as its own PDF (images become one page each), in
 * packet order, so a caller can either combine them or attach them separately.
 */
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';

// deno-lint-ignore no-explicit-any
type Admin = any;

export const DEFAULT_PACKET = ['invoice', 'bol', 'pod', 'rate_confirmation', 'revised_rate_confirmation', 'lumper_receipt', 'scale_ticket', 'detention_documentation', 'loadout_pickup_inspection', 'loadout_delivery_inspection', 'permit', 'broker_correspondence', 'reimbursement_proof', 'other'];

export class PacketError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export interface PacketPart {
  documentType: string;
  /** The source file's name (the invoice number for the invoice). */
  sourceName: string;
  bytes: Uint8Array;
  pageCount: number;
  /** Size of the stored source file, before conversion. */
  sourceBytes: number;
}

async function asPdf(bytes: Uint8Array, name: string): Promise<{ bytes: Uint8Array; pages: number }> {
  let donor;
  try { donor = await PDFDocument.load(bytes); } catch { throw new PacketError(`${name} cannot be read as a PDF.`); }
  const out = await PDFDocument.create();
  for (const page of await out.copyPages(donor, donor.getPageIndices())) out.addPage(page);
  return { bytes: new Uint8Array(await out.save()), pages: out.getPageCount() };
}

async function imageAsPdf(bytes: Uint8Array, kind: 'png' | 'jpg'): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const img = kind === 'png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
  const page = out.addPage([612, 792]);
  const scale = Math.min(516 / img.width, 696 / img.height, 1);
  page.drawImage(img, { x: (612 - img.width * scale) / 2, y: (792 - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
  return new Uint8Array(await out.save());
}

/** The document types that go in the packet, in order ('invoice' always included). */
export async function packetTypes(admin: Admin, companyId: string): Promise<string[]> {
  const { data: reqs, error } = await admin.from('document_requirements')
    .select('document_type,in_packet,position').eq('company_id', companyId).order('position').order('document_type');
  if (error) throw new PacketError('Could not read document settings', 500);
  const rows = reqs?.length ? reqs : DEFAULT_PACKET.map((t, i) => ({ document_type: t, in_packet: !['broker_correspondence', 'reimbursement_proof', 'other'].includes(t), position: i + 1 }));
  return rows.filter((r: { in_packet: boolean; document_type: string }) => r.in_packet || r.document_type === 'invoice')
    .map((r: { document_type: string }) => r.document_type);
}

/** Every packet part for a load, in packet order. Throws PacketError naming the file. */
export async function buildPacketParts(
  admin: Admin, companyId: string, loadId: string, invoice: { bytes: Uint8Array; name: string },
): Promise<PacketPart[]> {
  const { data: docs, error: de } = await admin.from('load_documents')
    .select('document_type,document_name,file_path,file_type,uploaded_at')
    .eq('load_id', loadId).eq('company_id', companyId).order('uploaded_at');
  if (de) throw new PacketError('Could not read load documents', 500);

  const parts: PacketPart[] = [];
  for (const type of await packetTypes(admin, companyId)) {
    if (type === 'invoice') {
      const pdf = await asPdf(invoice.bytes, invoice.name);
      parts.push({ documentType: 'invoice', sourceName: invoice.name, bytes: pdf.bytes, pageCount: pdf.pages, sourceBytes: invoice.bytes.byteLength });
      continue;
    }
    for (const d of (docs ?? []).filter((x: { document_type: string }) => x.document_type === type)) {
      const name = d.document_name || type;
      if (!d.file_path) throw new PacketError(`${name} has no stored file.`);
      const { data: blob, error } = await admin.storage.from('load-documents').download(d.file_path);
      if (error || !blob) throw new PacketError(`${name} could not be read.`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mime = (d.file_type || blob.type || '').toLowerCase();
      try {
        if (mime.includes('pdf') || /\.pdf$/i.test(d.file_path)) {
          const pdf = await asPdf(bytes, name);
          parts.push({ documentType: type, sourceName: name, bytes: pdf.bytes, pageCount: pdf.pages, sourceBytes: bytes.byteLength });
        } else {
          const kind = mime.includes('png') || /\.png$/i.test(d.file_path) ? 'png'
            : mime.includes('jpeg') || mime.includes('jpg') || /\.jpe?g$/i.test(d.file_path) ? 'jpg' : null;
          if (!kind) throw new PacketError(`${name} has an unsupported file type.`);
          parts.push({ documentType: type, sourceName: name, bytes: await imageAsPdf(bytes, kind), pageCount: 1, sourceBytes: bytes.byteLength });
        }
      } catch (e) {
        if (e instanceof PacketError) throw e;
        throw new PacketError(`${name} could not be read: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return parts;
}

/** One PDF from every part, with a page → document manifest. */
export async function combineParts(parts: PacketPart[]) {
  const out = await PDFDocument.create();
  const manifest: Array<{ page: number; document_type: string; source_file: string }> = [];
  for (const p of parts) {
    const donor = await PDFDocument.load(p.bytes);
    for (const page of await out.copyPages(donor, donor.getPageIndices())) {
      out.addPage(page);
      manifest.push({ page: out.getPageCount(), document_type: p.documentType, source_file: p.sourceName });
    }
  }
  return { bytes: new Uint8Array(await out.save()), pageCount: out.getPageCount(), manifest };
}
