-- Clean up 6 duplicate PEI requests caused by simultaneous staff submissions.
-- For Utt/Lockett pairs the duplicates were the orphan "pending" twins of rows
-- that were actually sent. For Brian Lewis we keep the earlier-created row
-- of each pair and delete the +1s twin.
DELETE FROM public.pei_requests
WHERE id IN (
  '960c0099-f0e6-40d3-b368-5225201c8b3d', -- Utt / Durante Equipment (pending twin)
  'bf6ffb6f-b1c4-440e-a168-57d1c13602c5', -- Utt / Superior Mulch (pending twin)
  'aa324fb9-80f4-4232-ac49-9033f21aff71', -- Lockett / Xxx Express Inc (pending twin)
  '750663fe-23de-417b-b269-0dbb36cf3a51', -- Lewis / Heniff Transportation (later twin)
  'e2faf9ad-5e4a-420d-9e8a-3b5c6a53df42', -- Lewis / Kag (later twin)
  '7d47c7e4-6574-4e77-8ee8-9e6b0f2a2193'  -- Lewis / Viper Freight Llc (later twin)
);