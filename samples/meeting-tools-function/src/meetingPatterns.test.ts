import { describe, expect, it } from 'vitest';

import { classifyOwnerReference } from './meetingPatterns.js';

describe('owner reference classification', () => {
  it('distinguishes a direct address from a mention', () => {
    const direct = classifyOwnerReference(
      'Alex, can you review this?',
      'Alex Morgan',
    );
    const mention = classifyOwnerReference(
      'Alex reviewed this yesterday.',
      'Alex Morgan',
    );

    expect(direct.directedAtOwner).toBe(true);
    expect(direct.mentionsOwner).toBe(true);
    expect(mention.directedAtOwner).toBe(false);
    expect(mention.mentionsOwner).toBe(true);
  });
});
