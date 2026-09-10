/**
 * A soft diagonal "DEACTIVATED" wash laid over a vehicle card.
 *
 * Purely decorative: it never intercepts a click (the whole card is a button)
 * and it is hidden from screen readers, which already get the "Deactivated"
 * badge next to the unit number.
 */
export default function DeactivatedWatermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl select-none flex items-center justify-center"
    >
      <span
        className="text-muted-foreground font-bold tracking-[0.25em] whitespace-nowrap opacity-[0.13] text-2xl sm:text-3xl"
        style={{ transform: 'rotate(-18deg)' }}
      >
        DEACTIVATED
      </span>
    </div>
  );
}
