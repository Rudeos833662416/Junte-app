// Acción Android nativa: se ejecuta con la app terminada.
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "",
);

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hashAsUuid(hex: string) {
  const value = hex.slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

async function releaseActionToken(id: string, leaseId: string) {
  const { error } = await supabase
    .from("notification_action_tokens")
    .update({ processing_at: null, lease_id: null })
    .eq("id", id)
    .eq("lease_id", leaseId)
    .is("used_at", null);
  if (error) console.warn("Could not release notification action token:", error.message);
}

async function completeActionToken(id: string, leaseId: string) {
  const { error } = await supabase
    .from("notification_action_tokens")
    .update({ used_at: new Date().toISOString(), processing_at: null, lease_id: null })
    .eq("id", id)
    .eq("lease_id", leaseId)
    .is("used_at", null);
  if (error) console.warn("Could not finalize notification action token:", error.message);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let claimedTokenId: string | null = null;
  let claimedLeaseId: string | null = null;
  try {
    const payload = await request.json();
    const actionToken = String(payload.actionToken ?? "");
    const action = String(payload.action ?? "");
    const body = String(payload.body ?? "").trim();
    const clientMessageId = String(payload.clientMessageId ?? "").trim();
    const allowed = ["reply", "mark_read", "friend_accept", "friend_reject", "brindar_reply"];
    if (!actionToken || !allowed.includes(action)) {
      return Response.json({ error: "invalid_action" }, { status: 400 });
    }

    const expectedActionType =
      action === "friend_accept" || action === "friend_reject"
        ? "FRIEND_REQUEST"
        : action === "brindar_reply"
          ? "BRINDAR_ACTIVITY"
          : "CHAT_MESSAGE_V2";

    const actionTokenHash = await hash(actionToken);
    const { data: token, error: tokenError } = await supabase
      .rpc("claim_notification_action_token", {
        p_token_hash: actionTokenHash,
        p_action_type: expectedActionType,
        p_lease_seconds: 120,
      })
      .maybeSingle();

    if (tokenError || !token || !token.lease_id) {
      return Response.json({ error: "invalid_or_expired_or_used_token" }, { status: 409 });
    }
    claimedTokenId = token.id;
    claimedLeaseId = token.lease_id;

    if (action === "friend_accept" || action === "friend_reject") {
      if (!token.friendship_id_bigint) {
        await releaseActionToken(claimedTokenId, claimedLeaseId);
        return Response.json({ error: "missing_friendship" }, { status: 400 });
      }
      const status = action === "friend_accept" ? "accepted" : "blocked";
      const { error } = await supabase
        .from("friendships")
        .update({ status })
        .eq("id", token.friendship_id_bigint)
        .eq("friend_id", token.user_id)
        .eq("status", "pending");
      if (error) {
        await releaseActionToken(claimedTokenId, claimedLeaseId);
        return Response.json({ error: error.message }, { status: 400 });
      }
      await completeActionToken(claimedTokenId, claimedLeaseId);
      return Response.json({ ok: true, action });
    }

    if (action === "reply" || action === "brindar_reply") {
      if (!body || body.length > 2000) {
        await releaseActionToken(claimedTokenId, claimedLeaseId);
        return Response.json({ error: "invalid_reply" }, { status: 400 });
      }
      const recipientId = token.sender_id;
      if (!recipientId || recipientId === token.user_id) {
        await releaseActionToken(claimedTokenId, claimedLeaseId);
        return Response.json({ error: "missing_sender" }, { status: 400 });
      }
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: token.user_id,
        recipient_id: recipientId,
        body,
        client_message_id: clientMessageId || hashAsUuid(await hash(`${actionTokenHash}:${body}`)),
      });
      if (error && error.code !== "23505") {
        await releaseActionToken(claimedTokenId, claimedLeaseId);
        return Response.json({ error: error.message }, { status: 400 });
      }
      // reply de chat: libera lease para permitir más respuestas en el mismo hilo
      if (action === "reply") {
        await releaseActionToken(claimedTokenId, claimedLeaseId);
      } else {
        await completeActionToken(claimedTokenId, claimedLeaseId);
      }
      return Response.json({ ok: true, action, deduplicated: error?.code === "23505" });
    }

    if (action === "mark_read") {
      const { error } = await supabase
        .from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", token.activity_id)
        .eq("recipient_id", token.user_id);
      if (error) {
        await releaseActionToken(claimedTokenId, claimedLeaseId);
        return Response.json({ error: error.message }, { status: 400 });
      }
      await completeActionToken(claimedTokenId, claimedLeaseId);
      return Response.json({ ok: true, action });
    }

    await releaseActionToken(claimedTokenId, claimedLeaseId);
    return Response.json({ error: "unsupported_action" }, { status: 400 });
  } catch (error) {
    if (claimedTokenId && claimedLeaseId) await releaseActionToken(claimedTokenId, claimedLeaseId);
    return Response.json({ error: error?.message ?? "action_failed" }, { status: 500 });
  }
});
