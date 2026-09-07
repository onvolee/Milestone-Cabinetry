import { CfnOutput, Stack } from 'aws-cdk-lib'
import type { StackProps } from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import type { StageConfig } from '../config/stages.js'
import { ServerService } from '../constructs/server-service.js'
import type { ServerFoundationStack } from './server-foundation-stack.js'

export interface ServerApplicationStackProps extends StackProps {
  readonly config: StageConfig
  readonly foundation: ServerFoundationStack
  readonly serverSourcePath: string
}

export class ServerApplicationStack extends Stack {
  public constructor(scope: Construct, id: string, props: ServerApplicationStackProps) {
    super(scope, id, props)

    const server = new ServerService(this, 'ServerService', {
      apiSecurityGroup: props.foundation.apiSecurityGroup,
      cluster: props.foundation.cluster,
      config: props.config,
      database: props.foundation.database.instance,
      namespace: props.foundation.namespace,
      serverSourcePath: props.serverSourcePath,
      serviceSecurityGroup: props.foundation.serviceSecurityGroup,
      vpc: props.foundation.vpc
    })

    const apiUrl = server.api.apiEndpoint
    new CfnOutput(this, 'apiUrl', { value: apiUrl })
    new CfnOutput(this, 'apiBaseUrl', { value: `${apiUrl}/api` })
    new CfnOutput(this, 'healthUrl', { value: `${apiUrl}/api/health` })
  }
}
