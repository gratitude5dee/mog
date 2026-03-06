import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useProjectActions = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const deleteProject = async (projectId: string): Promise<boolean> => {
    try {
      setIsDeleting(true);
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (error) {
        toast({ title: 'Error', description: 'Failed to delete project.', variant: 'destructive' });
        return false;
      }

      toast({ title: 'Success', description: 'Project deleted successfully.' });
      return true;
    } catch {
      toast({ title: 'Error', description: 'Failed to delete project.', variant: 'destructive' });
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteProject, isDeleting };
};
