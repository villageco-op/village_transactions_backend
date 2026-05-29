import type { JWT } from '@auth/core/jwt';
import type { Session, User } from '@auth/core/types';

import type { User as DBUser } from '../../db/types.js';
import { userRepository } from '../../repositories/index.js';

interface JWTParams {
  token: JWT;
  user?: User;
}

interface SessionParams {
  session: Session;
  token: JWT;
}

/**
 * Computes whether a user profile contains all mandatory onboarding parameters.
 * @param user - The user object
 * @returns True if essential fields are complete
 */
function checkOnboarding(user: DBUser) {
  if (!user) return false;
  return Boolean(user.name && user.address && user.city && user.state && user.country && user.zip);
}

/**
 * Persists user information into the JWT token.
 * @param params - The callback parameters
 * @param params.token - The current JWT token
 * @param params.user - The user object (only available on initial sign in)
 * @returns The updated token
 */
export async function jwtCallback({ token, user }: JWTParams) {
  if (user?.id) {
    token.id = user.id;
  }

  if (token?.id) {
    try {
      const dbUser = await userRepository.findById(token.id);

      if (dbUser) {
        Object.assign(token, {
          ...token,
          name: dbUser.name,
          email: dbUser.email,
          picture: dbUser.image,
          organization: dbUser.organization,
          aboutMe: dbUser.aboutMe,
          specialties: dbUser.specialties,
          goal: dbUser.goal,
          address: dbUser.address,
          city: dbUser.city,
          state: dbUser.state,
          country: dbUser.country,
          zip: dbUser.zip,
          lat: dbUser.lat,
          lng: dbUser.lng,
          deliveryRangeMiles: dbUser.deliveryRangeMiles,
          stripeOnboardingComplete: dbUser.stripeOnboardingComplete,
          isOnboardingComplete: checkOnboarding(dbUser),
        });
      }
    } catch (error) {
      console.error(`[Auth Callbacks] Error hydrating user token for ID ${token.id}:`, error);
    }
  }

  return token;
}

/**
 * Links the JWT token data to the session object.
 * @param params - The callback parameters
 * @param params.session - The current session object
 * @param params.token - The current JWT token
 * @returns The updated session object
 */
export function sessionCallback({ session, token }: SessionParams) {
  if (session.user && token && token.id) {
    session.user.id = token.id;
    session.user.name = token.name || null;
    session.user.email = token.email || null;
    session.user.image = token.picture || null;
    session.user.organization = token.organization || null;
    session.user.aboutMe = token.aboutMe || null;
    session.user.specialties = token.specialties || null;
    session.user.goal = token.goal || null;

    session.user.address = token.address || null;
    session.user.city = token.city || null;
    session.user.state = token.state || null;
    session.user.country = token.country || null;
    session.user.zip = token.zip || null;
    session.user.lat = token.lat || null;
    session.user.lng = token.lng || null;
    session.user.deliveryRangeMiles = token.deliveryRangeMiles || null;
    session.user.stripeOnboardingComplete = token.stripeOnboardingComplete ?? false;

    session.user.isOnboardingComplete = token.isOnboardingComplete ?? false;
  }

  return session;
}
