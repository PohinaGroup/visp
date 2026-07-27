import { type ReactNode, useEffect, useRef, useState } from "react";
import {
	Animated,
	PanResponder,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import type { ObsTile } from "../lib/use-obs-tiles";
import { moveItem, slotIndex } from "./deck-layout";

const TAP_SLOP = 8;

type Props = {
	tiles: ObsTile[];
	columns: number;
	cellWidth: number;
	cellHeight: number;
	gap: number;
	onReorder: (ids: number[]) => void;
	onEdit: (tile: ObsTile) => void;
	renderTile: (tile: ObsTile, dragging: boolean) => ReactNode;
};

export function DraggableDeck({
	tiles,
	columns,
	cellWidth,
	cellHeight,
	gap,
	onReorder,
	onEdit,
	renderTile,
}: Props) {
	const [order, setOrder] = useState<number[]>(() => tiles.map((t) => t.id));
	const [dragging, setDragging] = useState<number | null>(null);
	const orderRef = useRef(order);
	orderRef.current = order;
	const values = useRef(new Map<number, Animated.ValueXY>());

	const slotXY = (index: number) => ({
		x: (index % columns) * (cellWidth + gap),
		y: Math.floor(index / columns) * (cellHeight + gap),
	});

	const valueFor = (id: number, index: number) => {
		let value = values.current.get(id);
		if (!value) {
			value = new Animated.ValueXY(slotXY(index));
			values.current.set(id, value);
		}
		return value;
	};

	// Resync order when tiles are added/removed elsewhere (create/delete/server).
	useEffect(() => {
		const ids = tiles.map((t) => t.id);
		setOrder((prev) => {
			const known = new Set(ids);
			const kept = prev.filter((id) => known.has(id));
			const added = ids.filter((id) => !kept.includes(id));
			return kept.length === prev.length && added.length === 0
				? prev
				: [...kept, ...added];
		});
	}, [tiles]);

	// Spring every resting tile to its slot whenever the order changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: slotXY/valueFor read layout props, tracked below.
	useEffect(() => {
		order.forEach((id, index) => {
			if (id === dragging) return;
			Animated.spring(valueFor(id, index), {
				toValue: slotXY(index),
				useNativeDriver: false,
				bounciness: 6,
				speed: 18,
			}).start();
		});
	}, [order, dragging, columns, cellWidth, cellHeight, gap]);

	const byId = new Map(tiles.map((t) => [t.id, t]));
	const rows = Math.ceil(order.length / columns);
	const height = rows > 0 ? rows * cellHeight + (rows - 1) * gap : 0;

	return (
		<View style={{ height, position: "relative" }}>
			{order.map((id) => {
				const tile = byId.get(id);
				if (!tile) return null;
				const index = order.indexOf(id);
				return (
					<Cell
						key={id}
						value={valueFor(id, index)}
						width={cellWidth}
						height={cellHeight}
						dragging={dragging === id}
						onGrant={() => {
							setDragging(id);
							return orderRef.current.indexOf(id);
						}}
						onMove={(startIndex, dx, dy) => {
							const base = slotXY(startIndex);
							valueFor(id, startIndex).setValue({
								x: base.x + dx,
								y: base.y + dy,
							});
							const target = slotIndex(
								base.x + dx,
								base.y + dy,
								columns,
								cellWidth,
								cellHeight,
								gap,
								orderRef.current.length,
							);
							const current = orderRef.current.indexOf(id);
							if (target !== current) {
								setOrder(moveItem(orderRef.current, current, target));
							}
						}}
						onRelease={() => {
							const finalIndex = orderRef.current.indexOf(id);
							Animated.spring(valueFor(id, finalIndex), {
								toValue: slotXY(finalIndex),
								useNativeDriver: false,
								bounciness: 6,
								speed: 18,
							}).start();
							setDragging(null);
							onReorder(orderRef.current);
						}}
						onTap={() => onEdit(tile)}
					>
						{renderTile(tile, dragging === id)}
					</Cell>
				);
			})}
		</View>
	);
}

type CellProps = {
	value: Animated.ValueXY;
	width: number;
	height: number;
	dragging: boolean;
	onGrant: () => number;
	onMove: (startIndex: number, dx: number, dy: number) => void;
	onRelease: () => void;
	onTap: () => void;
	children: ReactNode;
};

function Cell({
	value,
	width,
	height,
	dragging,
	onGrant,
	onMove,
	onRelease,
	onTap,
	children,
}: CellProps) {
	const startIndex = useRef(0);
	// Keep the latest callbacks reachable from the once-created responder.
	const cbs = useRef({ onGrant, onMove, onRelease });
	cbs.current = { onGrant, onMove, onRelease };
	const responder = useRef(
		PanResponder.create({
			// Claim only once a real drag begins, so taps fall through to the
			// Pressable and vertical scrolls aren't swallowed on a plain touch.
			onStartShouldSetPanResponder: () => false,
			onMoveShouldSetPanResponder: (_e, g) =>
				Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP,
			onPanResponderGrant: () => {
				startIndex.current = cbs.current.onGrant();
			},
			onPanResponderMove: (_e, g) => {
				cbs.current.onMove(startIndex.current, g.dx, g.dy);
			},
			onPanResponderRelease: () => cbs.current.onRelease(),
			onPanResponderTerminate: () => cbs.current.onRelease(),
		}),
	).current;

	return (
		<Animated.View
			{...responder.panHandlers}
			style={{
				position: "absolute",
				width,
				height,
				transform: value.getTranslateTransform(),
				zIndex: dragging ? 10 : 1,
				elevation: dragging ? 10 : 1,
			}}
		>
			<Pressable onPress={onTap} style={styles.cellPressable}>
				{children}
			</Pressable>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	cellPressable: { flex: 1 },
});
