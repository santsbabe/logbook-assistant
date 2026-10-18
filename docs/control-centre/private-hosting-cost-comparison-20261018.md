# Control Centre private hosting options — verified indicative pricing (18 October 2026)

**Decision state:** NO provider selected, no deployment authorised, no Netlify credits spent. All figures in USD before taxes, card/FX fees, external monitoring and optional backup upgrades. Currency-conversion to ZAR is deliberately omitted without a verified FX rate. Prices and account balances must be rechecked before any purchase.

## Workload assumptions

One authenticated private Node HTTPS API; one small private PostgreSQL service; one Gmail polling scheduler every 15 minutes (2,880 runs per 30-day month); roughly 1 GB outgoing traffic; fewer than 10,000 HTTP requests; modest household tasks and mail. This is a planning model, not measured production demand. Neither Gmail API quotas, backups, secret management, nor provider taxes are assumed free.

| Option | Published pricing inputs | Indicative monthly baseline | Risks and decision |
|---|---|---|---|
| **Render all-in-one** | Web service 0.5c/512MB $7; PostgreSQL 0.1c/256MB $6; cron job $1/month minimum | **$14/month** before bandwidth, larger DB, backups and add-ons | Predictable low-traffic floor. PostgreSQL 256MB may be marginal; backup retention, cron reliability and capacity must be tested. No deployed resources. |
| **Railway Hobby, API + Postgres** | $5 Hobby monthly minimum includes usage; RAM $10/GB-month, CPU $20/vCPU-month, volume $0.15/GB-month | **~$13.15/month illustration** based on 0.5GB+0.1 vCPU API, 0.5GB+0.05 vCPU database, 1GB volume. Minimum included, not added again. | Actual measured CPU/RAM/egress can vary, and backups/restore/security may add cost. Configure Railway hard usage limits before any trial. |
| **Netlify Free functions + private PostgreSQL** | Free 300 credits/month shared across the team; prod deploy 15 credits; 1 GB-hour compute 10 credits; 1GB bandwidth 20; 10k requests 2 | At 2,880 Gmail runs × 10 seconds × 1GB: 80 compute credits, +15 deploy +20 bandwidth +2 requests **~117 credits/month**, *before* database compute, other sites and other function traffic. At 30 seconds/run: **~277 credits/month** before extras. | Dangerous under a shared 300-credit cap, especially with existing seven Netlify sites. Free hard cap pauses affected team apps. Exact existing usage and DB costs unknown. No Netlify deployment. |
| **Render API + cron + Supabase Pro DB** | Render API $7 and cron minimum $1; Supabase Pro $25 including one default Micro compute allowance and daily backups | **~$33/month** baseline, excluding egress, optional compute/backup upgrades | Stronger paid DB service and backups, but materially higher floor and adds another provider. |

Official references (read directly on 18 October 2026):

- Netlify credits, limits and meters: https://www.netlify.com/pricing/ and https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/
- Netlify function default 1 GB memory: https://docs.netlify.com/build/functions/usage-and-billing/
- Render service/postgres compute: https://render.com/pricing
- Render cron minimum: https://render.com/docs/cronjobs
- Railway billing including Hobby inclusion: https://docs.railway.com/pricing ; usage caps: https://docs.railway.com/pricing/cost-control
- Supabase Pro: https://supabase.com/pricing and https://supabase.com/docs/guides/platform/billing-faq

## Recommendation and constraints

**Do not use Netlify Free as the unattended worker until actual credits are verified** and a maximum loss-of-service policy is accepted. The shared cap and previous unbudgeted usage make assumptions unsafe. For a future approved live pilot, compare a **Render $14/month low-end configuration** against **Railway usage-billed $13–20+/month** using actual SLA, backup, region, secrets, and database RLS/role provisioning requirements. Supabase Pro is a higher-cost managed DB option. None of these are authorised to provision.

Required additional evidence before an action:
1. Read-only live Netlify billing meter from user's account; connector does not expose it. User-side link: https://app.netlify.com/teams/santsbabe . The user should complete this privately.
2. Provider deployment-specific hard spend ceiling, database backups and audited restore, South Africa/data protection jurisdiction decision, private worker scheduler frequency and off-switch.
3. Verified OAuth app authorisation, least-privileged SQL roles, masked logs, encrypted keys and secure callback domain.
4. Explicit provider and budget approval from user; separate explicit permission for any Netlify deployment; QA/iPhone acceptance.

No costs have been incurred through this comparison.
