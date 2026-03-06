import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export function useProjectShare(projectId: string) {
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateShareLink = useCallback(async (
    accessLevel: 'view' | 'comment' | 'edit',
    expiresIn: string
  ) => {
    setIsGenerating(true);
    try {
      const token = crypto.randomUUID();
      const link = `${window.location.origin}/share/${token}`;
      setShareLink(link);
      return link;
    } catch {
      toast.error('Failed to generate share link');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [projectId]);

  const updateProjectVisibility = useCallback(async (isPrivate: boolean) => {
    window.dispatchEvent(
      new CustomEvent('project-visibility-updated', {
        detail: { projectId, isPrivate },
      })
    );
    toast.success(`Project is now ${isPrivate ? 'private' : 'public'}`);
  }, [projectId]);

  return { shareLink, isGenerating, generateShareLink, updateProjectVisibility };
}
