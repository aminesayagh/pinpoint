import { useEffect, useState } from 'react';
import { useSettings } from '@/lib/settings';
import { getTeamOptions, getTeams } from './api';

/** Human-readable "Team › Project" for stored Linear ids. Falls back to "Linear" while loading or offline. */
export function useDestination(teamId?: string, projectId?: string) {
  const apiKey = useSettings()?.linear_api_key;
  const [label, setLabel] = useState<string>();
  useEffect(() => {
    if (!apiKey || !teamId) return;
    let live = true;
    Promise.all([getTeams(apiKey), projectId ? getTeamOptions(apiKey, teamId) : undefined])
      .then(([teams, options]) => {
        const team = teams.find((t) => t.id === teamId)?.name ?? 'Unknown team';
        const project = options?.projects.find((p) => p.id === projectId)?.name;
        if (live) setLabel(project ? `${team} › ${project}` : team);
      })
      .catch(() => {});
    return () => void (live = false);
  }, [apiKey, teamId, projectId]);
  return label ?? 'Linear';
}
