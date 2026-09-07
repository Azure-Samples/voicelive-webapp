export interface ExecutiveProfile {
  id: string;
  ownerName: string;
  ownerUserId: string;
  confidentialTerms: string[];
  sensitiveProjects: string[];
}

export interface MeetingEvent {
  sessionId: string;
  profileId: string;
  speaker: 'participant' | 'agent' | 'system';
  text: string;
  occurredAt?: string;
}

export interface StoredMeetingEvent extends MeetingEvent {
  occurredAt: string;
  directedAtOwner: boolean;
  mentionsOwner: boolean;
}

export interface ToolResult {
  status: 'ok' | 'booked' | 'conflict' | 'blocked' | 'not_found';
  message: string;
  data?: unknown;
}
