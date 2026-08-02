/**
 * Officer send orchestration (Pass B §8).
 *
 * Build → store bytes in Dexie → enqueue upload → enqueue send. Nothing here
 * touches the network: the queue runner is the only place that does, which is
 * what lets the whole roadside screen work in a dead zone.
 *
 * The SEND entry's own id is passed through as `entry_id` and is the server's
 * idempotency key. Consequences, both intended:
 *   - retrying this entry (backoff, app restart, flaky signal) sends once.
 *   - a second officer on the same day is a NEW entry with a new uuid, so it
 *     is a different key and is not swallowed.
 */
import { roadsideDb } from './db';
import { enqueue, newSyncId } from './queue/store';
import { buildOfficerPacket, type OfficerPacket, type BuildOfficerPacketOptions } from './buildOfficerPacket';

export interface OfficerSendResult {
  packet: OfficerPacket;
  entryId: string;
  storagePath: string;
  /** True when the packet went over the ceiling and a link will be sent. */
  linkMode: boolean;
}

export interface OfficerSendInput {
  operatorId: string;
  eventId?: string | null;
  officerEmail: string;
  officerName?: string | null;
  packet?: OfficerPacket;
  buildOptions?: BuildOfficerPacketOptions;
}

/**
 * Storage path scheme: `<operator_id>/officer-packets/<send entry id>.pdf`.
 *
 * Deterministic for a given send, so a retried upload overwrites its own
 * object instead of littering; distinct per send, so a second officer does not
 * collide with the first. No timestamp — a timestamped path would make every
 * retry a new object and a new send.
 */
export function officerPacketPath(operatorId: string, entryId: string): string {
  return `${operatorId}/officer-packets/${entryId}.pdf`;
}

export async function queueOfficerPacket(input: OfficerSendInput): Promise<OfficerSendResult> {
  const packet = input.packet ?? await buildOfficerPacket(input.buildOptions);

  const sendEntryId = newSyncId();
  const path = officerPacketPath(input.operatorId, sendEntryId);

  await roadsideDb.merged_packets.put({
    id: sendEntryId,
    event_id: input.eventId ?? '',
    bytes: packet.bytes,
    mime: packet.mime,
    size: packet.size,
    included_dates: packet.included_dates,
    created_at: new Date().toISOString(),
  });

  const uploadEntry = await enqueue({
    kind: 'upload_merged_packet',
    payload: { operator_id: input.operatorId, packet_id: sendEntryId, path },
  });

  await enqueue({
    id: sendEntryId,
    kind: 'send_officer_email',
    depends_on: [uploadEntry.id],
    payload: {
      entry_id: sendEntryId,
      operator_id: input.operatorId,
      event_id: input.eventId ?? null,
      packet_path: path,
      to_email: input.officerEmail.trim().toLowerCase(),
      officer_name: input.officerName ?? null,
      window_start: packet.window_start,
      window_end: packet.window_end,
      included_dates: packet.included_dates,
      dispositions: packet.dispositions,
      downsampled_pass: packet.downsampled_pass,
      link_mode: packet.over_ceiling,
    },
  });

  return { packet, entryId: sendEntryId, storagePath: path, linkMode: packet.over_ceiling };
}

/**
 * The offline alternative, available immediately and with no queue at all:
 * hand the file to the officer through the OS. Web Share where it exists
 * (AirDrop, Messages, the officer's own laptop), a download everywhere else.
 */
export async function shareOrDownloadPacket(packet: OfficerPacket): Promise<'shared' | 'downloaded'> {
  const filename = `rods-8-day-packet-${packet.window_start}-to-${packet.window_end}.pdf`;
  const file = new File([packet.bytes], filename, { type: 'application/pdf' });
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: 'Record of Duty Status' });
      return 'shared';
    } catch {
      /* user cancelled or the target refused — fall through to download */
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}