import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Shield, TrendingUp, Headphones, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logo from '@/assets/supertransport-logo.png';
import ResumeApplicationDialog from '@/components/application/ResumeApplicationDialog';

const valueProps = [
  {
    icon: Shield,
    title: 'DOT-Compliant Operations',
    description:
      "All paperwork, inspections, and certifications managed end-to-end so you can focus on the road, not the red tape.",
    highlight: 'Fully compliant from day one',
  },
  {
    icon: TrendingUp,
    title: 'Competitive Owner-Operator Pay',
    description:
      "Transparent linehaul rates, no hidden deductions, and consistent freight lanes that keep your wheels turning and your revenue growing.",
    highlight: 'Transparent rates, consistent loads',
  },
  {
    icon: Headphones,
    title: 'Dedicated Onboarding Support',
    description:
      "A real team walks you through every step from your CDL verification and ICA to your first dispatch. You are never on your own.",
    highlight: 'A real team, every step of the way',
  },
];

const checkpoints = [
  'Class A CDL required',
   'Bring your own power unit',
  'Clean MVR & background',
  'Ready to run OTR or regional lanes',
];

export default function SplashPage() {
  const navigate = useNavigate();
  const [resumeOpen, setResumeOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface-dark text-surface-dark-foreground flex flex-col">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 80% 40% at 50% -10%, hsl(41 47% 54% / 0.08) 0%, transparent 60%), radial-gradient(circle at 85% 70%, hsl(41 47% 54% / 0.04) 0%, transparent 40%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(41 47% 54%) 1px, transparent 1px), linear-gradient(90deg, hsl(41 47% 54%) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* HEADER */}
      <header className="relative z-10 flex flex-col items-center px-6 py-5 max-w-6xl mx-auto w-full">
        <img src={logo} alt="SUPERTRANSPORT" className="h-[10.5rem] max-w-[720px] object-contain shrink-0 mb-4" />
        <div className="flex items-center gap-4 relative z-20 pointer-events-auto">
          <Link
            to="/status"
            onClick={(e) => { e.preventDefault(); navigate('/status'); }}
            className="text-sm text-surface-dark-muted hover:text-gold transition-colors hidden sm:block"
          >
            Check Application Status
          </Link>
          <Link
            to="/login"
            onClick={(e) => { e.preventDefault(); navigate('/login'); }}
            className="text-sm text-surface-dark-muted hover:text-gold transition-colors"
          >
            Staff Sign In
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-12 pb-8 max-w-4xl mx-auto w-full animate-fade-in">
        {/* Pill badge */}
        <div className="inline-flex items-center gap-2 bg-gold/10 border border-gold/30 text-gold text-xs font-semibold tracking-widest uppercase px-4 py-1.5 rounded-full mb-8">
          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
          Now Hiring Owner-Operators
        </div>

        {/* Headline */}
        <h1 className="text-[clamp(1.6rem,5.5vw,3.75rem)] font-bold text-surface-dark-foreground leading-[0.95] tracking-tight mb-6">
          Drive with purpose.&nbsp;
          <br />
          <span className="text-gold">Build your future.</span>
        </h1>

        {/* Mission statement */}
        <p className="text-lg sm:text-xl text-surface-dark-muted max-w-2xl leading-relaxed mb-10">
          SUPERTRANSPORT partners with owner-operators who want more than just a load. We invest
          in your success, handle the complexity, and treat you like the professional you are.
        </p>

        {/* CTA */}
        <Button
          onClick={() => navigate('/apply')}
          className="bg-gold hover:bg-gold-light text-surface-dark font-bold text-base px-10 py-3 h-auto rounded-lg shadow-lg transition-all hover:scale-[1.02] group mb-4"
          size="lg"
        >
          Begin Your Application
          <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
        </Button>

        <p className="text-surface-dark-muted text-sm">
          No login required to apply &middot; Takes about 10&ndash;15 minutes
        </p>

        {/* Resume application banner */}
        <button
          type="button"
          onClick={() => setResumeOpen(true)}
          className="mt-6 group inline-flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-2.5 text-left transition-colors hover:border-gold/60 hover:bg-gold/10"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold">
            <RotateCcw className="h-4 w-4" />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-surface-dark-foreground">
              Started an application?
            </span>
            <span className="text-xs text-surface-dark-muted">
              Pick up where you left off — we'll email you a secure resume link.
            </span>
          </span>
          <ArrowRight className="ml-1 h-4 w-4 text-gold transition-transform group-hover:translate-x-0.5" />
        </button>
      </section>

      {/* QUICK CHECKLIST */}
      <section className="relative z-10 max-w-4xl mx-auto w-full px-6 pb-12">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          {checkpoints.map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-surface-dark-muted">
              <CheckCircle2 className="h-4 w-4 text-gold shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </section>

      {/* VALUE PROP CARDS */}
      <section className="relative z-10 max-w-6xl mx-auto w-full px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {valueProps.map(({ icon: Icon, title, description, highlight }) => (
            <div
              key={title}
              className="bg-surface-dark-card border border-surface-dark-border rounded-xl p-6 flex flex-col gap-4 hover:border-gold/40 transition-colors group"
            >
              <div className="h-11 w-11 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center group-hover:bg-gold/15 transition-colors">
                <Icon className="h-5 w-5 text-gold" />
              </div>
              <div>
                <h3 className="text-surface-dark-foreground font-semibold text-base mb-2">{title}</h3>
                <p className="text-surface-dark-muted text-sm leading-relaxed">{description}</p>
              </div>
              <div className="mt-auto pt-3 border-t border-surface-dark-border">
                <span className="text-gold text-xs font-medium tracking-wide">{highlight}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-surface-dark-border py-6 px-6 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-surface-dark-muted">
          <p>&copy; {new Date().getFullYear()} SUPERTRANSPORT. All rights reserved.</p>
          <div className="flex items-center gap-5 relative z-20 pointer-events-auto">
            <Link
              to="/status"
              onClick={(e) => { e.preventDefault(); navigate('/status'); }}
              className="hover:text-gold transition-colors"
            >
              Check Application Status
            </Link>
            <Link
              to="/login"
              onClick={(e) => { e.preventDefault(); navigate('/login'); }}
              className="hover:text-gold transition-colors"
            >
              Staff Sign In
            </Link>
          </div>
        </div>
      </footer>

      {resumeOpen && (
        <ResumeApplicationDialog open={resumeOpen} onOpenChange={setResumeOpen} />
      )}
    </div>
  );
}
