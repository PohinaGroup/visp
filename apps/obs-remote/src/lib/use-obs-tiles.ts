import { useCallback, useEffect, useState } from "react";
import { apiClient } from "./backend";

export type TileAction =
	| "scene"
	| "stream"
	| "recording"
	| "virtualcam"
	| "replaybuffer"
	| "recordpause";

export type ObsTile = {
	id: number;
	position: number;
	label: string;
	color: string | null;
	action: TileAction;
	sceneName: string | null;
};

export type TileDraft = {
	label: string;
	color: string | null;
	action: TileAction;
	sceneName: string | null;
};

function message(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

export function useObsTiles(userId: string | undefined) {
	const [tiles, setTiles] = useState<ObsTile[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string>();

	useEffect(() => {
		if (!userId) {
			setTiles([]);
			return;
		}
		let active = true;
		setLoading(true);
		apiClient.obs.tiles.list
			.query()
			.then((rows) => {
				if (active) setTiles(rows);
			})
			.catch((cause) => {
				if (active) setError(message(cause, "Could not load tiles"));
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [userId]);

	const create = useCallback(async (draft: TileDraft) => {
		const tile = await apiClient.obs.tiles.create.mutate(draft);
		setTiles((current) => [...current, tile]);
	}, []);

	const update = useCallback(async (id: number, draft: TileDraft) => {
		const tile = await apiClient.obs.tiles.update.mutate({ id, ...draft });
		setTiles((current) => current.map((t) => (t.id === id ? tile : t)));
	}, []);

	const remove = useCallback(async (id: number) => {
		await apiClient.obs.tiles.delete.mutate({ id });
		setTiles((current) => current.filter((t) => t.id !== id));
	}, []);

	const reorder = useCallback(async (ids: number[]) => {
		// Optimistic: apply the new order locally, then reconcile with the server.
		setTiles((current) => {
			const byId = new Map(current.map((t) => [t.id, t]));
			return ids.flatMap((id, index) => {
				const tile = byId.get(id);
				return tile ? [{ ...tile, position: index }] : [];
			});
		});
		try {
			setTiles(await apiClient.obs.tiles.reorder.mutate({ ids }));
		} catch (cause) {
			setError(message(cause, "Could not save order"));
		}
	}, []);

	return {
		tiles,
		loading,
		error,
		create,
		update,
		remove,
		reorder,
		clearError: () => setError(undefined),
	};
}
