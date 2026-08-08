import '@auth/core/types';

import type { UserProfile } from '../schemas/user.schema.ts';

declare module '@auth/core/types' {
  interface Session {
    user: UserProfile & DefaultSession['user'];
  }
  interface User extends DefaultUser, Partial<UserProfile> {}
}

declare module '@auth/core/jwt' {
  interface JWT extends DefaultJWT, Partial<UserProfile> {}
}
