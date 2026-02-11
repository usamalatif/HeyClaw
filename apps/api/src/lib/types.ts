import type {Hono} from 'hono';

export type AppEnv = {
  Variables: {
    userId: string;
    userEmail: string;
  };
};

export type AppType = Hono<AppEnv>;
