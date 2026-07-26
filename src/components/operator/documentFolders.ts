/**
 * Grouping rules for the driver-facing "My Documents" folder list.
 * Folder names are derived from the document type (category), falling back to
 * the document's own label so a brand-new document type creates its own folder.
 */

export interface GroupableDoc {
  id: string;
  category: string | null;
  label: string | null;
}

export interface DocFolder<T extends GroupableDoc = GroupableDoc> {
  key: string;
  name: string;
  docs: T[];
}

/** Known category → display name. */
export const KNOWN_CATEGORY_LABELS: Record<string, string> = {
  form_2290: 'IRS Form 2290',
  truck_title: 'Truck Title',
  truck_photos: 'Truck Photos',
  passenger_authorization: 'Passenger Authorization',
  receipt: 'Receipts',
  registration: 'Registration',
  insurance_cert: 'Insurance Certificate',
  inspection_report: 'Inspection Report',
  ica_summary: 'ICA Summary',
};

/** Fixed display order for the known types; anything else sorts alphabetically after. */
const KNOWN_ORDER = [
  'Passenger Authorization',
  'IRS Form 2290',
  'Truck Title',
  'Truck Photos',
  'Registration',
  'Insurance Certificate',
  'Inspection Report',
  'ICA Summary',
  'Receipts',
];

export const OTHER_FOLDER = 'Other';

/** Resolve the folder name for a single document. */
export function folderNameFor(doc: GroupableDoc): string {
  const cat = (doc.category ?? '').trim();
  const known = KNOWN_CATEGORY_LABELS[cat];
  if (known) return known;

  const label = (doc.label ?? '').trim();
  if (cat && cat !== 'other') {
    // Unknown category value — humanize it (e.g. "fuel_card_agreement").
    return cat
      .split(/[_\-\s]+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  if (label) return label;
  return OTHER_FOLDER;
}

/**
 * Group documents into folders. Empty folders are never produced.
 * Known types come first (fixed order), then auto-created types alphabetically,
 * with "Other" always last.
 */
export function groupDocumentsByType<T extends GroupableDoc>(docs: T[]): DocFolder<T>[] {
  const map = new Map<string, T[]>();
  for (const doc of docs) {
    const name = folderNameFor(doc);
    const list = map.get(name);
    if (list) list.push(doc);
    else map.set(name, [doc]);
  }

  const folders: DocFolder<T>[] = [...map.entries()].map(([name, list]) => ({
    key: `type:${name.toLowerCase()}`,
    name,
    docs: list,
  }));

  return folders.sort((a, b) => {
    if (a.name === OTHER_FOLDER) return 1;
    if (b.name === OTHER_FOLDER) return -1;
    const ai = KNOWN_ORDER.indexOf(a.name);
    const bi = KNOWN_ORDER.indexOf(b.name);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}