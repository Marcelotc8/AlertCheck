// Validates the Auth0 access token (RS256 JWT) the frontend sends in "Authorization: Bearer …".
import { createRemoteJWKSet, jwtVerify } from "jose";

const DOMAIN = process.env.AUTH0_DOMAIN ?? "dev-qultyktmef157l4q.us.auth0.com";
const AUDIENCE = process.env.AUTH0_AUDIENCE ?? "https://api.stormcheck";
const ISSUER = `https://${DOMAIN}/`;

const jwks = createRemoteJWKSet(new URL(`${ISSUER}.well-known/jwks.json`));

/** Returns the user id (`sub` claim), or null if there is no token or it is invalid. */
export async function userFromAuthHeader(header: string | undefined): Promise<string | null> {
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: AUDIENCE });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch (e) {
    console.warn("auth:", (e as Error).message);
    return null;
  }
}
