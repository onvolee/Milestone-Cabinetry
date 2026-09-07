#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { App, Tags, Validations } from 'aws-cdk-lib'
import { AwsSolutionsChecks } from 'cdk-nag'
import { getStageConfig } from '../lib/config/stages.js'
import { ServerApplicationStack } from '../lib/stacks/server-application-stack.js'
import { ServerFoundationStack } from '../lib/stacks/server-foundation-stack.js'

const app = new App()
const stageContext = app.node.tryGetContext('stage') as unknown
const stage = stageContext ?? 'staging'
if (typeof stage !== 'string') {
  throw new Error('CDK context value "stage" must be a string.')
}

const config = getStageConfig(stage)
const actualAccount = process.env.CDK_DEFAULT_ACCOUNT
const actualRegion = process.env.CDK_DEFAULT_REGION

if (actualAccount && actualAccount !== config.account) {
  throw new Error(`Refusing to target AWS account ${actualAccount}; expected ${config.account}.`)
}
if (actualRegion && actualRegion !== config.region) {
  throw new Error(`Refusing to target AWS region ${actualRegion}; expected ${config.region}.`)
}

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const serverSourcePath = resolve(currentDirectory, '../../server')
const env = { account: config.account, region: config.region }

const foundation = new ServerFoundationStack(app, 'ServerFoundationStack', {
  config,
  description: 'Milestone server staging network, database, cluster, and bootstrap task',
  env,
  stackName: config.foundationStackName,
  serverSourcePath,
  terminationProtection: true
})

const application = new ServerApplicationStack(app, 'ServerApplicationStack', {
  config,
  description: 'Milestone server staging Fargate service and HTTP API',
  env,
  foundation,
  stackName: config.applicationStackName,
  serverSourcePath
})
application.addStackDependency(foundation)

for (const [key, value] of Object.entries({
  Application: 'milestone-server',
  Environment: config.environment,
  ManagedBy: 'aws-cdk',
  Project: 'milestone-cabinetry'
})) {
  Tags.of(app).add(key, value)
}

Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }))

app.synth()
