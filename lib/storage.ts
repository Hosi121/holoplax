import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const minioEndpoint = process.env.MINIO_ENDPOINT;
const region = process.env.AWS_REGION ?? process.env.MINIO_REGION ?? "us-east-1";
const bucket =
  process.env.S3_BUCKET_AVATARS ?? process.env.MINIO_BUCKET_AVATARS ?? "holoplax-avatars";
const publicEndpoint =
  process.env.S3_PUBLIC_URL ??
  process.env.MINIO_PUBLIC_URL ??
  minioEndpoint ??
  `https://${bucket}.s3.${region}.amazonaws.com`;

export const getPublicObjectUrl = (key: string) => {
  const base = publicEndpoint.replace(/\/$/, "");
  return minioEndpoint ? `${base}/${bucket}/${key}` : `${base}/${key}`;
};

const getClient = () => {
  if (!minioEndpoint) {
    // In AWS, use the SDK's default credential chain (ECS task role, IRSA,
    // environment, or local AWS profile) rather than blank static credentials.
    return new S3Client({ region });
  }
  return new S3Client({
    region,
    endpoint: minioEndpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ROOT_USER ?? "minioadmin",
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? "minioadmin",
    },
  });
};

export async function ensureAvatarBucket() {
  const client = getClient();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    if (!minioEndpoint) throw new Error(`avatar bucket is unavailable: ${bucket}`);
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }

  // AWS buckets are provisioned and configured by Terraform. Runtime policy
  // mutation is needed only for the local MinIO development environment.
  if (!minioEndpoint) return;

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
