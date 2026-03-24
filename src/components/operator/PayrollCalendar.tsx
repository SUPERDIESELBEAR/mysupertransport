export default function PayrollCalendar() {
  const days: ({ day: number; type: "work" | "recon" | "payday" | "neutral"; label?: string } | null)[] = [
    // Row 1 — March 2026 starts on Sunday
    { day: 1,  type: "neutral" },
    { day: 2,  type: "neutral" },
    { day: 3,  type: "neutral" },
    { day: 4,  type: "work",  label: "Start" },
    { day: 5,  type: "work" },
    { day: 6,  type: "work" },
    { day: 7,  type: "work" },
    // Row 2
    { day: 8,  type: "work" },
    { day: 9,  type: "work" },
    { day: 10, type: "work",  label: "End" },
    { day: 11, type: "recon", label: "Start" },
    { day: 12, type: "recon" },
    { day: 13, type: "recon" },
    { day: 14, type: "recon" },
    // Row 3
    { day: 15, type: "recon" },
    { day: 16, type: "recon" },
    { day: 17, type: "recon" },
    { day: 18, type: "recon" },
    { day: 19, type: "recon" },
    { day: 20, type: "recon" },
    { day: 21, type: "recon" },
    // Row 4
    { day: 22, type: "recon" },
    { day: 23, type: "recon", label: "End" },
    { day: 24, type: "payday", label: "PAYDAY" },
    { day: 25, type: "neutral" },
    { day: 26, type: "neutral" },
    { day: 27, type: "neutral" },
    { day: 28, type: "neutral" },
    // Row 5
    { day: 29, type: "neutral" },
    { day: 30, type: "neutral" },
    { day: 31, type: "neutral" },
    null, null, null, null,
  ];

  const cellStyles: Record<string, React.CSSProperties> = {
    work:    { backgroundColor: "#B5D4F4", color: "#0C447C", fontWeight: "500", borderRadius: "6px" },
    recon:   { backgroundColor: "#FAC775", color: "#633806", fontWeight: "500", borderRadius: "6px" },
    payday:  { backgroundColor: "#C0DD97", color: "#27500A", fontWeight: "500", border: "1.5px solid #639922", borderRadius: "6px" },
    neutral: { color: "#9ca3af", borderRadius: "6px" },
  };

  const labelStyles: Record<string, React.CSSProperties> = {
    work:    { color: "#185FA5" },
    recon:   { color: "#854F0B" },
    payday:  { color: "#27500A" },
    neutral: {},
  };

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", padding: "0.5rem 0", fontFamily: "sans-serif" }}>

      {/* Section title */}
      <p style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.07em", textTransform: "uppercase", color: "#9ca3af", marginBottom: "1.25rem" }}>
        Weekly Settlement Cycle — Example
      </p>

      {/* Timeline bar */}
      <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: "1px solid #e5e7eb", marginBottom: "20px" }}>
        <div style={{ flex: 1, backgroundColor: "#B5D4F4", padding: "10px 8px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", fontWeight: "600", color: "#0C447C", lineHeight: 1.3 }}>Week 1 — Work Week</div>
          <div style={{ fontSize: "9px", color: "#185FA5", marginTop: "3px", opacity: 0.8 }}>Mar 4 – Mar 10</div>
        </div>
        <div style={{ flex: 1.8, backgroundColor: "#FAC775", padding: "10px 8px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", fontWeight: "600", color: "#633806", lineHeight: 1.3 }}>Week 2 — Reconciliation</div>
          <div style={{ fontSize: "9px", color: "#854F0B", marginTop: "3px", opacity: 0.8 }}>Mar 11 – Mar 23</div>
        </div>
        <div style={{ flex: 0.5, backgroundColor: "#C0DD97", padding: "10px 6px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", fontWeight: "600", color: "#27500A", lineHeight: 1.3 }}>Week 3</div>
          <div style={{ fontSize: "9px", color: "#3B6D11", marginTop: "3px", opacity: 0.8 }}>Mar 24</div>
        </div>
      </div>

      {/* Calendar card */}
      <div style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "1rem" }}>
        <div style={{ fontSize: "15px", fontWeight: "500", textAlign: "center", marginBottom: "10px", color: "#111827" }}>
          March 2026
        </div>

        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "3px", marginBottom: "2px" }}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d} style={{ fontSize: "11px", fontWeight: "500", color: "#9ca3af", textAlign: "center", padding: "4px 0" }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "3px" }}>
          {days.map((item, i) => {
            if (!item) return <div key={i} />;
            return (
              <div
                key={i}
                style={{
                  ...cellStyles[item.type],
                  textAlign: "center",
                  padding: "7px 2px 5px",
                  fontSize: "13px",
                  lineHeight: 1,
                }}
              >
                {item.day}
                {item.label && (
                  <div style={{ fontSize: "8px", marginTop: "2px", lineHeight: 1, ...labelStyles[item.type] }}>
                    {item.label}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", justifyContent: "center", marginTop: "16px" }}>
        {[
          { color: "#B5D4F4", border: "none", label: "Work Week (deliver loads, submit PODs)" },
          { color: "#FAC775", border: "none", label: "Reconciliation (verify revenue, fuel, advances)" },
          { color: "#C0DD97", border: "1.5px solid #639922", label: "Payday (Tuesday settlement issued)" },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#6b7280" }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "3px", backgroundColor: item.color, border: item.border, flexShrink: 0 }} />
            {item.label}
          </div>
        ))}
      </div>

    </div>
  );
}
