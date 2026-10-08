# 旧 AWS 構成（CD停止中）

`ap-northeast-3`（大阪）の staging / prod 用に保存している Terraform 構成。
配布先を Cloudflare へ移す方針で、AWS向け CD と staging 制御 workflow は停止・除去した。
ECS / Fargate の構成は参照用に残す。EC2 の user-data テンプレートはさらに以前の構成用。

## 構成の正本

- [staging](envs/staging/main.tf) / [prod](envs/prod/main.tf): 環境別のリソースと接続。
- [modules](modules): VPC、ALB、ECS、private RDS、S3、ECR、GitHub OIDC 等。
- Secrets Manager: DB接続、認証・暗号化、AIキーを ECS へ渡す。
- EventBridge + ECS scheduled task: [日次指標ジョブ](../../scripts/metrics/metrics_job.py) を起動。

staging は ACM / Route 53 も管理し HTTPS へ転送する。
prod の HTTPS は `certificate_arn` / `enable_https_redirect` に従う。
各環境の variables と `terraform.tfvars` でドメイン・証明書・一意の bucket 名を設定する。

## 変更手順

対象環境・AWS account を確認して plan をレビューする。staging の例:

```bash
terraform -chdir=infra/terraform/envs/staging init
terraform -chdir=infra/terraform/envs/staging plan
terraform -chdir=infra/terraform/envs/staging apply
```

接続先や secret ARN は `terraform output` を参照する。
AIキーの secret は作成だけでは使えず、有効な値の設定が必要。

旧 CD は migration を旧 ECS タスク停止前に実行していた。
DB の [互換列の撤去条件](../../doc/issues.md#データと更新規則) は、配布方式を変更しても確認する。
Cloudflare への移行課題は [課題](../../doc/issues.md#cloudflare移行) を参照。
