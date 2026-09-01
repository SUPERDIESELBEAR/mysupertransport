import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { INSPECTION_DATE_DOCS, isInspectionDateDoc } from '@/components/inspection/DocRow';

/**
 * Regression guard for the 2026-08-30 change that replaced the expiry editor
 * trigger with a plain <div>, making expiry dates unsettable on EVERY binder
 * document row (CDL, Medical Certificate, Form 2290 ...), not just the
 * Vehicle-Hub-managed Periodic DOT Inspections row.
 */
const FILES = [
  'src/components/inspection/OperatorBinderPanel.tsx',
  'src/components/inspection/InspectionBinderAdmin.tsx',
];

const read = (f: string) => readFileSync(f, 'utf8');

describe('binder expiry editor', () => {
  it('only Periodic DOT Inspections is Vehicle-Hub managed', () => {
    expect([...INSPECTION_DATE_DOCS]).toEqual(['Periodic DOT Inspections']);
    // The docs staff must be able to date themselves:
    for (const name of ['CDL (Front)', 'CDL (Back)', 'Medical Certificate', 'Form 2290', 'Lease Agreement (ICA)']) {
      expect(isInspectionDateDoc(name)).toBe(false);
    }
  });

  for (const file of FILES) {
    describe(file, () => {
      const src = read(file);

      // THE REGRESSION CASE: a non-inspection document row must have a working
      // click handler that opens the editor.
      it('non-inspection rows have a click handler that opens the editor', () => {
        const trigger = src.match(
          /<button[\s\S]{0,400}?data-testid=\{`expiry-trigger-\$\{docName\}`\}[\s\S]{0,400}?<\/button>/,
        );
        expect(trigger, 'expiry trigger button missing').toBeTruthy();
        expect(trigger![0]).toContain('setExpiryEditing(doc.id)');
        expect(trigger![0]).toContain("setExpiryValue(doc.expires_at ?? '')");
      });

      it('the editable branch is reachable only for non-inspection docs', () => {
        // The editable trigger sits in the `: (` arm after the isInspectionDateDoc arm
        const lockedIdx = src.indexOf('data-testid={`expiry-locked-${docName}`}');
        const triggerIdx = src.indexOf('data-testid={`expiry-trigger-${docName}`}');
        expect(lockedIdx).toBeGreaterThan(-1);
        expect(triggerIdx).toBeGreaterThan(lockedIdx);
        expect(src).toContain(') : isInspectionDateDoc(docName) ? (');
      });

      it('the Periodic DOT Inspection row explains why it is locked instead of being inert', () => {
        const locked = src.slice(
          src.indexOf('data-testid={`expiry-locked-${docName}`}'),
          src.indexOf('data-testid={`expiry-trigger-${docName}`}'),
        );
        expect(locked).toContain('Managed in Vehicle Hub');
        expect(locked).not.toContain('setExpiryEditing(');
      });

      it('saving writes expires_at back to inspection_documents', () => {
        expect(src).toContain("update({ expires_at: expiryValue || null })");
      });
    });
  }
});
