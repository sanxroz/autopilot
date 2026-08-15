export interface ReviewerOverride {
  reviewer: string;
  requested: boolean;
}

export type ReviewerOverrides = Record<string, ReviewerOverride>;

export function applyReviewerOverrides(
  reviewers: string[],
  overrides: ReviewerOverrides,
): string[] {
  const reviewersByLogin = new Map(
    reviewers.map((reviewer) => [reviewer.toLowerCase(), reviewer]),
  );

  for (const { reviewer, requested } of Object.values(overrides)) {
    if (requested) {
      reviewersByLogin.set(reviewer.toLowerCase(), reviewer);
    } else {
      reviewersByLogin.delete(reviewer.toLowerCase());
    }
  }

  return [...reviewersByLogin.values()];
}

export function clearAcknowledgedReviewerOverrides(
  overrides: ReviewerOverrides,
  reviewers: string[],
): ReviewerOverrides {
  const requestedReviewers = new Set(reviewers.map((reviewer) => reviewer.toLowerCase()));

  return Object.fromEntries(
    Object.entries(overrides).filter(([, { reviewer, requested }]) => (
      requestedReviewers.has(reviewer.toLowerCase()) !== requested
    )),
  );
}
