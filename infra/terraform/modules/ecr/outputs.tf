output "repository_url" {
  value       = aws_ecr_repository.this.repository_url
  description = "ECR repository URL"
}

output "repository_arn" {
  value       = aws_ecr_repository.this.arn
  description = "ECR repository ARN"
}

output "repository_name" {
  value       = aws_ecr_repository.this.name
  description = "ECR repository name"
}
