import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { getStageConfig } from '../lib/config/stages.js'
import { ServerApplicationStack } from '../lib/stacks/server-application-stack.js'
import { ServerFoundationStack } from '../lib/stacks/server-foundation-stack.js'

const createTemplate = () => {
  const app = new App()
  const config = getStageConfig('staging')
  const stackProps = {
    config,
    env: { account: config.account, region: config.region },
    serverSourcePath: new URL('../../server', import.meta.url).pathname
  }
  const foundation = new ServerFoundationStack(app, 'ServerFoundationStack', {
    ...stackProps,
    stackName: config.foundationStackName,
    terminationProtection: true
  })
  const application = new ServerApplicationStack(app, 'ServerApplicationStack', {
    ...stackProps,
    foundation,
    stackName: config.applicationStackName
  })

  return Template.fromStack(application)
}

describe('ServerApplicationStack', () => {
  it('runs the runtime image on public-IP Fargate with health checks and rollback', () => {
    const template = createTemplate()

    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          HealthCheck: {
            Command: [
              'CMD-SHELL',
              'wget -q -O - http://127.0.0.1:3001/api/health >/dev/null || exit 1'
            ],
            Interval: 30,
            Retries: 3,
            StartPeriod: 30,
            Timeout: 5
          },
          Name: 'server',
          PortMappings: Match.arrayWith([Match.objectLike({ ContainerPort: 3001 })])
        })
      ]),
      Cpu: '256',
      Family: 'milestone-server-staging-runtime',
      Memory: '512',
      RuntimePlatform: { CpuArchitecture: 'X86_64', OperatingSystemFamily: 'LINUX' }
    })
    template.hasResourceProperties('AWS::ECS::Service', {
      DeploymentConfiguration: {
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
        MaximumPercent: 200,
        MinimumHealthyPercent: 100
      },
      DesiredCount: 1,
      LaunchType: 'FARGATE',
      NetworkConfiguration: {
        AwsvpcConfiguration: Match.objectLike({ AssignPublicIp: 'ENABLED' })
      },
      PlatformVersion: '1.4.0',
      ServiceRegistries: Match.anyValue()
    })
    template.resourcePropertiesCountIs('AWS::Logs::LogGroup', { RetentionInDays: 30 }, 2)
  })

  it('grants runtime only IAM database connect for runtime_user and no master secret access', () => {
    const template = createTemplate()
    const synthesized = template.toJSON()

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'rds-db:connect', Effect: 'Allow' })
        ])
      }
    })
    expect(JSON.stringify(synthesized)).toContain('/runtime_user')
    expect(JSON.stringify(synthesized)).not.toContain('/migration_user')
    expect(JSON.stringify(synthesized)).not.toContain('secretsmanager:GetSecretValue')
  })

  it('scales between one and two tasks at 70 percent CPU or memory', () => {
    const template = createTemplate()

    template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalableTarget', {
      MaxCapacity: 2,
      MinCapacity: 1,
      ScalableDimension: 'ecs:service:DesiredCount',
      ServiceNamespace: 'ecs'
    })
    template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalingPolicy', {
      TargetTrackingScalingPolicyConfiguration: {
        PredefinedMetricSpecification: { PredefinedMetricType: 'ECSServiceAverageCPUUtilization' },
        TargetValue: 70
      }
    })
    template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalingPolicy', {
      TargetTrackingScalingPolicyConfiguration: {
        PredefinedMetricSpecification: { PredefinedMetricType: 'ECSServiceAverageMemoryUtilization' },
        TargetValue: 70
      }
    })
  })

  it('routes the HTTP API through a VPC Link to Cloud Map and logs access', () => {
    const template = createTemplate()

    template.hasResourceProperties('AWS::ServiceDiscovery::Service', {
      DnsConfig: Match.objectLike({
        DnsRecords: [{ TTL: 10, Type: 'SRV' }]
      }),
      HealthCheckCustomConfig: { FailureThreshold: 1 },
      Name: 'server'
    })
    template.hasResourceProperties('AWS::ECS::Service', {
      ServiceRegistries: Match.arrayWith([
        Match.objectLike({ ContainerName: 'server', ContainerPort: 3001 })
      ])
    })
    template.hasResourceProperties('AWS::ApiGatewayV2::VpcLink', {
      Name: 'milestone-server-staging',
      SecurityGroupIds: Match.anyValue(),
      SubnetIds: Match.anyValue()
    })
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      ConnectionType: 'VPC_LINK',
      IntegrationMethod: 'ANY',
      IntegrationType: 'HTTP_PROXY',
      IntegrationUri: Match.anyValue(),
      PayloadFormatVersion: '1.0'
    })
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      AccessLogSettings: Match.objectLike({ DestinationArn: Match.anyValue(), Format: Match.anyValue() }),
      AutoDeploy: true,
      StageName: '$default'
    })
  })

  it('publishes the stable application outputs', () => {
    const template = createTemplate()

    template.hasOutput('apiUrl', {})
    template.hasOutput('apiBaseUrl', {})
    template.hasOutput('healthUrl', {})
  })
})
