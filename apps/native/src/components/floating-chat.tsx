import {
	BADGE_CHIP_COLOR,
	type ChatBadge,
	type ChatFragment,
	PROVIDER_CHIP,
} from "@VISP/api/chat/contract";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import type { FloatingPosition, VisibleChatMessage } from "../lib/chat-model";

function Fragment({ fragment }: { fragment: ChatFragment }) {
	const [failed, setFailed] = useState(false);
	if (fragment.type === "text" || failed) {
		return (
			<Text style={{ color: "white", fontSize: 14 }}>{fragment.text}</Text>
		);
	}
	return (
		<Image
			onError={() => setFailed(true)}
			source={fragment.url}
			style={{ height: 22, width: 22 }}
		/>
	);
}

function Badge({ badge }: { badge: ChatBadge }) {
	const [failed, setFailed] = useState(false);
	if (badge.url && !failed) {
		return (
			<Image
				accessibilityLabel={badge.label}
				accessible
				onError={() => setFailed(true)}
				source={badge.url}
				style={{ height: 16, width: 16 }}
			/>
		);
	}
	return (
		<View
			accessibilityLabel={badge.label}
			accessible
			style={{
				alignItems: "center",
				backgroundColor:
					BADGE_CHIP_COLOR[
						badge.type as keyof Omit<typeof BADGE_CHIP_COLOR, "default">
					] ?? BADGE_CHIP_COLOR.default,
				borderRadius: 4,
				height: 16,
				justifyContent: "center",
				minWidth: 16,
				paddingHorizontal: 2,
			}}
		>
			<Text style={{ color: "white", fontSize: 7, fontWeight: "900" }}>
				{badge.label.slice(0, 3).toUpperCase()}
			</Text>
		</View>
	);
}

function keyedFragments(fragments: ChatFragment[]) {
	const occurrences = new Map<string, number>();
	return fragments.map((fragment) => {
		const value =
			fragment.type === "emote"
				? `${fragment.type}:${fragment.text}:${fragment.url}`
				: `${fragment.type}:${fragment.text}`;
		const occurrence = occurrences.get(value) ?? 0;
		occurrences.set(value, occurrence + 1);
		return { fragment, key: `${value}:${occurrence}` };
	});
}

function keyedBadges(badges: ChatBadge[]) {
	const occurrences = new Map<string, number>();
	return badges.map((badge) => {
		const value = `${badge.type}:${badge.label}:${badge.url ?? ""}`;
		const occurrence = occurrences.get(value) ?? 0;
		occurrences.set(value, occurrence + 1);
		return { badge, key: `${value}:${occurrence}` };
	});
}

export function FloatingChat({
	messages,
	onPositionChange,
	position,
}: {
	messages: VisibleChatMessage[];
	onPositionChange: (position: FloatingPosition) => void;
	position: FloatingPosition;
}) {
	const { height, width } = useWindowDimensions();
	const maxX = Math.max(0, width - 300);
	const maxY = Math.max(0, height - 180);
	const x = useSharedValue(Math.min(maxX, position.x));
	const y = useSharedValue(Math.min(maxY, position.y));
	const originX = useSharedValue(position.x);
	const originY = useSharedValue(position.y);

	useEffect(() => {
		x.value = Math.max(0, Math.min(maxX, position.x));
		y.value = Math.max(0, Math.min(maxY, position.y));
	}, [maxX, maxY, position.x, position.y, x, y]);

	const pan = Gesture.Pan()
		.onBegin(() => {
			originX.value = x.value;
			originY.value = y.value;
		})
		.onUpdate(({ translationX, translationY }) => {
			x.value = Math.max(0, Math.min(maxX, originX.value + translationX));
			y.value = Math.max(0, Math.min(maxY, originY.value + translationY));
		})
		.onEnd(() => runOnJS(onPositionChange)({ x: x.value, y: y.value }));
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: x.value }, { translateY: y.value }],
	}));

	if (messages.length === 0) return null;
	return (
		<GestureDetector gesture={pan}>
			<Animated.View
				style={[
					{
						backgroundColor: "rgba(0,0,0,0.64)",
						borderRadius: 14,
						gap: 6,
						left: 0,
						maxWidth: 300,
						padding: 10,
						position: "absolute",
						top: 0,
					},
					animatedStyle,
				]}
			>
				{messages.map((message) => (
					<View
						key={`${message.provider}-${message.id}`}
						style={{ opacity: message.opacity }}
					>
						<View
							style={{
								alignItems: "center",
								flexDirection: "row",
								gap: 4,
							}}
						>
							<View
								style={{
									alignItems: "center",
									backgroundColor: PROVIDER_CHIP[message.provider].background,
									borderRadius: 4,
									height: 14,
									justifyContent: "center",
									width: 14,
								}}
							>
								<Text
									style={{
										color: PROVIDER_CHIP[message.provider].foreground,
										fontSize: 8,
										fontWeight: "900",
									}}
								>
									{message.provider === "twitch" ? "T" : "K"}
								</Text>
							</View>
							{keyedBadges(message.sender.badges).map(({ badge, key }) => (
								<Badge badge={badge} key={`${message.id}:${key}`} />
							))}
							<Text
								numberOfLines={1}
								style={{
									color: message.sender.color,
									flexShrink: 1,
									fontSize: 13,
									fontWeight: "800",
								}}
							>
								{message.sender.name}
							</Text>
						</View>
						<View
							style={{
								alignItems: "center",
								flexDirection: "row",
								flexWrap: "wrap",
							}}
						>
							{keyedFragments(message.fragments).map(({ fragment, key }) => (
								<Fragment fragment={fragment} key={`${message.id}:${key}`} />
							))}
						</View>
					</View>
				))}
			</Animated.View>
		</GestureDetector>
	);
}
