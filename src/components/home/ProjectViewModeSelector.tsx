import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'list';

interface ProjectViewModeSelectorProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const ProjectViewModeSelector = ({ viewMode, setViewMode }: ProjectViewModeSelectorProps) => {
  return (
    <div className="flex bg-surface-2 rounded-lg border border-border-default p-0.5">
      <button
        onClick={() => setViewMode('grid')}
        className={cn(
          "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
          viewMode === 'grid'
            ? 'bg-gradient-to-br from-accent-purple to-accent-purple/80 text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Grid
      </button>
      <button
        onClick={() => setViewMode('list')}
        className={cn(
          "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
          viewMode === 'list'
            ? 'bg-gradient-to-br from-accent-purple to-accent-purple/80 text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        List
      </button>
    </div>
  );
};