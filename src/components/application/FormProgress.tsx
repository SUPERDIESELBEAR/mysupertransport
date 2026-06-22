interface FormProgressProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

export default function FormProgress({ currentStep, totalSteps, stepLabels }: FormProgressProps) {
  const pct = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="mb-8">
      {/* Mobile: step counter + label */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gold uppercase tracking-wider">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-xs text-surface-dark-muted">{stepLabels[currentStep - 1]}</span>
      </div>
      {/* Progress bar */}
      <div
        className="h-1.5 bg-surface-dark-border rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={currentStep}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-label={`Application progress: step ${currentStep} of ${totalSteps}, ${stepLabels[currentStep - 1]}`}
      >
        <div
          className="h-full bg-gold rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Visually-hidden step list for screen readers */}
      <ol className="sr-only">
        {stepLabels.map((label, i) => {
          const stepNum = i + 1;
          const state = stepNum < currentStep ? 'Completed' : stepNum === currentStep ? 'Current' : 'Not started';
          return (
            <li
              key={i}
              aria-current={stepNum === currentStep ? 'step' : undefined}
            >
              {`Step ${stepNum} of ${totalSteps}: ${label} — ${state}`}
            </li>
          );
        })}
      </ol>
      {/* Desktop: step dots */}
      <div className="hidden md:flex justify-between mt-3" aria-hidden="true">
        {stepLabels.map((label, i) => (
          <div key={i} className="flex flex-col items-center gap-1" style={{ width: `${100 / totalSteps}%` }}>
            <div className={`h-2 w-2 rounded-full transition-colors ${
              i + 1 < currentStep ? 'bg-gold' :
              i + 1 === currentStep ? 'bg-gold ring-2 ring-gold/30' :
              'bg-surface-dark-border'
            }`} />
            <span className={`text-[10px] text-center leading-tight ${
              i + 1 === currentStep ? 'text-gold' : 'text-surface-dark-muted'
            }`}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
