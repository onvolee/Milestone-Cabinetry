import {
  ArnFormat,
  Duration,
  RemovalPolicy,
  Stack,
  Validations,
  aws_apigateway as apigateway,
  aws_apigatewayv2 as apigatewayv2,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_logs as logs,
  aws_servicediscovery as servicediscovery
} from 'aws-cdk-lib'
import { HttpServiceDiscoveryIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets'
import type { DatabaseInstance } from 'aws-cdk-lib/aws-rds'
import { Construct } from 'constructs'
import type { StageConfig } from '../config/stages.js'

export interface ServerServiceProps {
  readonly apiSecurityGroup: ec2.ISecurityGroup
  readonly cluster: ecs.ICluster
  readonly config: StageConfig
  readonly database: DatabaseInstance
  readonly namespace: servicediscovery.INamespace
  readonly serverSourcePath: string
  readonly serviceSecurityGroup: ec2.ISecurityGroup
  readonly vpc: ec2.IVpc
}

export class ServerService extends Construct {
  public readonly api: apigatewayv2.HttpApi
  public readonly service: ecs.FargateService

  public constructor(scope: Construct, id: string, props: ServerServiceProps) {
    super(scope, id)

    const image = new DockerImageAsset(this, 'Image', {
      directory: props.serverSourcePath,
      file: 'Dockerfile',
      platform: Platform.LINUX_AMD64,
      target: 'runtime'
    })

    const applicationLogGroup = new logs.LogGroup(this, 'ApplicationLogGroup', {
      logGroupName: '/milestone/server/staging/application',
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH
    })

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: 256,
      family: 'milestone-server-staging-runtime',
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX
      }
    })

    props.database.grantConnect(taskDefinition.taskRole, props.config.runtimeDatabaseUsername)

    taskDefinition.addContainer('Container', {
      containerName: 'server',
      environment: {
        AWS_REGION: props.config.region,
        CORS_ORIGINS: props.config.corsOrigins,
        DB_AUTH_MODE: 'iam',
        DB_HOST: props.database.dbInstanceEndpointAddress,
        DB_NAME: props.config.databaseName,
        DB_PORT: props.database.dbInstanceEndpointPort,
        DB_SSL_CA_PATH: '/app/.certs/rds-global-bundle.pem',
        DB_USERNAME: props.config.runtimeDatabaseUsername,
        NODE_ENV: props.config.environment,
        PORT: String(props.config.apiPort)
      },
      healthCheck: {
        command: [
          'CMD-SHELL',
          `wget -q -O - http://127.0.0.1:${props.config.apiPort}/api/health >/dev/null || exit 1`
        ],
        interval: Duration.seconds(30),
        retries: 3,
        startPeriod: Duration.seconds(30),
        timeout: Duration.seconds(5)
      },
      image: ecs.ContainerImage.fromDockerImageAsset(image),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: applicationLogGroup,
        streamPrefix: 'server'
      }),
      portMappings: [
        {
          containerPort: props.config.apiPort,
          name: 'http',
          protocol: ecs.Protocol.TCP
        }
      ],
      stopTimeout: Duration.seconds(30)
    })

    const cloudMapService = new servicediscovery.Service(this, 'CloudMapService', {
      customHealthCheck: { failureThreshold: 1 },
      discoveryType: servicediscovery.DiscoveryType.DNS_AND_API,
      dnsRecordType: servicediscovery.DnsRecordType.SRV,
      dnsTtl: Duration.seconds(10),
      name: 'server',
      namespace: props.namespace
    })

    this.service = new ecs.FargateService(this, 'Service', {
      assignPublicIp: true,
      circuitBreaker: { rollback: true },
      cluster: props.cluster,
      desiredCount: 1,
      enableECSManagedTags: true,
      platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
      minHealthyPercent: 100,
      propagateTags: ecs.PropagatedTagSource.SERVICE,
      securityGroups: [props.serviceSecurityGroup],
      serviceName: 'milestone-server-staging',
      taskDefinition,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }
    })
    const cfnService = this.service.node.defaultChild as ecs.CfnService
    cfnService.serviceRegistries = [
      {
        containerName: 'server',
        containerPort: props.config.apiPort,
        registryArn: cloudMapService.serviceArn
      }
    ]

    const scaling = this.service.autoScaleTaskCount({
      maxCapacity: 2,
      minCapacity: 1
    })
    scaling.scaleOnCpuUtilization('CpuScaling', { targetUtilizationPercent: 70 })
    scaling.scaleOnMemoryUtilization('MemoryScaling', { targetUtilizationPercent: 70 })

    const vpcLink = new apigatewayv2.VpcLink(this, 'VpcLink', {
      securityGroups: [props.apiSecurityGroup],
      subnets: { subnetType: ec2.SubnetType.PUBLIC },
      vpc: props.vpc,
      vpcLinkName: 'milestone-server-staging'
    })

    this.api = new apigatewayv2.HttpApi(this, 'Api', {
      apiName: 'milestone-server-staging',
      createDefaultStage: false,
      defaultIntegration: new HttpServiceDiscoveryIntegration('ServiceDiscoveryIntegration', cloudMapService, {
        vpcLink
      })
    })

    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogGroup', {
      logGroupName: '/milestone/server/staging/api-access',
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH
    })

    new apigatewayv2.HttpStage(this, 'DefaultStage', {
      accessLogSettings: {
        destination: {
          bind: () => ({
            destinationArn: Stack.of(this).formatArn({
              arnFormat: ArnFormat.COLON_RESOURCE_NAME,
              resource: 'log-group',
              resourceName: accessLogGroup.logGroupName,
              service: 'logs'
            })
          })
        },
        format: apigateway.AccessLogFormat.jsonWithStandardFields()
      },
      autoDeploy: true,
      httpApi: this.api,
      stageName: '$default'
    })

    Validations.of(taskDefinition).acknowledge(
      {
        id: 'AwsSolutions::AwsSolutions-ECS2',
        reason: 'Runtime environment variables contain service configuration only; the application uses IAM database authentication and receives no database secret.'
      },
      {
        id: 'AwsSolutions-IAM5[Resource::*]',
        reason: 'The ECS execution role requires a wildcard resource only for the ECR authorization token action; image and log access remain scoped.'
      }
    )
    Validations.of(this.api).acknowledge({
      id: 'AwsSolutions::AwsSolutions-APIG4',
      reason: 'This first-stage storefront API is intentionally public; route-level authentication remains an application concern until an API authorizer is introduced.'
    })
  }
}
