import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const stackName = 'MilestoneServerStagingFoundation'
const pollIntervalMs = 5_000
const timeoutMs = 15 * 60_000

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const readArgument = name => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const runAws = args => {
  const result = spawnSync('aws', [...args, '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `aws ${args.join(' ')} failed with exit code ${String(result.status)}.`)
  }

  return JSON.parse(result.stdout)
}

const loadOutputs = async file => {
  const contents = JSON.parse(await readFile(file, 'utf8'))
  const outputs = contents[stackName]

  if (!outputs) {
    throw new Error(`Stack ${stackName} was not found in ${file}.`)
  }

  return outputs
}

const run = async () => {
  const outputsFile = readArgument('--outputs') ?? 'cdk-outputs-foundation.json'
  const outputs = await loadOutputs(outputsFile)
  const required = [
    'clusterArn',
    'databaseBootstrapTaskDefinitionArn',
    'publicSubnetIds',
    'databaseBootstrapSecurityGroupId'
  ]

  for (const key of required) {
    if (!outputs[key]) {
      throw new Error(`Required Foundation output ${key} is missing.`)
    }
  }

  const response = runAws([
    'ecs',
    'run-task',
    '--region',
    process.env.AWS_REGION ?? 'us-east-1',
    '--cluster',
    outputs.clusterArn,
    '--task-definition',
    outputs.databaseBootstrapTaskDefinitionArn,
    '--launch-type',
    'FARGATE',
    '--platform-version',
    '1.4.0',
    '--enable-ecs-managed-tags',
    '--network-configuration',
    JSON.stringify({
      awsvpcConfiguration: {
        assignPublicIp: 'ENABLED',
        securityGroups: [outputs.databaseBootstrapSecurityGroupId],
        subnets: outputs.publicSubnetIds.split(',')
      }
    })
  ])

  if (response.failures?.length) {
    throw new Error(`ECS rejected the bootstrap task: ${JSON.stringify(response.failures)}`)
  }

  const taskArn = response.tasks?.[0]?.taskArn
  if (!taskArn) {
    throw new Error('ECS did not return a task ARN for the database bootstrap.')
  }

  console.log(`Database bootstrap task started: ${taskArn}`)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const description = runAws([
      'ecs',
      'describe-tasks',
      '--region',
      process.env.AWS_REGION ?? 'us-east-1',
      '--cluster',
      outputs.clusterArn,
      '--tasks',
      taskArn
    ])
    const task = description.tasks?.[0]

    if (task?.lastStatus !== 'STOPPED') {
      await sleep(pollIntervalMs)
      continue
    }

    const container = task.containers?.find(item => item.name === 'database-bootstrap') ?? task.containers?.[0]
    if (container?.exitCode !== 0) {
      const reason = container?.reason ?? task.stoppedReason ?? 'No failure reason returned by ECS.'
      throw new Error(`Database bootstrap failed with exit code ${String(container?.exitCode)}: ${reason}`)
    }

    console.log('Database bootstrap completed successfully with exit code 0.')
    return
  }

  runAws([
    'ecs',
    'stop-task',
    '--region',
    process.env.AWS_REGION ?? 'us-east-1',
    '--cluster',
    outputs.clusterArn,
    '--task',
    taskArn,
    '--reason',
    'Database bootstrap timed out in deployment automation'
  ])
  throw new Error(`Database bootstrap did not finish within ${timeoutMs / 60_000} minutes.`)
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
