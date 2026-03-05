import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FeedType, MogPost } from "@/types/mog";

type MogFeedResponse = {
  success: boolean;
  items: MogPost[];
  next_cursor: string | null;
  has_more: boolean;
  error?: string;
};

const PAGE_SIZE = 20;

async function fetchMogPosts(
  feedType: FeedType,
  address?: string,
  cursor: string | null = null,
): Promise<MogFeedResponse> {
  const { data, error } = await supabase.functions.invoke("mog-feed", {
    body: {
      feed_type: feedType,
      wallet: address?.toLowerCase(),
      cursor,
      limit: PAGE_SIZE,
      sort: "new",
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to load feed");
  }

  if (!data?.success) {
    throw new Error(data?.error || "Failed to load feed");
  }

  return {
    success: true,
    items: (data.items || []) as MogPost[],
    next_cursor: data.next_cursor || null,
    has_more: Boolean(data.has_more),
  };
}

export function useMogPosts(feedType: FeedType, address?: string) {
  const query = useInfiniteQuery({
    queryKey: ["mog-posts", feedType, address],
    queryFn: ({ pageParam }) => fetchMogPosts(feedType, address, pageParam as string | null),
    initialPageParam: null,
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.next_cursor : undefined),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const seen = new Set<string>();
  const posts = (query.data?.pages || [])
    .flatMap((page) => page.items)
    .filter((post) => {
      if (seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    });

  return {
    posts,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}
