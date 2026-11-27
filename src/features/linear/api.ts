// Minimal Linear GraphQL client: a personal API key and fetch, no SDK.
const ENDPOINT = 'https://api.linear.app/graphql';

/**
 * auth: the key is invalid or revoked.
 * rejected: Linear answered and refused; nothing was created.
 * network / server: no clear answer; a write may or may not have happened.
 */
export type LinearErrorKind = 'auth' | 'rejected' | 'network' | 'server';

export class LinearError extends Error {
  readonly kind: LinearErrorKind;
  constructor(message: string, kind: LinearErrorKind) {
    super(message);
    this.kind = kind;
  }
}

interface GqlBody<T> {
  data?: T;
  errors?: { message: string; extensions?: { type?: string; code?: string } }[];
}

export async function gql<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: apiKey },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new LinearError(`Could not reach Linear: ${(e as Error).message}`, 'network');
  }
  const body = (await res.json().catch(() => undefined)) as GqlBody<T> | undefined;
  const errors = body?.errors ?? [];
  const authFailed =
    res.status === 401 ||
    errors.some(
      (e) => /authentication/i.test(e.extensions?.type ?? '') || e.extensions?.code === 'AUTHENTICATION_ERROR',
    );
  if (authFailed) {
    throw new LinearError('Linear refused the API key. It may be wrong or revoked.', 'auth');
  }
  if (res.status >= 500) throw new LinearError(`Linear had a server error (HTTP ${res.status}).`, 'server');
  if (errors.length) throw new LinearError(errors.map((e) => e.message).join('; '), 'rejected');
  if (!res.ok || !body?.data) {
    throw new LinearError(`Unexpected answer from Linear (HTTP ${res.status}).`, 'rejected');
  }
  return body.data;
}

export interface Named {
  id: string;
  name: string;
}
export interface Team extends Named {
  key: string;
}

export async function getViewer(apiKey: string) {
  const d = await gql<{ viewer: Named }>(apiKey, 'query { viewer { id name } }');
  return d.viewer;
}

export async function getTeams(apiKey: string) {
  const d = await gql<{ teams: { nodes: Team[] } }>(
    apiKey,
    'query { teams(first: 100) { nodes { id key name } } }',
  );
  return d.teams.nodes.sort((a, b) => a.name.localeCompare(b.name));
}

/** Projects of a team, and the labels usable in it (workspace labels plus the team's own). */
export async function getTeamOptions(apiKey: string, teamId: string) {
  const d = await gql<{
    team: { projects: { nodes: Named[] } };
    issueLabels: { nodes: Named[] };
  }>(
    apiKey,
    `query($teamId: String!) {
      team(id: $teamId) { projects(first: 100) { nodes { id name } } }
      issueLabels(first: 250, filter: { or: [{ team: { null: true } }, { team: { id: { eq: $teamId } } }] }) {
        nodes { id name }
      }
    }`,
    { teamId },
  );
  const byName = (a: Named, b: Named) => a.name.localeCompare(b.name);
  return { projects: d.team.projects.nodes.sort(byName), labels: d.issueLabels.nodes.sort(byName) };
}

export const PRIORITIES = [
  { value: 0, name: 'No priority' },
  { value: 1, name: 'Urgent' },
  { value: 2, name: 'High' },
  { value: 3, name: 'Medium' },
  { value: 4, name: 'Low' },
];
