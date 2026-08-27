type BrbPollState = {
	active: boolean;
	highlights: { enabled: boolean };
};

export function brbRefetchInterval(data: BrbPollState | undefined) {
	if (data?.active) return 1000;
	return data?.highlights.enabled ? 5000 : false;
}
