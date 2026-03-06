import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export function useUndoDelete() {
  const [isRestoring, setIsRestoring] = useState(false);

  const undoDelete = useCallback(async (projectId: string) => {
    setIsRestoring(true);
    try {
      window.dispatchEvent(
        new CustomEvent('project-restored', { detail: { projectId } })
      );
      toast.success('Project restored!');
      return true;
    } catch {
      toast.error('Failed to restore project');
      return false;
    } finally {
      setIsRestoring(false);
    }
  }, []);

  return { undoDelete, isRestoring };
}
