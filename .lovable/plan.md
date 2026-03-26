

## Auto-Format Phone Number in Add Driver Modal

### Change — one file: `src/components/drivers/AddDriverModal.tsx`

Add a phone formatting helper that strips non-digits and applies `(XXX) XXX-XXXX` as the user types:

```ts
const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};
```

Replace the phone `onChange` from:
```ts
onChange={e => set('phone', e.target.value)}
```
to:
```ts
onChange={e => set('phone', formatPhone(e.target.value))}
```

No other files changed. No database changes.

