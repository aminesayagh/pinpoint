import { Button } from '@heroui/react';

export default function App() {
  return (
    <main className="p-4">
      <h1 className="text-lg font-semibold">Pinpoint</h1>
      <Button onPress={() => console.log('ready')}>Ready</Button>
    </main>
  );
}
