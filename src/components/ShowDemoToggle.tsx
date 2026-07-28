import { FlaskConical } from 'lucide-react';
import { useShowDemo } from '@/hooks/useShowDemo';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** Staff-only header control for revealing demo driver accounts. */
export default function ShowDemoToggle() {
  const { showDemo, setShowDemo } = useShowDemo();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <label
            className={`flex items-center gap-2 rounded-lg border px-2 py-1 cursor-pointer transition-colors ${
              showDemo
                ? 'border-purple-400/50 bg-purple-500/10 text-purple-700'
                : 'border-transparent text-muted-foreground hover:bg-muted'
            }`}
          >
            <FlaskConical className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline text-xs font-medium whitespace-nowrap">
              Demo accounts
            </span>
            <Switch
              checked={showDemo}
              onCheckedChange={setShowDemo}
              aria-label="Show demo accounts"
            />
          </label>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{showDemo ? 'Demo driver accounts are visible' : 'Demo driver accounts are hidden'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
