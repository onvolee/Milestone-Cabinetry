import {
  CfnOutput,
  Stack,
  Validations,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_servicediscovery as servicediscovery
} from 'aws-cdk-lib'
import type { StackProps } from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import type { StageConfig } from '../config/stages.js'
import { Database } from '../constructs/database.js'
import { DatabaseBootstrap } from '../constructs/database-bootstrap.js'

export interface ServerFoundationStackProps extends StackProps {
  readonly config: StageConfig
  readonly serverSourcePath: string
}

export class ServerFoundationStack extends Stack {
  public readonly apiSecurityGroup: ec2.SecurityGroup
  public readonly bootstrapSecurityGroup: ec2.SecurityGroup
  public readonly cluster: ecs.Cluster
  public readonly database: Database
  public readonly namespace: servicediscovery.PrivateDnsNamespace
  public readonly serviceSecurityGroup: ec2.SecurityGroup
  public readonly vpc: ec2.Vpc

  public constructor(scope: Construct, id: string, props: ServerFoundationStackProps) {
    super(scope, id, props)

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.42.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          cidrMask: 24,
          name: 'Database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED
        }
      ]
    })
    Validations.of(this.vpc).acknowledge(
      {
        id: 'AwsSolutions::AwsSolutions-VPC7',
        reason: 'VPC Flow Logs are omitted in the low-volume staging environment to avoid continuous log ingestion cost.'
      },
      {
        id: 'CloudFormation-Validate::W3010',
        reason: 'This environment-specific stack is pinned to one AWS account and region, so its two resolved availability zones are stable.'
      }
    )

    this.serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      allowAllOutbound: false,
      description: 'Milestone server Fargate tasks',
      securityGroupName: 'milestone-server-staging-service',
      vpc: this.vpc
    })
    this.bootstrapSecurityGroup = new ec2.SecurityGroup(this, 'BootstrapSecurityGroup', {
      allowAllOutbound: false,
      description: 'Milestone database bootstrap tasks',
      securityGroupName: 'milestone-server-staging-bootstrap',
      vpc: this.vpc
    })
    this.apiSecurityGroup = new ec2.SecurityGroup(this, 'ApiSecurityGroup', {
      allowAllOutbound: false,
      description: 'Milestone API Gateway VPC link',
      securityGroupName: 'milestone-server-staging-api',
      vpc: this.vpc
    })
    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      allowAllOutbound: false,
      description: 'Milestone RDS PostgreSQL',
      securityGroupName: 'milestone-server-staging-database',
      vpc: this.vpc
    })

    this.apiSecurityGroup.addEgressRule(
      this.serviceSecurityGroup,
      ec2.Port.tcp(props.config.apiPort),
      'HTTP to server tasks'
    )
    this.serviceSecurityGroup.addIngressRule(
      this.apiSecurityGroup,
      ec2.Port.tcp(props.config.apiPort),
      'HTTP from API Gateway VPC link'
    )
    this.serviceSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'AWS HTTPS APIs')
    this.bootstrapSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'AWS HTTPS APIs')
    this.serviceSecurityGroup.addEgressRule(
      databaseSecurityGroup,
      ec2.Port.tcp(5432),
      'PostgreSQL to RDS'
    )
    this.bootstrapSecurityGroup.addEgressRule(
      databaseSecurityGroup,
      ec2.Port.tcp(5432),
      'PostgreSQL to RDS'
    )
    databaseSecurityGroup.addIngressRule(
      this.serviceSecurityGroup,
      ec2.Port.tcp(5432),
      'PostgreSQL from server tasks'
    )
    databaseSecurityGroup.addIngressRule(
      this.bootstrapSecurityGroup,
      ec2.Port.tcp(5432),
      'PostgreSQL from bootstrap tasks'
    )

    this.database = new Database(this, 'Database', {
      config: props.config,
      securityGroup: databaseSecurityGroup,
      vpc: this.vpc
    })

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: 'milestone-server-staging',
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
      vpc: this.vpc
    })
    this.namespace = new servicediscovery.PrivateDnsNamespace(this, 'PrivateNamespace', {
      name: 'staging.server.milestone',
      vpc: this.vpc
    })

    const databaseBootstrap = new DatabaseBootstrap(this, 'DatabaseBootstrap', {
      config: props.config,
      database: this.database.instance,
      serverSourcePath: props.serverSourcePath
    })

    new CfnOutput(this, 'clusterName', { value: this.cluster.clusterName })
    new CfnOutput(this, 'clusterArn', { value: this.cluster.clusterArn })
    new CfnOutput(this, 'databaseBootstrapTaskDefinitionArn', {
      value: databaseBootstrap.taskDefinition.taskDefinitionArn
    })
    new CfnOutput(this, 'publicSubnetIds', {
      value: this.vpc.publicSubnets.map(subnet => subnet.subnetId).join(',')
    })
    new CfnOutput(this, 'databaseBootstrapSecurityGroupId', {
      value: this.bootstrapSecurityGroup.securityGroupId
    })
  }
}
