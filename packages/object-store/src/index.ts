import { AwsClient } from "aws4fetch";

export type ObjectStoreConfig = {
	accessKeyId: string;
	secretAccessKey: string;
	region: string;
	bucket: string;
	/** S3 API endpoint, e.g. https://s3.example.com (path-style). */
	endpoint: string;
};

export type PresignOptions = {
	expiresIn: number;
	method: "GET" | "PUT" | "HEAD" | "DELETE";
};

export type ObjectStat = {
	lastModified: Date;
};

/**
 * S3-compatible object store via aws4fetch.
 *
 * Avoid Bun.S3Client in the API process: Bun 1.3.x can segfault when that
 * client shares a process with node-postgres TLS (managed Postgres).
 */
export function createObjectStore(config: ObjectStoreConfig) {
	const aws = new AwsClient({
		accessKeyId: config.accessKeyId,
		secretAccessKey: config.secretAccessKey,
		region: config.region,
		service: "s3",
	});
	const base = `${config.endpoint.replace(/\/$/, "")}/${config.bucket}`;

	function objectUrl(key: string): string {
		return `${base}/${key
			.split("/")
			.map((part) => encodeURIComponent(part))
			.join("/")}`;
	}

	return {
		async delete(key: string): Promise<void> {
			const response = await aws.fetch(objectUrl(key), {
				method: "DELETE",
				aws: { service: "s3", region: config.region },
			});
			if (!response.ok && response.status !== 404) {
				throw new Error(`S3 delete failed: ${response.status}`);
			}
		},

		async stat(key: string): Promise<ObjectStat> {
			const response = await aws.fetch(objectUrl(key), {
				method: "HEAD",
				aws: { service: "s3", region: config.region },
			});
			if (!response.ok) {
				throw new Error(`S3 head failed: ${response.status}`);
			}
			const lastModifiedHeader = response.headers.get("last-modified");
			return {
				lastModified: lastModifiedHeader
					? new Date(lastModifiedHeader)
					: new Date(0),
			};
		},

		async presign(key: string, options: PresignOptions): Promise<string> {
			const url = new URL(objectUrl(key));
			url.searchParams.set("X-Amz-Expires", String(options.expiresIn));
			const signed = await aws.sign(url.toString(), {
				method: options.method,
				aws: {
					signQuery: true,
					service: "s3",
					region: config.region,
				},
			});
			return signed.url;
		},
	};
}

export type ObjectStore = ReturnType<typeof createObjectStore>;
