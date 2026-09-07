import { Duration, RemovalPolicy, Validations, aws_ecs as ecs, aws_logs as logs } from 'aws-cdk-lib'
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets'
import { Construct } from 'constructs'
import type { DatabaseInstance } from 'aws-cdk-lib/aws-rds'
import type { StageConfig } from '../config/stages.js'

export interface DatabaseBootstrapProps {
  readonly config: StageConfig
  readonly database: DatabaseInstance
  readonly serverSourcePath: string
}

export class DatabaseBootstrap extends Construct {
  public readonly taskDefinition: ecs.FargateTaskDefinition

  public constructor(scope: Construct, id: string, props: DatabaseBootstrapProps) {
    super(scope, id)

    if (!props.database.secret) {
      throw new Error('The database must expose its RDS-managed master user secret.')
    }

    const image = new DockerImageAsset(this, 'Image', {
      directory: props.serverSourcePath,
      file: 'Dockerfile',
      platform: Platform.LINUX_AMD64,
      target: 'db-bootstrap'
    })

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/milestone/server/staging/database-bootstrap',
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH
    })

    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: 256,
      family: 'milestone-server-staging-database-bootstrap',
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX
      }
    })
    props.database.grantConnect(this.taskDefinition.taskRole, props.config.masterUsername)

    this.taskDefinition.addContainer('Container', {
      command: [
        `--set=database_name=${props.config.databaseName}`,
        '--file=/bootstrap/01-rds-roles.sql'
      ],
      containerName: 'database-bootstrap',
      environment: {
        AWS_REGION: props.config.region,
        PGDATABASE: props.config.databaseName,
        PGHOST: props.database.dbInstanceEndpointAddress,
        PGPORT: props.database.dbInstanceEndpointPort,
        PGSSLMODE: 'verify-full',
        PGSSLROOTCERT: '/certs/rds-global-bundle.pem'
      },
      image: ecs.ContainerImage.fromDockerImageAsset(image),
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: 'bootstrap'
      }),
      secrets: {
        PGPASSWORD: ecs.Secret.fromSecretsManager(props.database.secret, 'password'),
        PGUSER: ecs.Secret.fromSecretsManager(props.database.secret, 'username')
      },
      stopTimeout: Duration.seconds(30)
    })

    Validations.of(this.taskDefinition).acknowledge(
      {
        id: 'AwsSolutions::AwsSolutions-ECS2',
        reason: 'Only non-secret database location and TLS settings are environment variables; username and password use ECS secrets.'
      },
      {
        id: 'AwsSolutions-IAM5[Resource::*]',
        reason: 'The ECS execution role requires a wildcard resource only for the ECR authorization token action; image, log, and secret access remain scoped.'
      }
    )
  }
}
