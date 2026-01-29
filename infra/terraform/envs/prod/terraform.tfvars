region             = "ap-northeast-3"
name_prefix        = "holoplax-prod"
vpc_cidr           = "10.40.0.0/16"
public_subnet_cidrs = ["10.40.1.0/24", "10.40.2.0/24"]
private_subnet_cidrs = ["10.40.101.0/24", "10.40.102.0/24"]
app_port           = 3000
instance_type      = "t3.small"
db_instance_class  = "db.t3.medium"
db_name            = "holoplax"
db_username        = "holoplax"
db_multi_az        = true
bucket_name        = "holoplax-prod-avatars-unique"
public_read        = true

# HTTPS/TLS Configuration
# Set your ACM certificate ARN here to enable HTTPS
# Example: certificate_arn = "arn:aws:acm:ap-northeast-3:123456789012:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
certificate_arn       = ""
enable_https_redirect = true
