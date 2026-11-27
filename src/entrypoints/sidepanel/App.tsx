import { LinearSettings } from '@/features/linear/LinearSettings';
import { SiteAccess } from '@/features/linear/SiteAccess';

export default function App() {
  return (
    <main className="flex flex-col gap-6 p-4">
      <h1 className="text-lg font-semibold">Pinpoint</h1>
      <LinearSettings />
      <SiteAccess />
    </main>
  );
}
