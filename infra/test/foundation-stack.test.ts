import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { getStageConfig } from '../lib/config/stages.js'
import { ServerFoundationStack } from '../lib/stacks/server-foundation-stack.js'

const createTemplate = () => {
  const app = new App()
  const config = getStageConfig('staging')
  const stack = new ServerFoundationStack(app, 'ServerFoundationStack', {
    config,
    env: { account: config.account, region: config.region },
    serverSourcePath: new URL('../../server', import.meta.url).pathname,
    stackName: config.foundationStackName,
    terminationProtection: true
  })

  return Template.fromStack(stack)
}

describe('ServerFoundationStack', () => {
  it('creates two public and two isolated subnets without NAT gateways', () => {
    const template = createTemplate()

    template.resourceCountIs('AWS::EC2::Subnet', 4)
    template.resourceCountIs('AWS::EC2::NatGateway', 0)
    template.resourceCountIs('AWS::ServiceDiscovery::HttpNamespace', 0)
    template.hasResourceProperties('AWS::ServiceDiscovery::PrivateDnsNamespace', {
      Name: 'staging.server.milestone',
      Vpc: Match.anyValue()
    })
    template.resourcePropertiesCountIs('AWS::EC2::Subnet', { MapPublicIpOnLaunch: true }, 2)
    template.resourcePropertiesCountIs(
      'AWS::RDS::DBSubnetGroup',
      { SubnetIds: Match.anyValue() },
      1
    )
  })

  it('configures a private encrypted IAM-enabled PostgreSQL instance with forced TLS', () => {
    const template = createTemplate()

    template.hasResourceProperties('AWS::RDS::DBInstance', {
      AllocatedStorage: '20',
      BackupRetentionPeriod: 1,
      DBInstanceClass: 'db.t4g.micro',
      DBName: 'milestone_cabinetry',
      DeletionProtection: false,
      EnableIAMDatabaseAuthentication: true,
      Engine: 'postgres',
      EngineVersion: '18.6',
      ManageMasterUserPassword: true,
      MasterUsername: 'milestone_admin',
      MultiAZ: false,
      PubliclyAccessible: false,
      StorageEncrypted: true,
      StorageType: 'gp3'
    })
    template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Family: 'postgres18',
      Parameters: Match.absent()
    })

    const synthesized = template.toJSON() as { Resources: Record<string, unknown> }
    expect(synthesized.Resources.DatabaseInstanceAA8A5FDE).toBeDefined()
    expect(JSON.stringify(synthesized)).not.toContain('rds.logical_replication')
  })

  it('limits application, bootstrap, API, and database security group flows', () => {
    const template = createTemplate()

    template.resourceCountIs('AWS::EC2::SecurityGroup', 4)
    template.resourceCountIs('AWS::EC2::SecurityGroupIngress', 3)
    template.resourceCountIs('AWS::EC2::SecurityGroupEgress', 3)
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      Description: 'HTTP from API Gateway VPC link',
      FromPort: 3001,
      IpProtocol: 'tcp',
      ToPort: 3001
    })
    template.resourcePropertiesCountIs(
      'AWS::EC2::SecurityGroupIngress',
      { FromPort: 5432, IpProtocol: 'tcp', ToPort: 5432 },
      2
    )
    template.resourcePropertiesCountIs(
      'AWS::EC2::SecurityGroup',
      {
        SecurityGroupEgress: Match.arrayWith([
          Match.objectLike({ CidrIp: '0.0.0.0/0', FromPort: 443, IpProtocol: 'tcp', ToPort: 443 })
        ])
      },
      2
    )
  })

  it('injects the RDS-managed username and password only into the bootstrap execution role', () => {
    const template = createTemplate()

    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'database-bootstrap',
          Secrets: Match.arrayWith([
            Match.objectLike({ Name: 'PGPASSWORD' }),
            Match.objectLike({ Name: 'PGUSER' })
          ])
        })
      ]),
      Cpu: '256',
      Family: 'milestone-server-staging-database-bootstrap',
      Memory: '512',
      RequiresCompatibilities: ['FARGATE']
    })
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['secretsmanager:GetSecretValue']),
            Effect: 'Allow',
            Resource: Match.anyValue()
          })
        ])
      }
    })

    const synthesized = JSON.stringify(template.toJSON())
    expect(synthesized).toContain('rds-db:connect')
    expect(synthesized).toContain('milestone_admin')
  })

  it('publishes the stable foundation outputs', () => {
    const template = createTemplate()

    for (const output of [
      'clusterName',
      'clusterArn',
      'databaseBootstrapTaskDefinitionArn',
      'publicSubnetIds',
      'databaseBootstrapSecurityGroupId'
    ]) {
      template.hasOutput(output, {})
    }
  })
})
