// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'milestone-portal',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      protect: false,
      home: 'aws',
      providers: {
        aws: {
          region: process.env.AWS_REGION || 'us-east-1'
        }
      }
    }
  },
  async run() {
    const stage = $app.stage
    const stageConfig = {
      staging: {
        domain: 'staging.milestonecabinetry.com',
        apiUrl: 'https://api.staging.milestonecabinetry.com/api'
      },
      production: {
        domain: {
          name: 'milestonecabinetry.com',
          redirects: ['www.milestonecabinetry.com'],
          dns: sst.aws.dns({ override: true })
        },
        apiUrl: 'https://api.milestonecabinetry.com/api'
      }
    }

    const config =
      stageConfig[stage as keyof typeof stageConfig] ?? stageConfig.staging
    const productionCertificate =
      stage === 'production' && !process.env.SST_DOMAIN
        ? new sst.aws.DnsValidatedCertificate(
            'MilestonePortalCertificate',
            {
              domainName: '*.milestonecabinetry.com',
              alternativeNames: ['milestonecabinetry.com'],
              dns: sst.aws.dns()
            },
            {
              provider: new aws.Provider('MilestonePortalCertificateProvider', {
                region: 'us-east-1'
              })
            }
          )
        : undefined
    const domain =
      process.env.SST_DOMAIN ||
      (stage === 'production'
        ? {
            ...stageConfig.production.domain,
            cert: productionCertificate?.arn
          }
        : config.domain)

    const portal = new sst.aws.Nextjs('MilestonePortal', {
      environment: {
        NEXT_PUBLIC_API_BASE_URL:
          process.env.NEXT_PUBLIC_API_BASE_URL || config.apiUrl
      },
      dev: {
        command: 'yarn dev',
        url: 'http://localhost:8080'
      },
      domain
    })

    return {
      url: portal.url
    }
  }
})
