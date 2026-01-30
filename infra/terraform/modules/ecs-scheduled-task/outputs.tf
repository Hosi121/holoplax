output "task_definition_arn" {
  value       = aws_ecs_task_definition.this.arn
  description = "Task definition ARN"
}

output "event_rule_arn" {
  value       = aws_cloudwatch_event_rule.this.arn
  description = "CloudWatch event rule ARN"
}

output "security_group_id" {
  value       = aws_security_group.this.id
  description = "Security group ID"
}
