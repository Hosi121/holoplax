variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "db_name" {
  type = string
}

variable "db_username" {
  type = string
}

variable "db_password" {
  type = string
  sensitive = true
}

variable "instance_class" {
  type = string
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "app_security_group_id" {
  type = string
}
