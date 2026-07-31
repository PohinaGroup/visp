import { useCallback, useLayoutEffect, useRef } from "react";

export function useAfterMount<Args extends unknown[]>(
	handler: (...args: Args) => void,
): (...args: Args) => void {
	const handlerRef = useRef(handler);
	const mountedRef = useRef(false);
	const queuedRef = useRef<Args[]>([]);
	handlerRef.current = handler;

	useLayoutEffect(() => {
		mountedRef.current = true;
		for (const args of queuedRef.current) handlerRef.current(...args);
		queuedRef.current = [];
		return () => {
			mountedRef.current = false;
		};
	}, []);

	return useCallback((...args: Args) => {
		if (!mountedRef.current) {
			queuedRef.current.push(args);
			return;
		}
		handlerRef.current(...args);
	}, []);
}
