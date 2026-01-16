resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name

  tags = {
    Name = "${var.name_prefix}-bucket"
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = var.public_read ? false : true
  block_public_policy     = var.public_read ? false : true
  ignore_public_acls      = var.public_read ? false : true
  restrict_public_buckets = var.public_read ? false : true
}

resource "aws_s3_bucket_policy" "public_read" {
  count  = var.public_read ? 1 : 0
  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.public_read[0].json
}

data "aws_iam_policy_document" "public_read" {
  count = var.public_read ? 1 : 0

  statement {
    sid     = "PublicRead"
    actions = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.this.arn}/*"]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
  }
}
