import { Plus } from 'lucide-react';

interface NewProjectCardProps {
  onClick: () => void;
}

export const NewProjectCard = ({ onClick }: NewProjectCardProps) => {
  return (
    <button
      onClick={onClick}
      className="w-full aspect-[4/3] bg-surface-1 border-2 border-dashed border-border-default rounded-xl flex flex-col items-center justify-center gap-3 hover:border-border-strong hover:bg-surface-2 transition-all duration-200 group"
    >
      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-accent-purple/20 to-accent-purple/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
        <Plus className="w-7 h-7 text-foreground" />
      </div>
      <div className="text-center">
        <p className="text-base font-medium text-foreground mb-1">New Project</p>
        <p className="text-sm text-muted-foreground">Start creating</p>
      </div>
    </button>
  );
};