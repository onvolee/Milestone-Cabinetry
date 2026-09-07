import {
  Duration,
  RemovalPolicy,
  Validations,
  aws_ec2 as ec2,
  aws_rds as rds
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { StageConfig } from '../config/stages.js'

export interface DatabaseProps {
  readonly config: StageConfig
  readonly securityGroup: ec2.ISecurityGroup
  readonly vpc: ec2.IVpc
}

export class Database extends Construct {
  public readonly instance: rds.DatabaseInstance

  public constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id)

    const engine = rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.of(
        props.config.databaseEngineVersion,
        props.config.databaseMajorVersion
      )
    })
    // PostgreSQL 18.6 defaults rds.force_ssl to 1; bootstrap verifies that plaintext connections are rejected.
    const parameterGroup = new rds.ParameterGroup(this, 'ParameterGroup', { engine })

    this.instance = new rds.DatabaseInstance(this, 'Instance', {
      allocatedStorage: 20,
      backupRetention: Duration.days(props.config.databaseBackupRetentionDays),
      credentials: rds.Credentials.fromUsername(props.config.masterUsername),
      databaseName: props.config.databaseName,
      deletionProtection: false,
      deleteAutomatedBackups: true,
      engine,
      iamAuthentication: true,
      instanceIdentifier: 'milestone-server-staging',
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      manageMasterUserPassword: true,
      multiAz: false,
      parameterGroup,
      publiclyAccessible: false,
      removalPolicy: RemovalPolicy.DESTROY,
      securityGroups: [props.securityGroup],
      storageEncrypted: true,
      storageType: rds.StorageType.GP3,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED }
    })
    const cfnParameterGroup = parameterGroup.node.defaultChild as rds.CfnDBParameterGroup
    cfnParameterGroup.addPropertyDeletionOverride('Parameters')

    Validations.of(this.instance).acknowledge(
      {
        id: 'CloudFormation-Validate::E9006',
        reason:
          'RDS PostgreSQL 18.6 is available in us-east-1, but the aws-cdk-lib 2.268.0 CloudFormation schema only lists versions through 18.4.'
      },
      {
        id: 'AwsSolutions::AwsSolutions-RDS3',
        reason: 'The staging database is intentionally Single-AZ to control non-production cost.'
      },
      {
        id: 'AwsSolutions::AwsSolutions-RDS10',
        reason: 'The disposable staging database is protected by Foundation stack termination protection instead.'
      },
      {
        id: 'AwsSolutions::AwsSolutions-RDS11',
        reason: 'The private database uses PostgreSQL standard port 5432 and is reachable only from two named security groups.'
      }
    )
  }
}
