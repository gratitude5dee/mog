import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MogPost, FeedType } from "@/types/mog";

interface FetchMogPostsParams {
  offset: number;
  limit: number;
  feedType: FeedType;
  address?: string;
}

async function fetchMogPosts({ offset, limit, feedType, address }: FetchMogPostsParams): Promise<MogPost[]> {
  if (feedType === 'following' && address) {
    // Get following list first
    const { data: following } = await supabase
      .from('mog_follows')
      .select('following_wallet')
      .eq('follower_wallet', address.toLowerCase());

    if (!following || following.length === 0) {
      return [];
    }

    const followingWallets = following.map(f => f.following_wallet);
    const { data, error } = await supabase
      .from('mog_posts')
      .select('*')
      .eq('is_published', true)
      .in('creator_wallet', followingWallets)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return (data as MogPost[]) || [];
  }

  const { data, error } = await supabase
    .from('mog_posts')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data as MogPost[]) || [];
}

const PAGE_SIZE = 20;

export function useMogPosts(feedType: FeedType, address?: string) {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['mog-posts', feedType, address],
    queryFn: ({ pageParam = 0 }) => 
      fetchMogPosts({ 
        offset: pageParam, 
        limit: PAGE_SIZE, 
        feedType, 
        address 
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    initialPageParam: 0,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  // Flatten all pages into a single array
  const posts = query.data?.pages.flat() ?? [];

  // Prefetch next page when we're close to the end
  const prefetchNextPage = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  };

  return {
    posts,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    prefetchNextPage,
    refetch: query.refetch,
  };
}
