import { useState } from 'react';
import { MoreVertical, Trash2, Edit2, Check, X, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Project } from './ProjectCard';

interface ProjectListViewProps {
  projects: Project[];
  onOpenProject: (projectId: string) => void;
  onRefresh?: () => void;
}

export const ProjectListView = ({ projects, onOpenProject, onRefresh }: ProjectListViewProps) => {
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const { toast } = useToast();

  const toggleSelectMode = () => { setIsSelectMode(!isSelectMode); setSelectedProjects(new Set()); };
  const toggleProject = (id: string) => {
    const next = new Set(selectedProjects);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedProjects(next);
  };

  const startEditing = (p: Project) => { setEditingId(p.id); setEditValue(p.title); };
  const cancelEditing = () => { setEditingId(null); setEditValue(''); };

  const saveTitle = async (projectId: string) => {
    if (!editValue.trim()) return;
    const { error } = await supabase.from('projects').update({ title: editValue.trim(), updated_at: new Date().toISOString() }).eq('id', projectId);
    if (error) { toast({ title: 'Error', description: 'Failed to update.', variant: 'destructive' }); }
    else { toast({ title: 'Updated' }); onRefresh?.(); }
    setEditingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={toggleSelectMode} variant={isSelectMode ? 'default' : 'outline'} size="sm">
          {isSelectMode ? 'Cancel' : 'Select'}
        </Button>
        {isSelectMode && selectedProjects.size > 0 && (
          <Button onClick={() => setDeleteDialogOpen(true)} variant="destructive" size="sm">
            <Trash2 className="w-4 h-4 mr-2" />Delete ({selectedProjects.size})
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border-default bg-surface-1 overflow-hidden dark:border-white/[0.08] dark:bg-zinc-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-default bg-surface-2 dark:border-white/[0.08]">
              <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">Title</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">Updated</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-text-tertiary uppercase tracking-wider">Actions</th>
              {isSelectMode && <th className="px-6 py-3 text-center w-20" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default dark:divide-white/[0.08]">
            {projects.map((project) => (
              <tr key={project.id} className="hover:bg-surface-2 transition-colors">
                <td className="px-6 py-4">
                  {editingId === project.id ? (
                    <div className="flex items-center gap-2">
                      <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8 max-w-md" autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(project.id); if (e.key === 'Escape') cancelEditing(); }} />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveTitle(project.id)}><Check className="w-4 h-4 text-green-500" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEditing}><X className="w-4 h-4 text-red-500" /></Button>
                    </div>
                  ) : (
                    <button onClick={() => onOpenProject(project.id)} className="text-sm font-medium text-foreground hover:text-accent-purple transition-colors text-left">
                      {project.title}
                    </button>
                  )}
                </td>
                <td className="px-6 py-4"><Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-400/30">Active</Badge></td>
                <td className="px-6 py-4"><span className="text-sm text-text-tertiary">{format(new Date(project.updated_at), 'MMM d, yyyy')}</span></td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEditing(project)}><Edit2 className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onOpenProject(project.id)}><ExternalLink className="w-4 h-4" /></Button>
                  </div>
                </td>
                {isSelectMode && (
                  <td className="px-6 py-4 text-center">
                    <Checkbox checked={selectedProjects.has(project.id)} onCheckedChange={() => toggleProject(project.id)} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Projects</AlertDialogTitle>
            <AlertDialogDescription>Are you sure? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};