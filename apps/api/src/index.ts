import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {logger} from 'hono/logger';
import {serve} from '@hono/node-server';
import {authRoutes} from './routes/auth.js';
import {userRoutes} from './routes/user.js';
import {voiceRoutes} from './routes/voice.js';
import {agentRoutes} from './routes/agent.js';
import {chatRoutes} from './routes/chat.js';
import {billingRoutes} from './routes/billing.js';
import {automationRoutes} from './routes/automation.js';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check
app.get('/', c => c.json({status: 'ok', service: 'heyclaw-api'}));

// Routes
app.route('/auth', authRoutes);
app.route('/user', userRoutes);
app.route('/voice', voiceRoutes);
app.route('/agent', agentRoutes);
app.route('/chat', chatRoutes);
app.route('/billing', billingRoutes);
app.route('/automation', automationRoutes);

const port = Number(process.env.PORT) || 3000;
console.log(`HeyClaw API running on port ${port}`);

serve({fetch: app.fetch, port});

export default app;
