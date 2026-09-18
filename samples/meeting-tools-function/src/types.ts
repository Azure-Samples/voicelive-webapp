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

export interface MeetingSummaryItem {
  occurredAt: string;
  speaker: StoredMeetingEvent['speaker'];
  text: string;
}

export interface MeetingSummary {
  sessionId: string;
  profileId: string;
  finalizedAt: string;
  transcriptEventCount: number;
  overview: string[];
  decisions: MeetingSummaryItem[];
  actionItems: MeetingSummaryItem[];
  openQuestions: MeetingSummaryItem[];
  executiveMentions: MeetingSummaryItem[];
}

export type DelegationStatus =
  | 'starting'
  | 'active'
  | 'completed'
  | 'cancelling'
  | 'cancelled'
  | 'failed';

export interface DelegationRecord {
  id: string;
  clientRequestId: string;
  profileId: string;
  meetingJoinUrl: string;
  meetingBrief: string;
  status: DelegationStatus;
  createdAt: string;
  updatedAt: string;
  mediaHostCallId?: string;
  error?: string;
}

export interface ToolResult {
  status: 'ok' | 'booked' | 'conflict' | 'blocked' | 'not_found';
  message: string;
  data?: unknown;
}
