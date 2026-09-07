import type { HttpRequest, HttpResponseInit } from '@azure/functions';

export async function readJson<T>(request: HttpRequest): Promise<T> {
  const body = await request.json();
  if (!body || typeof body !== 'object') {
    throw new Error('A JSON request body is required.');
  }
  return body as T;
}

export function json(
  body: unknown,
  status = 200,
): HttpResponseInit {
  return { status, jsonBody: body };
}

export function errorResponse(error: unknown): HttpResponseInit {
  return json(
    { error: error instanceof Error ? error.message : 'Request failed.' },
    400,
  );
}
