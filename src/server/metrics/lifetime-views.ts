export interface PostLatestViewsObservation {
  postId: string;
  latestViews?: {
    numericValue: number | null;
    precision: "EXACT" | "ROUNDED" | "UNAVAILABLE";
  } | null;
}

export interface LifetimeViewsBreakdown {
  totalPosts: number;
  exactPostsCount: number;
  roundedPostsCount: number;
  unavailablePostsCount: number;
  missingObservationPostsCount: number;
}

export interface LifetimeViewsResult {
  totalEstimate: number;
  exactSum: number;
  roundedEstimate: number;
  isExact: boolean;
  breakdown: LifetimeViewsBreakdown;
}

/**
 * Computes channel lifetime views aggregation across all active (non-deleted) posts.
 * Strictly separates exact counts from rounded estimates.
 * Missing or unavailable observations are never treated as zero.
 */
export function calculateLifetimeViews(posts: PostLatestViewsObservation[]): LifetimeViewsResult {
  let exactSum = 0;
  let roundedEstimate = 0;
  let exactPostsCount = 0;
  let roundedPostsCount = 0;
  let unavailablePostsCount = 0;
  let missingObservationPostsCount = 0;

  for (const post of posts) {
    if (!post.latestViews) {
      missingObservationPostsCount++;
      continue;
    }

    const { numericValue, precision } = post.latestViews;

    if (precision === "EXACT" && numericValue !== null) {
      exactSum += numericValue;
      exactPostsCount++;
    } else if (precision === "ROUNDED" && numericValue !== null) {
      roundedEstimate += numericValue;
      roundedPostsCount++;
    } else {
      unavailablePostsCount++;
    }
  }

  const totalPosts = posts.length;
  const isExact =
    totalPosts === 0 ||
    (exactPostsCount === totalPosts &&
      roundedPostsCount === 0 &&
      unavailablePostsCount === 0 &&
      missingObservationPostsCount === 0);

  return {
    totalEstimate: exactSum + roundedEstimate,
    exactSum,
    roundedEstimate,
    isExact,
    breakdown: {
      totalPosts,
      exactPostsCount,
      roundedPostsCount,
      unavailablePostsCount,
      missingObservationPostsCount,
    },
  };
}
