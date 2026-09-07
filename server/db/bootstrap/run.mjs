import { spawnSync } from 'node:child_process'
import { Signer } from '@aws-sdk/rds-signer'

const requiredEnvironment = ['AWS_REGION', 'PGDATABASE', 'PGHOST', 'PGPASSWORD', 'PGPORT', 'PGUSER']

for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`Required environment variable ${name} is missing.`)
  }
}

const runPsql = (password, args = process.argv.slice(2), environment = {}) =>
  spawnSync('psql', args, {
    encoding: 'utf8',
    env: { ...process.env, ...environment, PGPASSWORD: password }
  })

const printResult = result => {
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
}

let iamPassword
const getIamPassword = async () => {
  if (!iamPassword) {
    const signer = new Signer({
      hostname: process.env.PGHOST,
      port: Number(process.env.PGPORT),
      region: process.env.AWS_REGION,
      username: process.env.PGUSER
    })

    iamPassword = await signer.getAuthToken()
  }

  return iamPassword
}

const authenticationFailed = result => /(?:PAM|password) authentication failed/i.test(result.stderr ?? '')
const tlsWasRequired = result => /no pg_hba\.conf entry[\s\S]*no encryption/i.test(result.stderr ?? '')

let connectionPassword = process.env.PGPASSWORD
let tlsProbe = runPsql(connectionPassword, ['--no-psqlrc', '--command=SELECT 1'], { PGSSLMODE: 'disable' })

if (authenticationFailed(tlsProbe)) {
  connectionPassword = await getIamPassword()
  tlsProbe = runPsql(connectionPassword, ['--no-psqlrc', '--command=SELECT 1'], { PGSSLMODE: 'disable' })
}

if (tlsProbe.status === 0) {
  throw new Error('TLS enforcement check failed: the database accepted a plaintext connection.')
}

if (!tlsWasRequired(tlsProbe)) {
  printResult(tlsProbe)
  throw new Error('TLS enforcement check failed: the database did not explicitly reject the plaintext connection.')
}

console.log('TLS enforcement verified: the database rejected a plaintext connection.')

let result = runPsql(connectionPassword)

if (result.status !== 0 && authenticationFailed(result)) {
  console.error('Master password authentication was rejected; retrying with IAM database authentication.')
  result = runPsql(await getIamPassword())
}

printResult(result)
process.exit(result.status ?? 1)
