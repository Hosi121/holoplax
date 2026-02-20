import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
const publicEndpoint = process.env.MINIO_PUBLIC_URL ?? endpoint;
const region = process.env.MINIO_REGION ?? "us-east-1";
const bucket = process.env.MINIO_BUCKET_AVATARS ?? "holoplax-avatars";

export const getAvatarBucket = () => bucket;

export const getPublicObjectUrl = (key: string) =>
  `${publicEndpoint.replace(/\/$/, "")}/${bucket}/${key}`;

const getClient = () =>
  new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ROOT_USER ?? "",
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? "",
    },
  });

export async function ensureAvatarBucket() {
  const client = getClient();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }

  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicRead",
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  };

  try {
    await client.send(
      new PutBucketPolicyCommand({
        Bucket: bucket,
        Policy: JSON.stringify(policy),
      }),
    );
  } catch {
    // ignore if policy cannot be set
  }
}

export async function createAvatarUploadUrl(params: {
  key: string;
  contentType: string;
  contentLength: number;
}) {
  const client = getClient();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    ContentType: params.contentType,
    // Signing the Content-Length prevents uploading a file of a different
    // size than the one the client declared — S3/MinIO will reject the PUT
    // if the actual body length doesn't match.
    ContentLength: params.contentLength,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });
  return uploadUrl;
}
