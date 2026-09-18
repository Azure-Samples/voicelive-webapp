import type {
  MeetingSummary,
  MeetingSummaryItem,
  StoredMeetingEvent,
} from './types.js';

const DECISION_PATTERN =
  /\b(agree(?:d|ment)?|approv(?:e|ed|al)|confirm(?:ed|ation)?|decid(?:e|ed)|decision)\b/i;
const ACTION_PATTERN =
  /\b(action item|follow up|need(?:s)? to|will|owner|due|by end of|next step)\b/i;
const QUESTION_PATTERN =
  /\?$|\b(open question|need to clarify|unclear|to be determined|tbd)\b/i;

function toItem(event: StoredMeetingEvent): MeetingSummaryItem {
  return {
    occurredAt: event.occurredAt,
    speaker: event.speaker,
    text: event.text.trim(),
  };
}

function uniqueItems(
  events: StoredMeetingEvent[],
  predicate: (event: StoredMeetingEvent) => boolean,
  limit = 20,
): MeetingSummaryItem[] {
  const seen = new Set<string>();
  const result: MeetingSummaryItem[] = [];
  for (const event of events) {
    const text = event.text.trim();
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key) || !predicate(event)) {
      continue;
    }
    seen.add(key);
    result.push(toItem(event));
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

export function createMeetingSummary(
  sessionId: string,
  profileId: string,
  events: StoredMeetingEvent[],
  finalizedAt = new Date().toISOString(),
): MeetingSummary {
  const chronological = [...events].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt),
  );
  return {
    sessionId,
    profileId,
    finalizedAt,
    transcriptEventCount: chronological.length,
    overview: uniqueItems(
      chronological,
      event => event.speaker !== 'system',
      5,
    ).map(item => item.text),
    decisions: uniqueItems(chronological, event =>
      DECISION_PATTERN.test(event.text),
    ),
    actionItems: uniqueItems(chronological, event =>
      ACTION_PATTERN.test(event.text),
    ),
    openQuestions: uniqueItems(chronological, event =>
      QUESTION_PATTERN.test(event.text.trim()),
    ),
    executiveMentions: uniqueItems(
      chronological,
      event => event.directedAtOwner || event.mentionsOwner,
    ),
  };
}
