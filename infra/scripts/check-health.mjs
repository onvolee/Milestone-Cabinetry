import { readFile } from 'node:fs/promises'

const stackName = 'MilestoneServerStagingApplication'
const attempts = 30
const retryDelayMs = 10_000

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const readArgument = name => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const run = async () => {
  const outputsFile = readArgument('--outputs') ?? 'cdk-outputs-application.json'
  const contents = JSON.parse(await readFile(outputsFile, 'utf8'))
  const healthUrl = contents[stackName]?.healthUrl

  if (!healthUrl) {
    throw new Error(`Stack output ${stackName}.healthUrl was not found in ${outputsFile}.`)
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) })

      if (response.status === 200) {
        console.log(`Staging API is healthy: ${healthUrl}`)
        console.log(await response.text())
        return
      }

      console.error(`Health check attempt ${attempt} returned HTTP ${response.status}.`)
    } catch (error) {
      console.error(
        `Health check attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    if (attempt < attempts) {
      await sleep(retryDelayMs)
    }
  }

  throw new Error(`Staging API health check failed after ${attempts} attempts: ${healthUrl}`)
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
