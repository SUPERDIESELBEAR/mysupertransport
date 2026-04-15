import { useEffect, useState, useCallback } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

const SCROLL_THRESHOLD = 300;

export function ScrollJumpButton() {
  const [scrolledPast, setScrolledPast] = useState(false);
  const [visible, setVisible] = useState(false);

  const handleScroll = useCallback(() => {
    const y = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    // Only show if page is actually scrollable
    setVisible(maxScroll > 400);
    setScrolledPast(y > SCROLL_THRESHOLD);
  }, []);

  useEffect(() => {
    handleScroll();
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [handleScroll]);

  if (!visible) return null;

  const handleClick = () => {
    if (scrolledPast) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  };

  const Icon = scrolledPast ? ArrowUp : ArrowDown;
  const label = scrolledPast ? "Back to top" : "Jump to bottom";

  return (
    <button
      onClick={handleClick}
      aria-label={label}
      title={label}
      className={cn(
        "fixed bottom-6 right-6 z-40 flex items-center gap-1.5 rounded-full",
        "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
        "px-3 py-2 text-xs font-medium shadow-lg",
        "hover:opacity-90 transition-all duration-200",
        "animate-in fade-in-0 slide-in-from-bottom-2"
      )}
    >
      <Icon size={14} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
