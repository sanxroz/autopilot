export interface ReviewerOverride {
  reviewer: string;
  requested: boolean;
}

export type ReviewerOverrides = Record<string, ReviewerOverride>;

export interface ReviewerCandidate {
  identifier: string;
  display_name: string;
  avatar_url: string;
  kind: "user" | "team";
}

export function fallbackReviewerCandidate(identifier: string): ReviewerCandidate {
  const parts = identifier.split("/");
  return {
    identifier,
    display_name: parts[parts.length - 1] || identifier,
    avatar_url: "",
    kind: identifier.includes("/") ? "team" : "user",
  };
}

export function buildReviewerOptions(
  candidates: ReviewerCandidate[],
  currentReviewers: string[],
  requestedReviewers: string[],
  author: string,
): ReviewerCandidate[] {
  const candidatesByIdentifier = new Map(
    candidates.map((candidate) => [candidate.identifier.toLowerCase(), candidate]),
  );
  for (const reviewer of currentReviewers) {
    const key = reviewer.toLowerCase();
    if (!candidatesByIdentifier.has(key)) {
      candidatesByIdentifier.set(key, fallbackReviewerCandidate(reviewer));
    }
  }

  const requested = new Set(requestedReviewers.map((reviewer) => reviewer.toLowerCase()));
  return [...candidatesByIdentifier.values()]
    .filter((candidate) => candidate.kind === "team" || candidate.identifier.toLowerCase() !== author.toLowerCase())
    .sort((a, b) => (
      Number(requested.has(b.identifier.toLowerCase())) - Number(requested.has(a.identifier.toLowerCase()))
      || a.display_name.localeCompare(b.display_name)
    ));
}

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
