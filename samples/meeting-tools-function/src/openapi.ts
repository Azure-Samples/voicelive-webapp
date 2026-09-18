export function createOpenApi(origin: string): object {
  return {
    openapi: '3.0.1',
    info: {
      title: 'Foundry executive meeting tools',
      version: '1.0.0',
      description:
        'External meeting guardrail, recap, calendar, and Teams control tools for a Foundry Voice-First Agent.',
    },
    servers: [{ url: `${origin}/api` }],
    components: {
      securitySchemes: {
        functionKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-functions-key',
        },
      },
      schemas: {
        ProfileRequest: {
          type: 'object',
          required: ['profileId'],
          properties: { profileId: { type: 'string' } },
        },
      },
    },
    security: [{ functionKey: [] }],
    paths: {
      '/tools/evaluate-disclosure': {
        post: {
          operationId: 'evaluate_meeting_disclosure',
          summary:
            'Remove confidential or personal content before it can be spoken in a group meeting.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['profileId', 'text'],
                  properties: {
                    profileId: { type: 'string' },
                    text: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Shareable meeting text.' } },
        },
      },
      '/tools/meeting-control': {
        post: {
          operationId: 'control_meeting_hand',
          summary:
            'Raise or lower the delegate hand in the active Teams meeting. Use before and after a proactive contribution, never for a direct answer.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['sessionId', 'action'],
                  properties: {
                    sessionId: { type: 'string' },
                    action: {
                      type: 'string',
                      enum: ['raise_hand', 'lower_hand'],
                    },
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Control command published.' } },
        },
      },
      '/tools/create-event': {
        post: {
          operationId: 'create_owner_calendar_event',
          summary:
            'Book a new meeting on the owner calendar only after checking conflicts. Do not use this tool to move or cancel an existing meeting from a group call.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['profileId', 'subject', 'start'],
                  properties: {
                    profileId: { type: 'string' },
                    subject: { type: 'string' },
                    start: { type: 'string', format: 'date-time' },
                    end: { type: 'string', format: 'date-time' },
                    durationMinutes: { type: 'integer' },
                    attendees: {
                      type: 'array',
                      items: { type: 'string', format: 'email' },
                    },
                    notes: { type: 'string' },
                    timeZone: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Booked or conflict result.' } },
        },
      },
      '/tools/meeting-recap': {
        post: {
          operationId: 'get_meeting_recap_source',
          summary:
            'Read the authoritative transcript for a meeting and highlight where the owner was addressed or mentioned.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['profileId', 'sessionId'],
                  properties: {
                    profileId: { type: 'string' },
                    sessionId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Meeting transcript records.' } },
        },
      },
      '/tools/meeting-summary': {
        post: {
          operationId: 'get_finalized_meeting_summary',
          summary:
            'Read the finalized extractive meeting summary with decisions, action items, open questions, and executive mentions.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['profileId', 'sessionId'],
                  properties: {
                    profileId: { type: 'string' },
                    sessionId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Finalized meeting summary.' } },
        },
      },
      '/tools/oof-catchup': {
        post: {
          operationId: 'get_oof_catchup_guidance',
          summary:
            'Return orchestration guidance for a resolution-aware out-of-office briefing. The agent must then use its memory and Microsoft 365 read tools.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    days: { type: 'integer', minimum: 1, maximum: 30 },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Agent orchestration guidance.' } },
        },
      },
    },
  };
}
