// Valida el access token de Auth0 (JWT RS256) que manda el frontend en "Authorization: Bearer …".
import { createRemoteJWKSet, jwtVerify } from "jose";

const DOMAIN = process.env.AUTH0_DOMAIN ?? "dev-qultyktmef157l4q.us.auth0.com";
const AUDIENCE = process.env.AUTH0_AUDIENCE ?? "https://api.stormcheck";
const ISSUER = `https://${DOMAIN}/`;

const jwks = createRemoteJWKSet(new URL(`${ISSUER}.well-known/jwks.json`));

/** Devuelve el id del usuario (claim `sub`) o null si no hay token o no es válido. */
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
