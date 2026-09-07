export const STAGING_ACCOUNT = '441176049535'
export const STAGING_REGION = 'us-east-1'

export interface StageConfig {
  readonly account: string
  readonly apiPort: number
  readonly applicationStackName: string
  readonly corsOrigins: string
  readonly databaseBackupRetentionDays: number
  readonly databaseEngineVersion: string
  readonly databaseMajorVersion: string
  readonly databaseName: string
  readonly environment: 'staging'
  readonly foundationStackName: string
  readonly masterUsername: string
  readonly region: string
  readonly runtimeDatabaseUsername: string
}

const stages: Readonly<Record<string, StageConfig>> = {
  staging: {
    account: STAGING_ACCOUNT,
    apiPort: 3001,
    applicationStackName: 'MilestoneServerStagingApplication',
    corsOrigins: 'https://staging.milestonecabinetry.com',
    databaseBackupRetentionDays: 1,
    databaseEngineVersion: '18.6',
    databaseMajorVersion: '18',
    databaseName: 'milestone_cabinetry',
    environment: 'staging',
    foundationStackName: 'MilestoneServerStagingFoundation',
    masterUsername: 'milestone_admin',
    region: STAGING_REGION,
    runtimeDatabaseUsername: 'runtime_user'
  }
}

export const getStageConfig = (stage: string): StageConfig => {
  const config = stages[stage]

  if (!config) {
    throw new Error(`Unsupported deployment stage: ${stage}. Only staging is configured.`)
  }

  return config
}
