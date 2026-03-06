import { ArrowUpDown } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type SortOption = 'updated' | 'created' | 'name';

interface SortDropdownProps {
  value: SortOption;
  onChange: (option: SortOption) => void;
}

export const SortDropdown = ({ value, onChange }: SortDropdownProps) => {
  const options = [
    { value: 'updated' as SortOption, label: 'Last edited' },
    { value: 'created' as SortOption, label: 'Created date' },
    { value: 'name' as SortOption, label: 'Name (A-Z)' },
  ];

  const currentLabel = options.find(opt => opt.value === value)?.label || 'Last edited';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 h-9 px-3 bg-surface-2 border border-border-default rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors">
        <ArrowUpDown className="w-4 h-4" />
        <span>{currentLabel}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-surface-1 border-border-default">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn("text-sm cursor-pointer", value === option.value ? "text-foreground" : "text-muted-foreground")}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};