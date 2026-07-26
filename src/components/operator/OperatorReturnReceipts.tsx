import { useEffect, useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { validateFile } from '@/lib/validateFile';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import { toast } from 'sonner';
import { ShipmentReceiptsBlock, Receipt, EquipmentLine } from '@/components/equipment/ShipmentReceipts';
import { FilePreviewModal } from '@/components/inspection/DocRow';

type DeliveryMethod = 'shipped' | 'orientation' | 'on_site' | 'awaiting_return' | 'not_assigned';

const LINES: { key: EquipmentLine; label: string; deliveryMethodColumn: string }[] = [
  { key: 'eld', label: 'ELD Unit', deliveryMethodColumn: 'eld_delivery_method' },
  { key: 'dash_cam', label: 'Dash Cam', deliveryMethodColumn: 'dash_cam_delivery_method' },
  { key: 'bestpass', label: 'BestPass', deliveryMethodColumn: 'bestpass_delivery_method' },
  { key: 'fuel_card', label: 'Fuel Card', deliveryMethodColumn: 'fuel_card_delivery_method' },
  { key: 'decal', label: 'Decal', deliveryMethodColumn: 'decal_delivery_method' },
];

interface OperatorReturnReceiptsProps {
  operatorId: string;
  status: Record<string, any> | null;
}

export default function OperatorReturnReceipts({ operatorId, status }: OperatorReturnReceiptsProps) {
  const { user } = useAuth();
  const { guardDemo } = useDemoMode();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('Shipping Receipt');
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const returnReceipts = useMemo(() => receipts.filter(r => r.direction === 'return'), [receipts]);
  const anyAwaitingReturn = useMemo(
    () => LINES.some(l => (status?.[l.deliveryMethodColumn] as DeliveryMethod | undefined) === 'awaiting_return'),
    [status],
  );

  const fetchReceipts = async () => {
    const { data, error } = await supabase
      .from('equipment_receipts')
      .select('id, equipment_line, direction, carrier, tracking_number, file_url, file_name, uploaded_by, uploader_role, uploaded_at, profiles(first_name, last_name)')
      .eq('operator_id', operatorId)
      .order('uploaded_at', { ascending: false });
    if (error) {
      console.error('[OperatorReturnReceipts] fetch receipts failed', error);
      return;
    }
    const mapped = (data || []).map(r => {
      const p = (r as any).profiles;
      const display = p
        ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Staff'
        : r.uploader_role === 'driver'
          ? 'Driver'
          : 'Staff';
      return { ...r, uploader_display: display } as Receipt;
    });
    setReceipts(mapped);
  };

  useEffect(() => {
    fetchReceipts();
  }, [operatorId]);

  const uploadReturnReceipt = async (
    formId: string,
    file: File,
    carrier: string | null,
    tracking: string | null,
  ) => {
    if (guardDemo()) return;
    if (!user?.id) {
      toast.error('You must be signed in.');
      return;
    }
    const check = validateFile(file, true);
    if (!check.valid) {
      toast.error(check.error ?? 'Invalid file');
      return;
    }
    setUploadingKey(`return-${formId}`);
    try {
      const rawExt = file.name.split('.').pop()?.toLowerCase() ?? '';
      const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : 'bin';
      // Must live under the operator's own folder — storage rules key off folder[1].
      const path = `${operatorId}/equipment-receipts/return-${Date.now()}.${ext}`;
      const { error: upErr } = await uploadToBucket('operator-documents', path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: signedUrl } = await supabase.storage
        .from('operator-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = signedUrl?.signedUrl;
      if (!url) throw new Error('signed url failed');

      const { error } = await supabase.from('equipment_receipts').insert({
        operator_id: operatorId,
        equipment_line: null,
        direction: 'return',
        carrier: carrier || null,
        tracking_number: tracking || null,
        file_url: url,
        file_name: file.name,
        uploaded_by: user.id,
        uploader_role: 'driver',
      });
      if (error) {
        await supabase.storage.from('operator-documents').remove([path]).catch(() => {});
        throw error;
      }
      toast.success('Return receipt uploaded.');
      fetchReceipts();
    } catch (err: any) {
      console.error('[OperatorReturnReceipts] upload failed', err);
      toast.error("We couldn't upload that receipt. Please try again.");
    } finally {
      setUploadingKey(null);
    }
  };

  if (returnReceipts.length === 0 && !anyAwaitingReturn) return null;

  return (
    <div id="equipment-asset-sheet-anchor" className="scroll-mt-24">
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Return Equipment Receipts</h3>
            <p className="text-xs text-muted-foreground truncate">
              {anyAwaitingReturn
                ? 'Upload shipping receipts for your returning equipment.'
                : 'View previously uploaded return receipts.'}
            </p>
          </div>
        </div>

        <ShipmentReceiptsBlock
          direction="return"
          title="Return Receipts"
          subtitle={anyAwaitingReturn ? 'Upload a receipt for equipment you shipped back.' : 'Previously uploaded return receipts.'}
          canUpload={anyAwaitingReturn}
          uploadingKey={uploadingKey}
          receipts={returnReceipts}
          onUpload={(formId, file, carrier, tracking) => uploadReturnReceipt(formId, file, carrier, tracking)}
          onPreview={(url, name) => {
            setPreviewUrl(url);
            setPreviewName(name);
          }}
        />
      </div>
      {previewUrl && (
        <FilePreviewModal
          url={previewUrl}
          name={previewName}
          onClose={() => setPreviewUrl(null)}
          bucketName="operator-documents"
        />
      )}
    </div>
  );
}
