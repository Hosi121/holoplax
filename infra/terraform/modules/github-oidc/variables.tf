variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository (e.g., owner/repo)"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "account_id" {
  description = "AWS account ID"
  type        = string
}
