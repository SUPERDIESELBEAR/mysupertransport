import { describe, expect, it } from 'vitest';
import {
  buildDuplicateOverrideEntries,
  duplicateConfidence,
  findDuplicateMatches,
  normalizeReference,
  stopSummary,
  type DuplicateCandidateLoad,
} from '@/lib/duplicateBrokerRef';

const BROKER_A = 'broker-a';
const BROKER_B = 'broker-b';

function candidate(over: Partial<DuplicateCandidateLoad> = {}): DuplicateCandidateLoad {
  return {
    id: 'load-1',
    load_number: 'ST-1041',
    status: 'covered',
    created_at: '2026-02-01T12:00:00Z',
    created_by: 'user-1',
    broker_id: BROKER_A,
    broker_reference_number: '55123',
    stops: [
      {
        stop_sequence: 1, stop_type: 'pickup',
        facility_name: 'Cargill', city: 'Kansas City', state: 'MO',
      },
      {
        stop_sequence: 2, stop_type: 'delivery',
        facility_name: 'Tyson', city: 'Springdale', state: 'AR',
      },
    ],
    ...over,
  };
}

describe('normalizeReference', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(normalizeReference(' 55-123 ')).toBe('55123');
    expect(normalizeReference('aaa/55123')).toBe(normalizeReference('AAA 55123'));
  });

  it('treats empty input as no reference', () => {
    expect(normalizeReference(null)).toBe('');
    expect(normalizeReference('  ')).toBe('');
  });
});

describe('findDuplicateMatches', () => {
  it('surfaces a warning when broker and reference both match', () => {
    const matches = findDuplicateMatches({
      reference: '55-123',
      brokerId: BROKER_A,
      candidates: [candidate()],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe('confident');
    expect(duplicateConfidence(matches)).toBe('confident');
  });

  it('does not warn when the reference matches under a different broker', () => {
    const matches = findDuplicateMatches({
      reference: '55123',
      brokerId: BROKER_B,
      candidates: [candidate({ broker_id: BROKER_A })],
    });
    expect(matches).toEqual([]);
    expect(duplicateConfidence(matches)).toBeNull();
  });

  it('does not warn against a cancelled load (cancel-and-rebook is legitimate)', () => {
    const matches = findDuplicateMatches({
      reference: '55123',
      brokerId: BROKER_A,
      candidates: [candidate({ status: 'cancelled' })],
    });
    expect(matches).toEqual([]);
  });

  it('never matches on a blank reference', () => {
    expect(findDuplicateMatches({
      reference: '   ', brokerId: BROKER_A, candidates: [candidate()],
    })).toEqual([]);
  });

  it('warns with lower confidence when no broker is linked but the name matches', () => {
    const matches = findDuplicateMatches({
      reference: '55123',
      brokerId: null,
      brokerIdsFromName: [BROKER_A],
      candidates: [candidate()],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe('probable');
    expect(duplicateConfidence(matches)).toBe('probable');
  });

  it('stays quiet when no broker is linked and no broker name matches', () => {
    const matches = findDuplicateMatches({
      reference: '55123',
      brokerId: null,
      brokerIdsFromName: [],
      candidates: [candidate()],
    });
    expect(matches).toEqual([]);
  });
});

describe('buildDuplicateOverrideEntries', () => {
  const entries = buildDuplicateOverrideEntries({
    newLoadId: 'new-id',
    newLoadNumber: 'ST-1042',
    existingLoadId: 'old-id',
    existingLoadNumber: 'ST-1041',
    reference: '55123',
    reason: '  Broker split this into two loads.  ',
  });

  it('records the override on the new load with the duplicated load id and reason', () => {
    const onNew = entries.find(e => e.loadId === 'new-id');
    expect(onNew).toBeDefined();
    expect(onNew!.previousValue).toContain('old-id');
    expect(onNew!.newValue).toContain('55123');
    expect(onNew!.reason).toBe('Broker split this into two loads.');
  });

  it('records a mirrored entry on the original load naming the new load', () => {
    const onOld = entries.find(e => e.loadId === 'old-id');
    expect(onOld).toBeDefined();
    expect(onOld!.newValue).toContain('new-id');
    expect(onOld!.newValue).toContain('ST-1042');
    expect(onOld!.reason).toBe('Broker split this into two loads.');
  });

  it('describes the same event from each load\u2019s own perspective', () => {
    const [onNew, onOld] = entries;
    expect(onNew.fieldPath).not.toBe(onOld.fieldPath);
    expect(entries).toHaveLength(2);
  });
});

describe('stopSummary', () => {
  it('renders stops in sequence order', () => {
    const summary = stopSummary(candidate().stops.slice().reverse());
    expect(summary.indexOf('Cargill')).toBeLessThan(summary.indexOf('Tyson'));
    expect(summary).toContain('Kansas City, MO');
  });
});
