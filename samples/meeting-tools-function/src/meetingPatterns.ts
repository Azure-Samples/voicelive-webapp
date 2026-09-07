function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function classifyOwnerReference(
  text: string,
  ownerName: string,
): { directedAtOwner: boolean; mentionsOwner: boolean } {
  const firstName = ownerName.trim().split(/\s+/)[0]?.toLowerCase();
  if (!firstName) {
    return { directedAtOwner: false, mentionsOwner: false };
  }
  const name = escapeRegex(firstName);
  const directedPatterns = [
    new RegExp(`(^|[.!?]\\s+)(hey |hi |ok |okay |so )?${name}\\s*,`, 'i'),
    new RegExp(`,\\s*${name}\\s*\\?`, 'i'),
    new RegExp(`\\b${name}\\s*\\?\\s*$`, 'i'),
    new RegExp(
      `\\b(tell|ask|remind|inform|update|brief|assign|delegate)\\s+${name}\\b`,
      'i',
    ),
    new RegExp(`\\bfor ${name} to\\b`, 'i'),
    new RegExp(`\\bover to (you,?\\s*)?${name}\\b`, 'i'),
  ];
  const directedAtOwner = directedPatterns.some(pattern => pattern.test(text));
  return {
    directedAtOwner,
    mentionsOwner:
      directedAtOwner || new RegExp(`\\b${name}\\b`, 'i').test(text),
  };
}
