# CDK bootstrap and GitHub OIDC permissions

These files define the non-administrator permissions used by the Milestone server CDK deployment in AWS account `441176049535`, region `us-east-1`.

Run the one-time setup from `infra/` while authenticated as an account administrator:

```bash
aws iam create-policy \
  --policy-name MilestoneServerCdkExecutionPolicy \
  --policy-document file://bootstrap/execution-policy.json

aws iam create-policy \
  --policy-name MilestoneServerCdkDatabaseExecutionPolicy \
  --policy-document file://bootstrap/database-execution-policy.json

yarn cdk bootstrap aws://441176049535/us-east-1 \
  --cloudformation-execution-policies arn:aws:iam::441176049535:policy/MilestoneServerCdkExecutionPolicy \
  --cloudformation-execution-policies arn:aws:iam::441176049535:policy/MilestoneServerCdkDatabaseExecutionPolicy \
  --termination-protection

aws iam put-role-policy \
  --role-name GitHubActionsMilestoneServerDeploy \
  --policy-name MilestoneServerCdkDeploy \
  --policy-document file://bootstrap/github-deploy-policy.json
```

If an execution policy already exists, create a new policy version and make it the default instead of calling `create-policy` again. Review `yarn cdk diff --strict` after every policy change. Do not attach `AdministratorAccess` to the CloudFormation execution role or GitHub OIDC role.

The execution policy is intentionally limited to the AWS services synthesized by these two stacks. Some create/list operations require `Resource: "*"` because their AWS IAM APIs do not support resource-level scoping. IAM role management, Lambda provider management, log groups, API Gateway resources, and GitHub bootstrap access are scoped by account, region, and physical-name prefixes where their APIs allow it.

The Cloud Map private DNS namespace creates a Route 53 private hosted zone associated only with the server VPC. The execution role therefore includes the hosted-zone actions that AWS Cloud Map documents for creating and deleting private namespaces. This zone exists only to publish the SRV records required by API Gateway's Cloud Map integration; it does not manage the public application domain.

API Gateway management uses `apigateway:*` only on the `/apis`, `/vpclinks`, and `/tags` resource paths. CloudFormation's API Gateway v2 resource provider checks an internal `apigateway:TagResource` operation when tags are supplied, while IAM Access Analyzer does not accept that operation as an explicit action. A path-scoped wildcard is required to support tagged HTTP API, stage, and VPC Link resources without granting access to unrelated API Gateway resource families.

The GitHub policy assumes CDK bootstrap roles for CloudFormation and asset publishing. Its direct service permissions are limited to starting, inspecting, and stopping the one-off database bootstrap task and passing that task's generated ECS roles.

The GitHub OIDC role and the CDK bootstrap roles are in the same AWS account. Do not pass the role ARN to `cdk bootstrap --trust`; that option accepts account IDs for cross-account deployments. The existing OIDC trust remains unchanged, while `github-deploy-policy.json` grants the role permission to assume the account-local bootstrap roles.
