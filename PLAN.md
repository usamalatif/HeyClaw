# HeyClaw — Complete Product Plan 🎙️🦞

> "Your AI agent, one tap away"

**Tagline:** Talk to your personal AI. No setup. Just works.

**Website:** heyclaw.com (TBD)
**App:** iOS first, Android later

---

## 🎯 Vision

**Problem:** 
- OpenClaw is powerful but requires technical setup
- QuickClaw and SimpleClaw offer hosting but chat-only interface  
- Current voice solutions (Twilio/ElevenLabs) are slow and broken
- Non-technical users are locked out of the AI agent revolution

**Solution:**
HeyClaw = Managed OpenClaw + Voice Interface in one iOS app.

Download → Sign up → Talk to your AI in 30 seconds.

**What makes it unique:**
- Not just voice (like ClawVoice would've been)
- Not just hosting (like QuickClaw)
- It's BOTH — complete solution, no setup required

---

## 👤 Target Users

| Segment | Pain Point | Why HeyClaw |
|---------|------------|-------------|
| Non-technical people | "OpenClaw looks cool but I can't set it up" | Zero setup, just download |
| Busy professionals | "I need hands-free AI while driving/walking" | Voice-first experience |
| OpenClaw curious | "I want to try before committing to setup" | Instant trial |
| Power users | "I want voice but current options suck" | Low-latency, native app |

**Primary persona:** 
Sarah, 34, marketing manager. Heard about AI agents on Twitter. Wants a personal assistant but doesn't know Docker from a whale. Just wants it to work.

---

## 🏆 Competitive Landscape

| Product | What It Does | Gap HeyClaw Fills |
|---------|--------------|-------------------|
| **QuickClaw** | iOS app, run your Claw | Chat-only, no voice |
| **SimpleClaw** | Managed hosting | No mobile app, no voice |
| **MyClaw** | Managed hosting | Web only, no voice |
| **AionUI** | Unified interface | Not mobile-native |
| **Native OpenClaw** | Self-hosted | Requires tech skills |

**HeyClaw = Only voice-first managed OpenClaw solution**

---

## 🏗️ Feature Roadmap

### MVP (v1.0) — Week 1-3
- [ ] iOS app (React Native no expo)
- [ ] Sign up / login (magic link + Apple/Google)
- [ ] Auto-provision OpenClaw instance on signup
- [ ] Push-to-talk voice input
- [ ] Speech-to-text (OpenAI Whisper API)
- [ ] Send transcribed text to user's agent
- [ ] Receive response from agent
- [ ] Text-to-speech playback (iOS native for free tier)
- [ ] Basic chat UI (text fallback)
- [ ] Credit system (track usage per model tier)
- [ ] Free tier (50 credits/month)
- [ ] 3 paid plans via iOS In-App Purchase
- [ ] Model selector (Standard / Power / Best)
- [ ] Basic settings (voice speed)

### v1.5 — Week 4-6
- [ ] Wake word detection ("Hey Claw")
- [ ] Customize agent name & personality
- [ ] Premium TTS voices (OpenAI/ElevenLabs)
- [ ] Credit top-up packs (via IAP)
- [ ] Widget for home screen
- [ ] Push notifications from agent
- [ ] Chat history sync

### v2.0 — Month 2-3
- [ ] Android app
- [ ] Apple Watch companion
- [ ] Siri Shortcuts integration
- [ ] CarPlay support
- [ ] Connect external services (Calendar, Email)
- [ ] Multiple agent personalities
- [ ] Voice cloning (your agent's unique voice)
- [ ] Family/Team plans

### v3.0 — Future
- [ ] On-device Whisper (fully offline STT)
- [ ] Real-time interruption (stop agent mid-sentence)
- [ ] Multi-modal (show images agent references)
- [ ] Custom wake words
- [ ] Desktop companion (Mac menu bar)
- [ ] API for developers
- [ ] White-label for agencies

---

## 🔧 Technical Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S iPHONE                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    HeyClaw iOS App                        │  │
│  │                                                           │  │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌────────┐  │  │
│  │  │   🎤    │ → │ Record  │ → │ Whisper │ → │  Send  │  │  │
│  │  │  Tap    │    │ Audio   │    │  STT   │    │  Text  │  │  │
│  │  └─────────┘    └─────────┘    └─────────┘    └───┬────┘  │  │
│  │                                                   │       │  │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐        │       │  │
│  │  │   🔊    │ ← │  Play   │ ← │   TTS   │ ←──────┘       │  │
│  │  │ Speaker │    │  Audio  │    │ Convert │                │  │
│  │  └─────────┘    └─────────┘    └─────────┘                │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ HTTPS / WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    HeyClaw Backend API                          │
│                    (Fly.io - Single App)                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ ││
│  │  │  Auth    │  │  Route   │  │  Usage   │  │  Provision  │ ││
│  │  │  Check   │  │  Request │  │  Track   │  │  Agent      │ ││
│  │  └──────────┘  └────┬─────┘  └──────────┘  └─────────────┘ ││
│  │                     │                                       ││
│  └─────────────────────┼───────────────────────────────────────┘│
└────────────────────────┼────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Agent Pool (Fly.io Machines)                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    ││
│  │  │ user_001 │  │ user_002 │  │ user_003 │  │ user_... │    ││
│  │  │ OpenClaw │  │ OpenClaw │  │ OpenClaw │  │ OpenClaw │    ││
│  │  │          │  │          │  │          │  │          │    ││
│  │  │ (active) │  │(sleeping)│  │(sleeping)│  │ (active) │    ││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘    ││
│  │                                                             ││
│  │  Machines auto-sleep after 5 min idle, wake on request      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Supabase │  │  OpenAI  │  │  Stripe  │  │   Fly    │        │
│  │ Auth+DB  │  │  API     │  │ Payments │  │ Machines │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### Voice Flow (Streaming)

```
User taps & holds 🎤
         │
         ▼
┌─────────────────┐
│ Start Recording │ ← Native AudioRecorder (m4a)
└────────┬────────┘
         │ User releases button
         ▼
┌─────────────────┐
│ Stop Recording  │
│ Get audio file  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Upload to       │ ← POST /voice/transcribe
│ Backend         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Whisper API     │ ← OpenAI STT ($0.006/min)
│ Transcribe      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│             POST /agent/voice (SSE Stream)              │
│                                                         │
│  ┌──────────────┐     ┌──────────────┐                  │
│  │ Agent thinks │ ──→ │ Split into   │                  │
│  │ (streams     │     │ sentences    │                  │
│  │  text back)  │     └──────┬───────┘                  │
│  └──────────────┘            │                          │
│                              ▼                          │
│                    ┌──────────────────┐                  │
│                    │ For each sentence│                  │
│                    │                  │                  │
│                    │ 1. SSE: text     │ → UI shows text  │
│                    │ 2. TTS sentence  │                  │
│                    │ 3. SSE: audio    │ → Play chunk     │
│                    │                  │                  │
│                    │ (next sentence   │                  │
│                    │  starts while    │                  │
│                    │  audio plays)    │                  │
│                    └──────────────────┘                  │
│                                                         │
│  User hears first sentence ~1-2s after agent starts     │
│  (vs waiting for FULL response + FULL TTS = 3-5s)       │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Audio chunks play back-to-back   │
│ ← Native audio player (mp3)     │
│                                  │
│ User can tap STOP to cancel      │
└──────────────────────────────────┘

Target: first audio plays within ~1.5s of agent starting
```

---

## 💻 Tech Stack

### Mobile App

| Component | Technology | Why |
|-----------|-----------|-----|
| Framework | React Native + Expo | Fast dev, good audio support |
| Language | TypeScript | Type safety |
| Navigation | React Navigation | Standard, reliable |
| State | Zustand | Simple, lightweight |
| Audio | expo-av | Native audio recording/playback |
| Auth | Supabase Auth | Magic links, OAuth |
| HTTP | Axios / fetch | API calls |
| Styling | NativeWind (Tailwind) | Familiar, fast |

### Backend API

| Component | Technology | Why |
|-----------|-----------|-----|
| Runtime | Node.js 20+ | Familiar, fast |
| Framework | Hono | Lightweight, fast, Cloudflare-compatible |
| Database | Supabase (Postgres) | Free tier, real-time, auth |
| Hosting | Fly.io | Auto-scaling, machines API |
| Queue | Inngest (optional) | Background jobs if needed |

### Agent Hosting

| Component | Technology | Why |
|-----------|-----------|-----|
| Container | Docker | OpenClaw runs in Docker |
| Orchestration | Fly.io Machines | Per-user machines, auto-sleep |
| Base Image | OpenClaw official | Minimal customization needed |

### External Services

| Service | Purpose | Cost |
|---------|---------|------|
| Supabase | Auth + Database | Free tier (50K MAU) |
| Apple IAP | Subscriptions (StoreKit 2) | 15-30% commission |
| OpenAI Whisper | Speech-to-text | $0.006/min |
| OpenAI TTS | Text-to-speech (paid tiers) | $0.015/1K chars |
| iOS AVSpeech | Text-to-speech (Free) | Free |
| Fly.io | Backend + Agents | ~$3-5/user/mo |
| OpenAI / Anthropic | LLM APIs (Standard/Power/Best) | Varies by model |

---

## 💰 Cost Analysis

### Credit Plans

| Plan | Price/mo | Credits/mo | Best for |
|------|----------|------------|----------|
| **Free** | $0 | 50 | Try the app (~5 standard msgs) |
| **Starter** | $24.99 | 1,400 | Light daily use |
| **Pro** | $69.99 | 4,200 | Regular use, power models |
| **Ultra** | $179.99 | 12,000 | Heavy use, best models |

### Model Tiers & Credit Costs

| Tier | Models | Credits/msg | Why |
|------|--------|-------------|-----|
| **Standard** (10 cr) | GPT-4o-mini, Claude Haiku | 10 | Fast, cheap, good for quick tasks |
| **Power** (30 cr) | GPT-4o, Claude Sonnet | 30 | Smarter, better reasoning |
| **Best** (100 cr) | Claude Opus, GPT-5.3 | 100 | Top-tier intelligence |

### Messages Per Plan (by model)

| Plan | Standard (10cr) | Power (30cr) | Best (100cr) |
|------|-----------------|--------------|--------------|
| Free (50 cr) | 5 msgs | 1 msg | 0 msgs |
| Starter (1,400 cr) | 140 msgs | 46 msgs | 14 msgs |
| Pro (4,200 cr) | 420 msgs | 140 msgs | 42 msgs |
| Ultra (12,000 cr) | 1,200 msgs | 400 msgs | 120 msgs |

### Per-Message Cost (our cost)

| Component | Standard msg | Power msg | Best msg |
|-----------|-------------|-----------|----------|
| Whisper STT (~30s) | $0.003 | $0.003 | $0.003 |
| LLM API | $0.0002 | $0.003 | $0.03 |
| TTS (iOS native) | $0.00 | $0.00 | $0.00 |
| Fly Machine (wake) | $0.001 | $0.001 | $0.001 |
| **Total/msg** | **~$0.004** | **~$0.007** | **~$0.034** |

### Pricing vs Margin (Apple 30% cut)

| Plan | Price | Apple Cut | COGS (est.) | Net Margin |
|------|-------|-----------|-------------|------------|
| Free | $0 | — | ~$0.02/mo | -$0.02/mo |
| Starter ($24.99) | $24.99 | $7.50 | ~$1.00/mo | **+$16.49 (66%)** |
| Pro ($69.99) | $69.99 | $21.00 | ~$3.00/mo | **+$45.99 (66%)** |
| Ultra ($179.99) | $179.99 | $54.00 | ~$12.00/mo | **+$113.99 (63%)** |

> Note: Apple drops to 15% for Small Business Program (<$1M revenue), further improving margins.

### Monthly Revenue by Scale

| Users | Free % | Starter % | Pro % | Ultra % | MRR | Costs | Net |
|-------|--------|-----------|-------|---------|-----|-------|-----|
| 100 | 60% | 25% | 10% | 5% | $1,425 | $450 | **+$975** |
| 500 | 50% | 30% | 15% | 5% | $9,525 | $2,100 | **+$7,425** |
| 1000 | 40% | 30% | 20% | 10% | $25,500 | $5,500 | **+$20,000** |

> Revenue shown after Apple 30% cut. COGS includes Fly.io, API costs, and Supabase.

---

## 📊 Database Schema

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  
  -- Subscription
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'ultra')),
  apple_original_transaction_id TEXT, -- IAP receipt tracking
  subscription_status TEXT DEFAULT 'none',
  subscription_ends_at TIMESTAMP,
  
  -- Agent
  agent_machine_id TEXT, -- Fly.io machine ID
  agent_status TEXT DEFAULT 'pending' CHECK (agent_status IN ('pending', 'provisioning', 'running', 'sleeping', 'error')),
  agent_name TEXT DEFAULT 'HeyClaw',
  agent_personality TEXT, -- Custom SOUL.md content
  
  -- Credits (reset monthly on subscription renewal)
  credits_remaining INT DEFAULT 50, -- 50 for free, refilled on billing cycle
  credits_monthly_limit INT DEFAULT 50, -- based on plan
  credits_reset_at TIMESTAMP, -- next reset date
  
  -- Settings
  tts_voice TEXT DEFAULT 'default',
  tts_speed FLOAT DEFAULT 1.0,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP
);

-- Usage logs (for analytics + billing)
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  type TEXT NOT NULL CHECK (type IN ('stt', 'tts', 'agent_message')),
  model_tier TEXT CHECK (model_tier IN ('standard', 'power', 'best')),
  model_name TEXT, -- e.g. 'gpt-4o-mini', 'claude-opus'
  credits_used INT DEFAULT 0, -- credits deducted
  duration_ms INT, -- for audio
  tokens INT, -- for agent
  cost_usd DECIMAL(10, 6), -- our actual cost
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Chat sessions (for history)
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  title TEXT,
  messages JSONB DEFAULT '[]',
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_agent_machine ON users(agent_machine_id);
CREATE INDEX idx_usage_user_date ON usage_logs(user_id, created_at);
CREATE INDEX idx_sessions_user ON chat_sessions(user_id);

-- Monthly credit reset function (run via cron, resets users whose cycle is due)
CREATE OR REPLACE FUNCTION reset_monthly_credits()
RETURNS void AS $$
BEGIN
  UPDATE users
  SET credits_remaining = credits_monthly_limit,
      credits_reset_at = credits_reset_at + INTERVAL '1 month'
  WHERE credits_reset_at <= NOW();
END;
$$ LANGUAGE plpgsql;
```

---

## 🔌 API Endpoints

### Auth
```
POST   /auth/magic-link     # Send magic link email
POST   /auth/verify          # Verify magic link token
POST   /auth/oauth/apple     # Apple Sign In
POST   /auth/oauth/google    # Google Sign In
DELETE /auth/logout          # Logout
```

### User
```
GET    /user/me              # Get current user
PATCH  /user/me              # Update user settings
GET    /user/credits          # Get credits remaining + plan info
```

### Voice
```
POST   /voice/transcribe     # Upload audio → get text (Whisper)
POST   /voice/speak          # Text → audio URL (TTS)
```

### Agent
```
POST   /agent/message        # Send message to agent (deducts credits based on model tier)
GET    /agent/status         # Check agent status
POST   /agent/wake           # Wake sleeping agent
PATCH  /agent/personality    # Update SOUL.md
```

### Chat
```
GET    /chat/sessions        # List chat sessions
GET    /chat/sessions/:id    # Get session messages
POST   /chat/sessions        # Create new session
DELETE /chat/sessions/:id    # Delete session
```

### Billing (IAP)
```
POST   /billing/verify       # Verify Apple IAP receipt
GET    /billing/status       # Get subscription status
POST   /billing/webhook      # App Store Server Notification handler
```

---

## 📱 App Screens (Detailed)

### Screen 1: Splash
```
┌─────────────────────────────┐
│                             │
│                             │
│                             │
│         🦞                  │
│                             │
│      HeyClaw               │
│                             │
│                             │
│        ◦ ◦ ◦               │
│      (loading)              │
│                             │
│                             │
└─────────────────────────────┘
```

### Screen 2: Onboarding (3 pages, swipeable)

**Page 1:**
```
┌─────────────────────────────┐
│                             │
│         🎙️                  │
│                             │
│    Talk to your AI         │
│                             │
│  Just hold and speak.       │
│  Your personal assistant    │
│  understands everything.    │
│                             │
│        ○ ◦ ◦               │
│                             │
│                             │
│      [Skip]    [Next →]    │
└─────────────────────────────┘
```

**Page 2:**
```
┌─────────────────────────────┐
│                             │
│         🧠                  │
│                             │
│    It remembers you        │
│                             │
│  Your agent learns your     │
│  preferences, tasks, and    │
│  keeps everything private.  │
│                             │
│        ◦ ○ ◦               │
│                             │
│                             │
│      [Skip]    [Next →]    │
└─────────────────────────────┘
```

**Page 3:**
```
┌─────────────────────────────┐
│                             │
│         ⚡                  │
│                             │
│    Ready in seconds        │
│                             │
│  No complicated setup.      │
│  Just sign up and start     │
│  talking to your AI.        │
│                             │
│        ◦ ◦ ○               │
│                             │
│                             │
│      [Get Started]          │
└─────────────────────────────┘
```

### Screen 3: Auth
```
┌─────────────────────────────┐
│                             │
│         🦞                  │
│      HeyClaw               │
│                             │
│  ┌───────────────────────┐  │
│  │ your@email.com        │  │
│  └───────────────────────┘  │
│                             │
│  [  Send Magic Link  ]      │
│                             │
│  ─────── or ───────        │
│                             │
│  [  Continue with Apple  ]  │
│  [  Continue with Google ]  │
│                             │
│                             │
│  By continuing, you agree   │
│  to our Terms & Privacy     │
│                             │
└─────────────────────────────┘
```

### Screen 4: Provisioning (shown once after signup)
```
┌─────────────────────────────┐
│                             │
│                             │
│         🦞                  │
│                             │
│   Setting up your agent... │
│                             │
│   ████████░░░░  67%        │
│                             │
│   ✓ Creating your space    │
│   ✓ Configuring AI         │
│   ◦ Final touches...       │
│                             │
│                             │
│   This only takes a moment │
│                             │
│                             │
└─────────────────────────────┘
```

### Screen 5: Home (Main Voice Screen)
```
┌─────────────────────────────┐
│ ≡                      ⚙️  │
│                             │
│                             │
│      ┌─────────────┐        │
│      │             │        │
│      │     🦞      │        │
│      │             │        │
│      │  HeyClaw    │        │
│      │             │        │
│      └─────────────┘        │
│                             │
│   "What can I help with?"   │
│                             │
│       ~~~~~~~~~~~~          │
│      ~  waveform  ~         │
│       ~~~~~~~~~~~~          │
│                             │
│       ┌───────────┐         │
│       │    🎤     │         │
│       │   HOLD    │         │
│       │  TO TALK  │         │
│       └───────────┘         │
│                             │
│ ─────────────────────────── │
│  💬 Chat    🎙️ Voice   ⚡   │
└─────────────────────────────┘
```

### Screen 6: Voice Active (while holding)
```
┌─────────────────────────────┐
│                             │
│                             │
│                             │
│      ┌─────────────┐        │
│      │             │        │
│      │     🎤      │        │
│      │             │        │
│      │ Listening...│        │
│      │             │        │
│      └─────────────┘        │
│                             │
│                             │
│       ~~~~~~~~~~~~          │
│      ~ RECORDING  ~         │
│       ~~~~~~~~~~~~          │
│                             │
│       ┌───────────┐         │
│       │    ⏹️     │         │
│       │  RELEASE  │         │
│       │  TO SEND  │         │
│       └───────────┘         │
│                             │
│                             │
└─────────────────────────────┘
```

### Screen 7: Processing
```
┌─────────────────────────────┐
│                             │
│                             │
│                             │
│      ┌─────────────┐        │
│      │             │        │
│      │     🤔      │        │
│      │             │        │
│      │  Thinking...│        │
│      │             │        │
│      └─────────────┘        │
│                             │
│                             │
│       ◦ ◦ ◦ ◦ ◦            │
│      (animated dots)        │
│                             │
│                             │
│                             │
│                             │
│                             │
│                             │
│                             │
└─────────────────────────────┘
```

### Screen 8: Response Playing
```
┌─────────────────────────────┐
│                             │
│                             │
│                             │
│      ┌─────────────┐        │
│      │             │        │
│      │     🔊      │        │
│      │             │        │
│      │  Speaking...│        │
│      │             │        │
│      └─────────────┘        │
│                             │
│   "Here's what I found..." │
│                             │
│       ~~~~~~~~~~~~          │
│      ~  playback  ~         │
│       ~~~~~~~~~~~~          │
│                             │
│       ┌───────────┐         │
│       │    ⏹️     │         │
│       │   STOP    │         │
│       └───────────┘         │
│                             │
│                             │
└─────────────────────────────┘
```

### Screen 9: Chat View
```
┌─────────────────────────────┐
│ ←  HeyClaw              ⚙️  │
├─────────────────────────────┤
│                             │
│  ┌─────────────────────┐    │
│  │ What's the weather  │ 🎤 │
│  │ today?              │    │
│  └─────────────────────┘    │
│                             │
│       ┌─────────────────┐   │
│    🦞 │ It's 28°C and   │   │
│       │ sunny in        │   │
│       │ Karachi! Perfect│   │
│       │ day to go out.  │   │
│       └─────────────────┘   │
│                             │
│  ┌─────────────────────┐    │
│  │ Remind me to call   │ 🎤 │
│  │ Mom at 5pm          │    │
│  └─────────────────────┘    │
│                             │
│       ┌─────────────────┐   │
│    🦞 │ Done! I'll      │   │
│       │ remind you at   │   │
│       │ 5:00 PM today.  │   │
│       └─────────────────┘   │
│                             │
├─────────────────────────────┤
│ ┌─────────────────────┐  🎤 │
│ │ Type a message...   │     │
│ └─────────────────────┘     │
└─────────────────────────────┘
```

### Screen 10: Settings
```
┌─────────────────────────────┐
│ ←  Settings                 │
├─────────────────────────────┤
│                             │
│  ACCOUNT                    │
│  ┌─────────────────────────┐│
│  │ 📧 master@email.com     ││
│  │ 📊 Plan: Free           ││
│  │    50 credits remaining ││
│  └─────────────────────────┘│
│                             │
│  [  Upgrade Plan  ]
│                             │
│  AGENT                      │
│  ┌─────────────────────────┐│
│  │ Name                    ││
│  │ HeyClaw           [>]   ││
│  ├─────────────────────────┤│
│  │ Personality             ││
│  │ Helpful assistant [>]   ││
│  └─────────────────────────┘│
│                             │
│  VOICE                      │
│  ┌─────────────────────────┐│
│  │ Voice                   ││
│  │ Samantha          [>]   ││
│  ├─────────────────────────┤│
│  │ Speed                   ││
│  │ [====●=====] 1.0x       ││
│  └─────────────────────────┘│
│                             │
│  ─────────────────────────  │
│                             │
│  [  Sign Out  ]             │
│                             │
└─────────────────────────────┘
```

### Screen 11: Upgrade Modal
```
┌─────────────────────────────┐
│         ✕                   │
│                             │
│    Choose Your Plan         │
│                             │
│  ┌─────────────────────────┐│
│  │  STARTER    $24.99/mo   ││
│  │  1,400 credits/month    ││
│  │  All models available   ││
│  │  [ Subscribe ]          ││
│  └─────────────────────────┘│
│                             │
│  ┌─────────────────────────┐│
│  │  PRO ⭐    $69.99/mo    ││
│  │  4,200 credits/month    ││
│  │  Best value for power   ││
│  │  [ Subscribe ]          ││
│  └─────────────────────────┘│
│                             │
│  ┌─────────────────────────┐│
│  │  ULTRA      $179.99/mo  ││
│  │  12,000 credits/month   ││
│  │  For heavy users        ││
│  │  [ Subscribe ]          ││
│  └─────────────────────────┘│
│                             │
│   Cancel anytime.           │
│                             │
└─────────────────────────────┘
```

---

## 📁 Project Structure

```
heyclaw/
│
├── apps/
│   │
│   ├── mobile/                    # React Native + Expo App
│   │   ├── app/                   # Expo Router screens
│   │   │   ├── (auth)/
│   │   │   │   ├── login.tsx
│   │   │   │   ├── verify.tsx
│   │   │   │   └── onboarding.tsx
│   │   │   ├── (main)/
│   │   │   │   ├── index.tsx      # Home/Voice screen
│   │   │   │   ├── chat.tsx
│   │   │   │   └── settings.tsx
│   │   │   ├── _layout.tsx
│   │   │   └── +not-found.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── VoiceButton.tsx
│   │   │   ├── Waveform.tsx
│   │   │   ├── ChatBubble.tsx
│   │   │   ├── AgentAvatar.tsx
│   │   │   └── ...
│   │   │
│   │   ├── lib/
│   │   │   ├── supabase.ts        # Supabase client
│   │   │   ├── api.ts             # Backend API client
│   │   │   ├── audio.ts           # Recording/playback hooks
│   │   │   └── store.ts           # Zustand store
│   │   │
│   │   ├── assets/
│   │   │   ├── images/
│   │   │   └── fonts/
│   │   │
│   │   ├── app.json
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tailwind.config.js
│   │
│   └── api/                       # Node.js Backend
│       ├── src/
│       │   ├── index.ts           # Entry point
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── user.ts
│       │   │   ├── voice.ts
│       │   │   ├── agent.ts
│       │   │   ├── chat.ts
│       │   │   └── billing.ts
│       │   │
│       │   ├── services/
│       │   │   ├── whisper.ts     # OpenAI Whisper
│       │   │   ├── tts.ts         # Text-to-speech
│       │   │   ├── flyMachines.ts # Fly.io Machines API
│       │   │   └── iap.ts         # Apple IAP verification
│       │   │
│       │   ├── lib/
│       │   │   ├── supabase.ts
│       │   │   └── auth.ts
│       │   │
│       │   └── middleware/
│       │       ├── auth.ts
│       │       └── rateLimit.ts
│       │
│       ├── Dockerfile
│       ├── fly.toml
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                    # Shared types
│       ├── types.ts
│       └── constants.ts
│
├── infrastructure/
│   ├── supabase/
│   │   └── migrations/
│   │       └── 001_initial.sql
│   │
│   └── fly/
│       ├── api.fly.toml
│       └── agent.Dockerfile
│
├── docs/
│   ├── PLAN.md                    # This file
│   └── API.md                     # API documentation
│
├── .github/
│   └── workflows/
│       ├── deploy-api.yml
│       └── build-mobile.yml
│
├── package.json                   # Monorepo root
├── turbo.json                     # Turborepo config
└── README.md
```

---

## 🚀 Development Sprint Plan

### Week 1: Foundation (Days 1-7)

| Day | Task | Deliverable |
|-----|------|-------------|
| 1 | Project setup | Expo app + API scaffolded |
| 2 | Supabase setup | Auth + DB working |
| 3 | Auth screens | Login/signup functional |
| 4 | Home screen UI | Voice button + layout |
| 5 | Audio recording | Record + save audio |
| 6 | Whisper integration | Audio → text working |
| 7 | Backend deploy | API live on Fly.io |

### Week 2: Agent + Voice (Days 8-14)

| Day | Task | Deliverable |
|-----|------|-------------|
| 8 | Fly Machines setup | Agent provisioning works |
| 9 | Agent routing | Messages reach user's agent |
| 10 | Response handling | Agent responses come back |
| 11 | TTS integration | Responses play as audio |
| 12 | Chat view | Text chat working |
| 13 | Settings screen | Basic settings done |
| 14 | Usage tracking | Limits enforced |

### Week 3: Polish + Launch (Days 15-21)

| Day | Task | Deliverable |
|-----|------|-------------|
| 15 | Bug fixes | Stable flow |
| 16 | UI polish | Looks good |
| 17 | TestFlight | Internal testing |
| 18 | Landing page | heyclaw.com live |
| 19 | App Store prep | Screenshots, description |
| 20 | Submit to App Store | Under review |
| 21 | Launch prep | ProductHunt, tweets ready |

---

## 📈 Go-to-Market Strategy

### Pre-Launch (During Build)
- [ ] Tweet progress daily with demos
- [ ] Build waitlist on heyclaw.com
- [ ] DM 20 OpenClaw power users from Twitter research
- [ ] Post in OpenClaw Discord

### Launch Week
- [ ] ProductHunt launch
- [ ] Twitter announcement thread
- [ ] OpenClaw Discord announcement
- [ ] Reach out to AI/tech YouTubers
- [ ] Offer lifetime deal for first 100 users ($99 = Pro forever)

### Post-Launch
- [ ] Collect feedback aggressively
- [ ] Ship fixes fast (same-day if possible)
- [ ] Weekly feature updates
- [ ] User testimonial videos
- [ ] Content: "How I replaced Siri with HeyClaw"

---

## 🎯 Success Metrics

### Month 1
| Metric | Target |
|--------|--------|
| App downloads | 500+ |
| Active users | 100+ |
| Paid subscribers | 25+ |
| MRR | $475+ |
| App Store rating | 4.0+ |

### Month 3
| Metric | Target |
|--------|--------|
| App downloads | 2,000+ |
| Active users | 400+ |
| Paid subscribers | 100+ |
| MRR | $1,900+ |
| Churn | <10% |

### Month 6
| Metric | Target |
|--------|--------|
| Active users | 1,000+ |
| Paid subscribers | 300+ |
| MRR | $5,700+ |
| Android launched | ✓ |

---

## ⚠️ Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Apple rejects app | Medium | High | Follow guidelines strictly, all payments via IAP |
| Fly.io costs spike | Medium | Medium | Aggressive auto-sleep, usage limits |
| Voice latency too high | Medium | High | Start simple, optimize iteratively |
| OpenClaw breaks/changes | Low | High | Abstract integration, stay close to community |
| Low conversion to paid | Medium | Medium | Tight free credits (50/mo), 3 plan tiers for different budgets |
| Competition copies | High | Low | Move fast, build community |

---

## 🔧 Prerequisites & Setup

### You Need:
- [ ] Mac with Xcode installed (for iOS builds)
- [ ] Apple Developer Account ($99/year)
- [ ] OpenAI API key (for Whisper + TTS)
- [ ] Fly.io account (free to start)
- [ ] Supabase account (free tier)
- [ ] App Store Connect configured for IAP products

### Development Environment:
```bash
# Install Node.js 20+
brew install node

# Install Expo CLI
npm install -g expo-cli

# Install Fly CLI
brew install flyctl

# Login to services
fly auth login
npx supabase login
```

---

## 🚀 Let's Build!

### Start Command:
```bash
# Create the project
npx create-expo-app@latest heyclaw --template blank-typescript
cd heyclaw

# Install dependencies
npx expo install expo-av expo-router expo-secure-store
npm install @supabase/supabase-js zustand axios nativewind
npm install -D tailwindcss

# Start developing
npx expo start
```

---

## 📝 Notes

- Start iOS only, Android can wait for v2
- Use iOS native TTS for free tier (sounds okay, zero cost)
- Sleep agent machines after 5 min idle to save $$
- All payments via Apple IAP (StoreKit 2) — no external payment processors
- Credit system: Free (50), Starter (1,400), Pro (4,200), Ultra (12,000)
- Model tiers: Standard (10 cr), Power (30 cr), Best (100 cr)
- Free tier gives ~5 standard messages to hook users, then paywall
- Keep SOUL.md simple for v1, let users customize later

---

**Let's ship this thing! 🎙️🦞**
