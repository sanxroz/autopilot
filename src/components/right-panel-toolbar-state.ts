export function shouldShowMergedStatus(
  prMerged: boolean | undefined,
  hasMerged: boolean,
): boolean {
  return hasMerged || prMerged === true;
}
