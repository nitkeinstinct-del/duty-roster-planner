import { useCallback, useEffect, useState } from 'react';

export type SavedInfo = { ready: boolean; message: string };

/** Keeps a JSON value in this browser's localStorage. Nothing is sent anywhere. */
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void, SavedInfo] {
    const [value, setValue] = useState<T>(initial);
    const [info, setInfo] = useState<SavedInfo>({ ready: false, message: '' });
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(key);
            if (raw) setValue({ ...initial, ...JSON.parse(raw) });
            setInfo({ ready: true, message: '' });
        } catch {
            setInfo({ ready: true, message: 'Saving is unavailable in this browser. Changes last until you close the page.' });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    const set = useCallback((v: T) => {
        setValue(v);
        try { window.localStorage.setItem(key, JSON.stringify(v)); } catch { setInfo({ ready: true, message: 'Could not save to this browser.' }); }
    }, [key]);
    return [value, set, info];
}
