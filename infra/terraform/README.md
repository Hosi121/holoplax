# AWS 構成と配布

`ap-northeast-3`（大阪）の staging / prod を Terraform で管理する。
現在の配布先は ECS / Fargate。EC2 の user-data テンプレートは旧構成用。

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

[CD workflow](../../.github/workflows/cd.yml) は `staging` → staging、`main` → prod。
CI 通過後に ECR へ push し、専用 migration イメージの終了コードを確認してから
Web / MCP サービスを更新・安定確認する。migration は旧タスク停止前に実行するため、
[互換列の撤去条件](../../doc/issues.md#データと更新規則) を守る。
