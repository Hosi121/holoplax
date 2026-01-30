output "cluster_id" {
  value       = aws_ecs_cluster.this.id
  description = "ECS cluster ID"
}

output "cluster_arn" {
  value       = aws_ecs_cluster.this.arn
  description = "ECS cluster ARN"
}

output "cluster_name" {
  value       = aws_ecs_cluster.this.name
  description = "ECS cluster name"
}

output "service_name" {
  value       = aws_ecs_service.app.name
  description = "ECS service name"
}

output "task_definition_arn" {
  value       = aws_ecs_task_definition.app.arn
  description = "ECS task definition ARN"
}

output "security_group_id" {
  value       = aws_security_group.ecs.id
  description = "ECS security group ID"
}

output "task_execution_role_arn" {
  value       = aws_iam_role.task_execution.arn
  description = "Task execution role ARN"
}

output "task_role_arn" {
  value       = aws_iam_role.task.arn
  description = "Task role ARN"
}
