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
	byteSize: number;
	contentType: string | null;
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

	function decodeXml(value: string): string {
		return value
			.replaceAll("&quot;", '"')
			.replaceAll("&apos;", "'")
			.replaceAll("&lt;", "<")
			.replaceAll("&gt;", ">")
			.replaceAll("&amp;", "&");
	}

	return {
		async copy(source: string, destination: string): Promise<void> {
			const copySource = `/${config.bucket}/${source
				.split("/")
				.map((part) => encodeURIComponent(part))
				.join("/")}`;
			const response = await aws.fetch(objectUrl(destination), {
				method: "PUT",
				headers: { "x-amz-copy-source": copySource },
				aws: { service: "s3", region: config.region },
			});
			if (!response.ok) throw new Error(`S3 copy failed: ${response.status}`);
		},

		async delete(key: string): Promise<void> {
			const response = await aws.fetch(objectUrl(key), {
				method: "DELETE",
				aws: { service: "s3", region: config.region },
			});
			if (!response.ok && response.status !== 404) {
				throw new Error(`S3 delete failed: ${response.status}`);
			}
		},

		async list(prefix: string): Promise<string[]> {
			const keys: string[] = [];
			let continuationToken: string | undefined;
			do {
				const url = new URL(base);
				url.searchParams.set("list-type", "2");
				url.searchParams.set("prefix", prefix);
				if (continuationToken)
					url.searchParams.set("continuation-token", continuationToken);
				const response = await aws.fetch(url.toString(), {
					aws: { service: "s3", region: config.region },
				});
				if (!response.ok) throw new Error(`S3 list failed: ${response.status}`);
				const body = await response.text();
				for (const match of body.matchAll(/<Key>([\s\S]*?)<\/Key>/g))
					keys.push(decodeXml(match[1] ?? ""));
				continuationToken = /<IsTruncated>true<\/IsTruncated>/.test(body)
					? decodeXml(
							body.match(
								/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/,
							)?.[1] ?? "",
						)
					: undefined;
			} while (continuationToken);
			return keys;
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
				byteSize: Number(response.headers.get("content-length") ?? 0),
				contentType: response.headers.get("content-type"),
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
