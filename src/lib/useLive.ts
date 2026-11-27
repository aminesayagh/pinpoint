import { useEffect, useRef, useState } from 'react';
import { onChange } from './db';

/** Runs `load` now and again after every local data change. `key` restarts it (e.g. a session id). */
export function useLive<T>(load: () => Promise<T>, key = '') {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<Error>();
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let live = true;
    const run = () =>
      void loadRef.current().then(
        (v) => live && (setValue(v), setError(undefined)),
        (e: Error) => live && setError(e),
      );
    run();
    const off = onChange(run);
    return () => {
      live = false;
      off();
    };
  }, [key]);
  return { value, error };
}
