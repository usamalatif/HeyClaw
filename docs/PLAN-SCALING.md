# HeyClaw Scaling Plan - Paid User Instances

> Created: 2026-02-16
> Status: Planning

## Overview

HeyClaw uses a hybrid architecture:
- **Free users**: Shared OpenClaw instance with session isolation
- **Paid users**: Dedicated OpenClaw instance per user

This document outlines how to scale to 1000s of paid users without infrastructure headaches.

---

## The Challenge

- 1000s of paid users = 1000s of OpenClaw containers
- Each container needs ~256MB-512MB RAM, minimal CPU when idle
- Requirements:
  - Auto-scaling (don't pre-provision)
  - Cost efficiency (don't pay for idle)
  - Zero management headache
  - Fast provisioning (<5 seconds)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        HeyClaw Mobile App                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        HeyClaw API Server                        │
│                                                                  │
│  ┌─────────────┐    ┌──────────────────────────────────────┐   │
│  │   Router    │───▶│  Free: Shared Gateway (sessions)     │   │
│  │  (by tier)  │    │  Paid: Dedicated Instance (Fly.io)   │   │
│  └─────────────┘    └──────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌──────────────────┐              ┌──────────────────────────────┐
│  Shared OpenClaw │              │     Fly.io Machines API      │
│    Gateway       │              │                              │
│                  │              │  ┌────────┐ ┌────────┐       │
│  Free User A ────│              │  │Agent-1 │ │Agent-2 │ ...   │
│  Free User B ────│              │  │(Paid)  │ │(Paid)  │       │
│  Free User C ────│              │  └────────┘ └────────┘       │
└──────────────────┘              └──────────────────────────────┘
```

---

## Tier Comparison

| Feature | Free Tier | Paid Tier |
|---------|-----------|-----------|
| **Container** | Shared | Dedicated |
| **Isolation** | Session-based | Complete |
| **Tools** | Restricted | Full |
| **Browser** | ❌ Disabled | ✅ Full Chrome |
| **Exec/Shell** | ❌ Disabled | ✅ Full access |
| **Cron/Reminders** | ❌ Limited | ✅ Full |
| **Memory Files** | ✅ Basic | ✅ Full workspace |
| **Cost/User** | ~$0 | ~$2-5/mo |

---

## Scaling Phases

### 🏠 Phase 1: Single VPS (0-100 paid users)

**Setup:**
- One beefy VPS (32-64GB RAM)
- Docker Compose for all containers
- HeyClaw API manages via Docker socket

**Architecture:**
```
VPS (32GB RAM)
├── heyclaw-api (1 container)
├── heyclaw-gateway-free (1 container, shared)
├── postgres + redis
└── agent-{userId} containers (up to ~60)
```

**Pros:**
- Simple to manage
- Cheap (~$100-200/mo server)
- Full control

**Cons:**
- Single point of failure
- Manual scaling
- Limited to ~60 paid users per server

**When to upgrade:** >50 paid users OR need high availability

---

### 🚀 Phase 2: Fly.io (100-1000 paid users) - RECOMMENDED

**Why Fly.io:**
1. **Machines API** - Create containers via REST API
2. **Scale to zero** - Containers auto-stop when idle
3. **Pay per use** - Only pay for active time
4. **Global edge** - Run containers close to users
5. **Fast cold start** - ~2 seconds to wake

**API Integration:**
```typescript
// Create dedicated instance for paid user
async function createPaidInstance(userId: string) {
  const response = await fetch('https://api.machines.dev/v1/apps/heyclaw-agents/machines', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FLY_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: `agent-${userId}`,
      config: {
        image: 'registry.fly.io/heyclaw-agent:latest',
        env: {
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
          USER_ID: userId
        },
        guest: {
          cpu_kind: 'shared',
          cpus: 1,
          memory_mb: 512
        },
        services: [{
          ports: [{ port: 18789, handlers: ['http'] }],
          protocol: 'tcp',
          internal_port: 18789
        }],
        auto_destroy: false,
        restart: { policy: 'on-failure' }
      }
    })
  });
  
  const machine = await response.json();
  return {
    instanceId: machine.id,
    instanceUrl: `http://${machine.id}.vm.heyclaw-agents.internal:18789`
  };
}
```

**Auto-suspend for cost savings:**
```typescript
// Fly machines auto-stop after idle timeout
// Configure in fly.toml or machine config:
{
  "services": [{
    "auto_stop_machines": true,
    "auto_start_machines": true,
    "min_machines_running": 0
  }]
}
```

**Cost Estimates:**
| Paid Users | Avg Active Hours/Day | Monthly Cost |
|------------|----------------------|--------------|
| 100 | 2h | ~$150 |
| 500 | 2h | ~$750 |
| 1000 | 2h | ~$1,500 |
| 1000 | 8h | ~$4,000 |

**Pros:**
- Auto-scaling, no capacity planning
- Pay only for active time
- Global distribution
- Simple API

**Cons:**
- Vendor lock-in (Fly.io)
- Cold start latency (~2s)
- Slightly higher per-hour cost than VPS

---

### ☸️ Phase 3: Kubernetes (1000+ paid users)

**When to consider:**
- >1000 paid users
- Need fine-grained cost optimization
- Have DevOps capacity
- Want multi-cloud

**Setup:**
- Managed K8s (GKE, EKS, DigitalOcean)
- Custom CRD for agent lifecycle
- KEDA for scale-to-zero
- Spot/preemptible instances for savings

**Not recommended until:**
- $10K+ MRR
- Dedicated DevOps engineer
- Clear need for K8s features

---

## Database Schema

```sql
-- Add tier and instance tracking
ALTER TABLE assistants ADD COLUMN tier VARCHAR(20) DEFAULT 'free';
ALTER TABLE assistants ADD COLUMN instance_id VARCHAR(100);      -- Fly machine ID
ALTER TABLE assistants ADD COLUMN instance_url VARCHAR(200);     -- Direct URL to instance
ALTER TABLE assistants ADD COLUMN instance_region VARCHAR(20);   -- Fly region (iad, lhr, etc.)
ALTER TABLE assistants ADD COLUMN instance_status VARCHAR(20);   -- running, stopped, creating, error
ALTER TABLE assistants ADD COLUMN instance_created_at TIMESTAMP;
ALTER TABLE assistants ADD COLUMN instance_last_active_at TIMESTAMP;

-- Index for quick lookups
CREATE INDEX idx_assistants_tier ON assistants(tier);
CREATE INDEX idx_assistants_instance_status ON assistants(instance_status);
```

---

## Lifecycle Management

### User Upgrades to Paid

```typescript
async function upgradeToPaid(userId: string) {
  // 1. Create dedicated Fly machine
  const instance = await createPaidInstance(userId);
  
  // 2. Copy workspace from shared to dedicated
  await migrateWorkspace(userId, instance.instanceUrl);
  
  // 3. Update database
  await db.query(`
    UPDATE assistants 
    SET tier = 'paid',
        instance_id = $2,
        instance_url = $3,
        instance_status = 'running',
        instance_created_at = NOW()
    WHERE user_id = $1
  `, [userId, instance.instanceId, instance.instanceUrl]);
  
  // 4. Delete session from shared gateway
  await removeFromSharedGateway(userId);
}
```

### User Downgrades to Free

```typescript
async function downgradeToFree(userId: string) {
  const assistant = await getAssistant(userId);
  
  // 1. Export memory files (optional, for user)
  await exportWorkspace(userId, assistant.instance_url);
  
  // 2. Destroy Fly machine
  await destroyInstance(assistant.instance_id);
  
  // 3. Update database
  await db.query(`
    UPDATE assistants 
    SET tier = 'free',
        instance_id = NULL,
        instance_url = NULL,
        instance_status = NULL
    WHERE user_id = $1
  `, [userId]);
  
  // 4. Create session on shared gateway
  await addToSharedGateway(userId);
}
```

### Request Routing

```typescript
async function routeToOpenClaw(userId: string, messages: Message[]) {
  const assistant = await getAssistant(userId);
  
  if (assistant.tier === 'paid' && assistant.instance_url) {
    // Route to dedicated instance
    return sendToInstance(assistant.instance_url, messages);
  } else {
    // Route to shared gateway with session key
    return sendToSharedGateway(userId, messages);
  }
}
```

---

## Shared Gateway Configuration (Free Tier)

```javascript
// gateway-entrypoint.sh - Free tier restrictions
const config = {
  tools: {
    deny: [
      'gateway',    // No gateway control
      'exec',       // No shell access
      'process',    // No process management
      'browser',    // No browser automation
      'cron',       // No scheduled tasks
      'nodes',      // No node control
    ]
  },
  agents: {
    defaults: {
      // Limited context window for free
      contextTokens: 32000,
      // Basic model
      model: { primary: 'openai-custom/gpt-5-nano' }
    }
  }
};
```

---

## Dedicated Instance Configuration (Paid Tier)

```javascript
// Full power for paid users
const config = {
  tools: {
    deny: ['gateway']  // Only block gateway control
  },
  browser: {
    enabled: true,
    headless: true,
    noSandbox: true
  },
  agents: {
    defaults: {
      contextTokens: 128000,
      model: { primary: 'openai-custom/gpt-5-nano' }
    }
  }
};
```

---

## Monitoring & Alerts

### Key Metrics
- Instance count by status (running, stopped, error)
- Average cold start time
- Cost per user
- Instance creation success rate

### Alerts
- Instance creation failures
- Orphaned instances (no DB record)
- Abnormal resource usage

---

## Cost Optimization Tips

1. **Aggressive auto-stop** - Stop containers after 5-10min idle
2. **Right-size resources** - Start with 256MB, increase if needed
3. **Regional placement** - Run containers near users
4. **Batch operations** - Wake containers in batches if possible
5. **Monitor usage** - Kill truly inactive paid accounts

---

## Rollout Plan

### Week 1: Preparation
- [ ] Add tier column to database
- [ ] Update API routing logic
- [ ] Set up Fly.io account and app
- [ ] Build dedicated instance Docker image

### Week 2: Free Tier Hardening
- [ ] Apply tool restrictions to shared gateway
- [ ] Test session isolation
- [ ] Add rate limiting

### Week 3: Paid Tier Implementation
- [ ] Implement instance creation API
- [ ] Implement instance destruction
- [ ] Add upgrade/downgrade flows

### Week 4: Integration & Testing
- [ ] Stripe webhook integration
- [ ] End-to-end testing
- [ ] Monitoring setup
- [ ] Soft launch to beta users

---

## Questions to Resolve

1. **Cold start UX** - Show loading indicator? Pre-warm on app open?
2. **Data retention** - How long to keep workspace after downgrade?
3. **Instance limits** - Max concurrent instances per region?
4. **Billing granularity** - Per-minute or per-hour?

---

## References

- [Fly.io Machines API](https://fly.io/docs/machines/)
- [OpenClaw Documentation](https://docs.openclaw.ai)
- [HeyClaw Main Plan](../PLAN.md)
