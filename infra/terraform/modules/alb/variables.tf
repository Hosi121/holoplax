variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "app_port" {
  type = number
}

variable "certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate ARN for HTTPS. If empty, only HTTP listener is created."
}

variable "enable_https_redirect" {
  type        = bool
  default     = true
  description = "Redirect HTTP to HTTPS when certificate is provided"
}
