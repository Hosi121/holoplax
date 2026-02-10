# Holoplax AWS Terraform (Osaka)

This Terraform set provisions a simple AWS stack for staging/prod in `ap-northeast-3`.

## What it creates
- VPC with public + private subnets (no NAT to keep costs low)
- ALB (HTTP) + EC2 app instance
- RDS PostgreSQL (private)
- S3 bucket for avatars (public read by default)
- Secrets Manager entry for DB credentials
- Secrets Manager entry for OpenAI API key (empty by default)

## Environments
Each environment lives under `envs/{staging,prod}`.

## Quick start
```bash
cd infra/terraform/envs/staging
terraform init
terraform plan
terraform apply
```

## Important notes
- Update `bucket_name` in each `terraform.tfvars` to a globally unique S3 bucket name.
- This setup uses **HTTP only** (no TLS). Add ACM + HTTPS listener if you need HTTPS.
- EC2 runs in a public subnet for simplicity. If you want a private subnet + NAT, we can add it.
- DB credentials are stored in Secrets Manager; EC2 has permission to read the secret.
- OpenAI key secret is created without a value. Set it manually in AWS console/CLI.

## User data
You can pass `user_data` to install Node/Docker and run the app. Example in `terraform.tfvars`:
```hcl
user_data = <<-EOT
#!/bin/bash
# install steps here
EOT
```

## Outputs
- `alb_dns_name`: access URL
- `db_endpoint`: RDS endpoint
- `db_secret_arn`: Secrets Manager ARN
- `s3_bucket_name`: avatar bucket
