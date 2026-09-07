import {
  authenticateSessionConnection,
  type SessionServerEnv,
} from "./session/auth";
import { SessionActor } from "./session/AmmunitionSessionActor";

export { SessionActor };

const SESSION_CONNECT_ROUTE = /^\/session\/([^/]+)\/connect\/?$/;
const SESSION_PROTOCOL_VERSION = 7;
const SESSION_PROTOCOL_CAPABILITIES = [
  "character.damageAffinities.set",
  "character.bootstrap.guard",
  "character.legacy.reconcile",
  "character.readAny",
  "character.writeAny",
  "party.supply.authoritative",
  "character.session.purge",
  "session.member.kick",
  "creature.loot.drop",
  "character.ammunition.spend",
] as const;

export default {
  async fetch(request: Request, env: SessionServerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "session-server",
        protocolVersion: SESSION_PROTOCOL_VERSION,
        capabilities: SESSION_PROTOCOL_CAPABILITIES,
        serverTime: Date.now(),
      });
    }

    const routeMatch = SESSION_CONNECT_ROUTE.exec(url.pathname);
    if (!routeMatch || request.method !== "GET") {
      return new Response("Not found.", { status: 404 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade.", { status: 426 });
    }

    const sessionId = decodeURIComponent(routeMatch[1]).trim();
    if (!sessionId) {
      return new Response("Missing sessionId.", { status: 400 });
    }

    const authResult = await authenticateSessionConnection(request, sessionId, env);
    if (!authResult.ok) {
      return new Response(authResult.message, { status: authResult.status });
    }

    const { claims } = authResult;
    const durableObjectId = env.SESSION_ACTOR.idFromName(sessionId);
    const actor = env.SESSION_ACTOR.get(durableObjectId);

    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set("x-session-id", claims.sessionId);
    forwardedHeaders.set("x-session-client-id", claims.clientId);
    forwardedHeaders.set("x-session-user-id", claims.userId);
    if (claims.userName) forwardedHeaders.set("x-session-user-name", claims.userName);
    else forwardedHeaders.delete("x-session-user-name");
    forwardedHeaders.set("x-session-role", claims.role);
    forwardedHeaders.set("x-session-expires-at", String(claims.expiresAt));

    // Capability headers are internal authentication metadata. Never preserve
    // caller-supplied values when the signed token does not grant them.
    forwardedHeaders.delete("x-session-can-read-any-character");
    forwardedHeaders.delete("x-session-can-write-any-character");
    if (claims.canReadAnyCharacter) {
      forwardedHeaders.set("x-session-can-read-any-character", "1");
    }
    if (claims.canWriteAnyCharacter) {
      forwardedHeaders.set("x-session-can-write-any-character", "1");
    }

    return actor.fetch(
      new Request("https://session-actor.internal/connect", {
        method: "GET",
        headers: forwardedHeaders,
      }),
    );
  },
};
