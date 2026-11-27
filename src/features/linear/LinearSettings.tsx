import { ArrowRightFromSquare } from '@gravity-ui/icons';
import { Button, Description, Input, Label, TextField, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';
import { saveSettings, useSettings, type Settings } from '@/lib/settings';
import {
  getTeamOptions,
  getTeams,
  getViewer,
  LinearError,
  PRIORITIES,
  type Named,
  type Team,
} from './api';

const selectClass = 'w-full rounded-lg border border-default bg-surface px-2 py-1.5 text-sm';

/** Connect a Linear account and choose the default destination for new sessions. */
export function LinearSettings() {
  const settings = useSettings();
  const apiKey = settings?.linear_api_key;
  const [viewer, setViewer] = useState<Named>();
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<LinearError>();

  useEffect(() => {
    if (!apiKey) return;
    let live = true;
    Promise.all([getViewer(apiKey), getTeams(apiKey)])
      .then(([v, t]) => live && (setViewer(v), setTeams(t), setError(undefined)))
      .catch((e: LinearError) => live && (setViewer(undefined), setError(e)));
    return () => void (live = false);
  }, [apiKey]);

  if (!settings) return null;
  if (!apiKey || error?.kind === 'auth') return <ConnectForm error={error} />;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">
          {viewer ? (
            <>
              Connected to Linear as <strong>{viewer.name}</strong>
            </>
          ) : error ? (
            <span className="text-danger">{error.message}</span>
          ) : (
            'Connecting to Linear…'
          )}
        </p>
        <Tooltip delay={300}>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label="Disconnect Linear"
            onPress={() => saveSettings({ linear_api_key: undefined })}
          >
            <ArrowRightFromSquare />
          </Button>
          <Tooltip.Content>Disconnect Linear</Tooltip.Content>
        </Tooltip>
      </div>
      {viewer && <Destination apiKey={apiKey} settings={settings} teams={teams} />}
    </section>
  );
}

function ConnectForm({ error }: { error?: LinearError }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(error?.message);

  async function connect() {
    setBusy(true);
    try {
      await getViewer(key.trim()); // check before saving
      await saveSettings({ linear_api_key: key.trim() });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void connect();
      }}
    >
      <TextField value={key} onChange={setKey} type="password" isRequired>
        <Label>Linear personal API key</Label>
        <Input placeholder="lin_api_…" autoComplete="off" />
        <Description>
          Create one in Linear under{' '}
          <a
            className="underline"
            href="https://linear.app/settings/account/security"
            target="_blank"
            rel="noreferrer"
          >
            Settings → Security &amp; access
          </a>
          . It stays in this browser only.
        </Description>
      </TextField>
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
      <Button type="submit" isPending={busy} isDisabled={!key.trim()}>
        Connect Linear
      </Button>
    </form>
  );
}

function Destination({
  apiKey,
  settings,
  teams,
}: {
  apiKey: string;
  settings: Settings;
  teams: Team[];
}) {
  const teamId = settings.default_linear_team_id;
  const [options, setOptions] = useState<{ projects: Named[]; labels: Named[] }>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!teamId) return;
    let live = true;
    getTeamOptions(apiKey, teamId)
      .then((o) => live && (setOptions(o), setError(undefined)))
      .catch((e: Error) => live && setError(e.message));
    return () => void (live = false);
  }, [apiKey, teamId]);

  const labelIds = settings.default_linear_label_ids ?? [];
  const toggleLabel = (id: string) =>
    saveSettings({
      default_linear_label_ids: labelIds.includes(id)
        ? labelIds.filter((l) => l !== id)
        : [...labelIds, id],
    });

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Default destination for new sessions</h2>
      <label className="flex flex-col gap-1 text-sm">
        Team
        <select
          className={selectClass}
          value={teamId ?? ''}
          onChange={(e) =>
            // Project and labels belong to a team: reset them with it.
            saveSettings({
              default_linear_team_id: e.target.value || undefined,
              default_linear_project_id: undefined,
              default_linear_label_ids: undefined,
            })
          }
        >
          <option value="">Choose a team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.key})
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      {teamId && options && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Project
            <select
              className={selectClass}
              value={settings.default_linear_project_id ?? ''}
              onChange={(e) =>
                saveSettings({ default_linear_project_id: e.target.value || undefined })
              }
            >
              <option value="">No project</option>
              {options.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Priority
            <select
              className={selectClass}
              value={settings.default_linear_priority ?? 0}
              onChange={(e) => saveSettings({ default_linear_priority: Number(e.target.value) })}
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="mb-1">Labels</legend>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {options.labels.map((l) => (
                <label key={l.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={labelIds.includes(l.id)}
                    onChange={() => toggleLabel(l.id)}
                  />
                  {l.name}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </div>
  );
}
