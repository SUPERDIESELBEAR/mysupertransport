/** Max allowed upload size: 10 MB */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** MIME types that are always accepted for document uploads */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
  // Word docs only for the "other" slot
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/** Extension → MIME fallback for browsers that report blank MIME on some file types */
const EXT_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
  heic: 'image/heic',
  heif: 'image/heif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Normalizes a file from a mobile camera capture so it always has a usable
 * MIME type and filename extension. Some mobile browsers (notably Samsung's
 * stock Camera app on Android) hand the page a File with an empty `type`
 * and/or a generic filename with no extension. This breaks downstream
 * MIME-based validation. We backfill MIME from the extension, default the
 * extension to `jpg`, and rewrap into a fresh File so validation accepts it.
 */
export function normalizeMobileCaptureFile(file: File): File {
  const originalName = file.name || '';
  let ext = originalName.split('.').pop()?.toLowerCase() || '';
  // If the "extension" is the entire filename (no dot), discard it
  if (!originalName.includes('.')) ext = '';

  let mime = file.type || '';

  // Infer MIME from extension when blank
  if (!mime && ext) {
    mime = EXT_MIME_MAP[ext] || '';
  }

  // Final fallback: assume JPEG (most common camera capture)
  if (!mime) {
    mime = 'image/jpeg';
    if (!ext) ext = 'jpg';
  }

  // Ensure filename has an extension
  let safeName = originalName;
  if (!ext) {
    ext = mime === 'image/png' ? 'png'
        : mime === 'image/heic' ? 'heic'
        : mime === 'image/heif' ? 'heif'
        : 'jpg';
  }
  if (!safeName) {
    safeName = `capture_${Date.now()}.${ext}`;
  } else if (!originalName.includes('.')) {
    safeName = `${originalName}.${ext}`;
  }

  // Only rewrap if we actually changed something
  if (safeName === originalName && mime === file.type) return file;

  try {
    return new File([file], safeName, { type: mime, lastModified: file.lastModified });
  } catch {
    // Some very old browsers don't support the File constructor — return original
    return file;
  }
}

/**
 * Validates a file before uploading.
 * @param file - The File object to validate
 * @param allowDocs - Whether to also allow Word .doc/.docx (for "other" slot)
 */
export function validateFile(file: File, allowDocs = false): FileValidationResult {
  // 1. Size check
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${mb} MB). Maximum allowed size is 10 MB.`,
    };
  }

  // 2. Type check — resolve MIME from browser or fall back to extension
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = file.type || EXT_MIME_MAP[ext] || '';

  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';
  const isDoc =
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return {
      valid: false,
      error: `File type not allowed (${ext.toUpperCase() || 'unknown'}). Please upload a PDF, JPG, or PNG.`,
    };
  }

  if (isDoc && !allowDocs) {
    return {
      valid: false,
      error: 'Word documents are not accepted here. Please upload a PDF, JPG, or PNG.',
    };
  }

  return { valid: true };
}
