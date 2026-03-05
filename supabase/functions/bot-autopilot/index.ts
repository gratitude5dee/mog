import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logOpsEvent } from "../_shared/ops-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BotAction = "view" | "like" | "bookmark" | "comment";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function toIsoMinutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const emit = async (
    level: "info" | "warn" | "error",
    eventName: string,
    outcome: string,
    metadata: Record<string, unknown> = {},
  ) =>
    await logOpsEvent(supabase, {
      component: "bot-autopilot",
      event_name: eventName,
      level,
      outcome,
      metadata: {
        latency_ms: Date.now() - startedAt,
        ...metadata,
      },
    });

  const enabled = (Deno.env.get("BOT_AUTOPILOT_ENABLED") || "false").toLowerCase() === "true";
  if (!enabled) {
    await emit("info", "bot_autopilot_disabled", "skipped");
    return jsonResponse({ success: false, error: "bot_autopilot_disabled" }, 403);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    await emit("warn", "bot_autopilot_unauthorized", "error");
    return jsonResponse({ success: false, error: "unauthorized" }, 401);
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const maxJobs = Math.max(1, Math.min(Number(payload?.max_jobs || 5), 20));
    const nowIso = new Date().toISOString();

    const { data: jobs, error: jobError } = await supabase
      .from("bot_job_configs")
      .select("*")
      .eq("is_enabled", true)
      .lte("next_run_at", nowIso)
      .order("next_run_at", { ascending: true })
      .limit(maxJobs);

    if (jobError) {
      await emit("error", "bot_autopilot_jobs_query_failed", "error", {
        error: jobError.message,
      });
      return jsonResponse({ success: false, error: "jobs_query_failed" }, 500);
    }

    if (!jobs || jobs.length === 0) {
      await emit("info", "bot_autopilot_no_due_jobs", "skipped");
      return jsonResponse({ success: true, ran: 0, message: "no_due_jobs" });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const job of jobs) {
      const { data: runRow } = await supabase
        .from("bot_job_runs")
        .insert({
          job_id: job.id,
          status: "running",
          actions_attempted: 0,
          actions_succeeded: 0,
        })
        .select("id")
        .single();

      const runId = runRow?.id;

      try {
        const { data: agent, error: agentError } = await supabase
          .from("mog_agent_profiles")
          .select("id, name, wallet_address, is_active")
          .eq("id", job.agent_profile_id)
          .maybeSingle();

        if (agentError || !agent || !agent.is_active) {
          await supabase
            .from("bot_job_runs")
            .update({
              status: "skipped",
              completed_at: new Date().toISOString(),
              result: { reason: "agent_not_available" },
            })
            .eq("id", runId);

          await supabase
            .from("bot_job_configs")
            .update({
              last_error: "agent_not_available",
              next_run_at: toIsoMinutesFromNow(Number(job.cadence_minutes || 30)),
            })
            .eq("id", job.id);

          await emit("warn", "bot_autopilot_job_skipped", "skipped", {
            job_id: job.id,
            reason: "agent_not_available",
          });
          results.push({ job_id: job.id, status: "skipped", reason: "agent_not_available" });
          continue;
        }

        const actorWallet = String(agent.wallet_address || "").toLowerCase();
        const cadenceMinutes = Number(job.cadence_minutes || 30);
        const maxActionsRequested = Number(job.max_actions_per_run || 3);
        const liveMode = !job.dry_run;

        if (liveMode && job.no_self_engagement !== true) {
          await supabase
            .from("bot_job_runs")
            .update({
              status: "skipped",
              completed_at: new Date().toISOString(),
              result: { reason: "unsafe_no_self_engagement_required" },
            })
            .eq("id", runId);

          await supabase
            .from("bot_job_configs")
            .update({
              last_error: "unsafe_no_self_engagement_required",
              next_run_at: toIsoMinutesFromNow(Math.max(cadenceMinutes, 30)),
            })
            .eq("id", job.id);

          await emit("warn", "bot_autopilot_job_skipped", "skipped", {
            job_id: job.id,
            reason: "unsafe_no_self_engagement_required",
            dry_run: job.dry_run,
          });
          results.push({ job_id: job.id, status: "skipped", reason: "unsafe_no_self_engagement_required" });
          continue;
        }

        if (liveMode && maxActionsRequested > 3) {
          await supabase
            .from("bot_job_runs")
            .update({
              status: "skipped",
              completed_at: new Date().toISOString(),
              result: { reason: "unsafe_max_actions_exceeded" },
            })
            .eq("id", runId);

          await supabase
            .from("bot_job_configs")
            .update({
              last_error: "unsafe_max_actions_exceeded",
              next_run_at: toIsoMinutesFromNow(Math.max(cadenceMinutes, 30)),
            })
            .eq("id", job.id);

          await emit("warn", "bot_autopilot_job_skipped", "skipped", {
            job_id: job.id,
            reason: "unsafe_max_actions_exceeded",
            requested_max_actions: maxActionsRequested,
            dry_run: job.dry_run,
          });
          results.push({ job_id: job.id, status: "skipped", reason: "unsafe_max_actions_exceeded" });
          continue;
        }

        if (liveMode && cadenceMinutes < 30) {
          await supabase
            .from("bot_job_runs")
            .update({
              status: "skipped",
              completed_at: new Date().toISOString(),
              result: { reason: "unsafe_cadence_too_low" },
            })
            .eq("id", runId);

          await supabase
            .from("bot_job_configs")
            .update({
              last_error: "unsafe_cadence_too_low",
              next_run_at: toIsoMinutesFromNow(30),
            })
            .eq("id", job.id);

          await emit("warn", "bot_autopilot_job_skipped", "skipped", {
            job_id: job.id,
            reason: "unsafe_cadence_too_low",
            cadence_minutes: cadenceMinutes,
            dry_run: job.dry_run,
          });
          results.push({ job_id: job.id, status: "skipped", reason: "unsafe_cadence_too_low" });
          continue;
        }

        const actionPool: BotAction[] = [];
        if (job.allow_view) actionPool.push("view");
        if (job.allow_like) actionPool.push("like");
        if (job.allow_bookmark) actionPool.push("bookmark");
        if (job.allow_comment) actionPool.push("comment");

        if (actionPool.length === 0) {
          await supabase
            .from("bot_job_runs")
            .update({
              status: "skipped",
              completed_at: new Date().toISOString(),
              result: { reason: "no_actions_enabled" },
            })
            .eq("id", runId);

          await supabase
            .from("bot_job_configs")
            .update({
              last_error: "no_actions_enabled",
              next_run_at: toIsoMinutesFromNow(Number(job.cadence_minutes || 30)),
            })
            .eq("id", job.id);

          await emit("warn", "bot_autopilot_job_skipped", "skipped", {
            job_id: job.id,
            reason: "no_actions_enabled",
          });
          results.push({ job_id: job.id, status: "skipped", reason: "no_actions_enabled" });
          continue;
        }

        const postQuery = supabase
          .from("mog_posts")
          .select("id, creator_wallet")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(25);

        const { data: candidatePosts } = job.no_self_engagement
          ? await postQuery.neq("creator_wallet", actorWallet)
          : await postQuery;

        const posts = candidatePosts || [];
        if (posts.length === 0) {
          await supabase
            .from("bot_job_runs")
            .update({
              status: "skipped",
              completed_at: new Date().toISOString(),
              result: { reason: "no_candidate_posts" },
            })
            .eq("id", runId);

          await supabase
            .from("bot_job_configs")
            .update({
              last_error: "no_candidate_posts",
              next_run_at: toIsoMinutesFromNow(Number(job.cadence_minutes || 30)),
            })
            .eq("id", job.id);

          await emit("warn", "bot_autopilot_job_skipped", "skipped", {
            job_id: job.id,
            reason: "no_candidate_posts",
          });
          results.push({ job_id: job.id, status: "skipped", reason: "no_candidate_posts" });
          continue;
        }

        const maxActionsCap = liveMode ? 3 : 20;
        const maxActions = Math.max(1, Math.min(maxActionsRequested, maxActionsCap));
        let attempted = 0;
        let succeeded = 0;
        const actionLog: Array<Record<string, unknown>> = [];
        const usedPostIds = new Set<string>();

        for (let i = 0; i < maxActions; i++) {
          const availablePosts = posts.filter((p) => !usedPostIds.has(p.id as string));
          if (availablePosts.length === 0) break;
          const post = pickRandom(availablePosts);
          const postId = String(post.id);
          const action = pickRandom(actionPool);
          usedPostIds.add(postId);
          attempted += 1;

          if (job.dry_run) {
            succeeded += 1;
            actionLog.push({ action, post_id: postId, dry_run: true });
            continue;
          }

          try {
            if (action === "like") {
              const { error } = await supabase.from("agent_mog_likes").insert({
                post_id: postId,
                agent_id: agent.id,
                agent_name: agent.name,
                agent_wallet: actorWallet,
              });
              if (error && error.code !== "23505") throw error;
              if (!error) {
                await supabase.rpc("adjust_mog_post_metric", { p_post_id: postId, p_metric: "likes_count", p_delta: 1 });
              }
            } else if (action === "bookmark") {
              const { error } = await supabase.from("agent_mog_bookmarks").insert({
                post_id: postId,
                agent_id: agent.id,
                agent_name: agent.name,
                agent_wallet: actorWallet,
              });
              if (error && error.code !== "23505") throw error;
            } else if (action === "comment") {
              const templates = Array.isArray(job.comment_templates) ? (job.comment_templates as string[]) : [];
              const commentText = (templates.length > 0 ? pickRandom(templates) : "Great post from autopilot 🦞").slice(0, 280);
              const { error } = await supabase.from("agent_mog_comments").insert({
                post_id: postId,
                content: commentText,
                agent_id: agent.id,
                agent_name: agent.name,
                agent_wallet: actorWallet,
              });
              if (error) throw error;
              await supabase.rpc("adjust_mog_post_metric", {
                p_post_id: postId,
                p_metric: "comments_count",
                p_delta: 1,
              });
            } else {
              await supabase.rpc("adjust_mog_post_metric", {
                p_post_id: postId,
                p_metric: "views_count",
                p_delta: 1,
              });
            }

            const payoutRes = await fetch(`${supabaseUrl}/functions/v1/engagement-pay`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                content_type: "mog_post",
                content_id: postId,
                action_type: action,
                payer_wallet: actorWallet,
              }),
            });

            const payoutBody = await payoutRes.json().catch(() => null);
            succeeded += 1;
            actionLog.push({
              action,
              post_id: postId,
              payout_success: Boolean(payoutBody?.success),
              payout_skipped: Boolean(payoutBody?.skipped),
            });
          } catch (actionError) {
            actionLog.push({
              action,
              post_id: postId,
              error: actionError instanceof Error ? actionError.message : "action_failed",
            });
          }
        }

        await supabase
          .from("bot_job_runs")
          .update({
            completed_at: new Date().toISOString(),
            status: "success",
            actions_attempted: attempted,
            actions_succeeded: succeeded,
            result: { actions: actionLog },
          })
          .eq("id", runId);

        await supabase
          .from("bot_job_configs")
          .update({
            last_run_at: new Date().toISOString(),
            last_error: null,
            next_run_at: toIsoMinutesFromNow(Number(job.cadence_minutes || 30)),
          })
          .eq("id", job.id);

        await emit("info", "bot_autopilot_job_completed", "success", {
          job_id: job.id,
          attempted,
          succeeded,
          dry_run: job.dry_run,
          max_actions: maxActions,
        });
        results.push({
          job_id: job.id,
          status: "success",
          attempted,
          succeeded,
        });
      } catch (jobError) {
        const errorMessage = jobError instanceof Error ? jobError.message : "job_failed";
        await supabase
          .from("bot_job_runs")
          .update({
            completed_at: new Date().toISOString(),
            status: "failed",
            result: { error: errorMessage },
          })
          .eq("id", runId);

        await supabase
          .from("bot_job_configs")
          .update({
            last_error: errorMessage,
            next_run_at: toIsoMinutesFromNow(Number(job.cadence_minutes || 30)),
          })
          .eq("id", job.id);

        await emit("error", "bot_autopilot_job_failed", "error", {
          job_id: job.id,
          error: errorMessage,
        });
        results.push({ job_id: job.id, status: "failed", error: errorMessage });
      }
    }

    await emit("info", "bot_autopilot_run_completed", "success", {
      jobs_ran: results.length,
      failed_jobs: results.filter((result) => result.status === "failed").length,
    });
    return jsonResponse({
      success: true,
      ran: results.length,
      results,
    });
  } catch (error) {
    console.error("[bot-autopilot] unexpected_error", error);
    await emit("error", "bot_autopilot_run_failed", "error", {
      error: error instanceof Error ? error.message : "internal_server_error",
    });
    return jsonResponse({ success: false, error: "internal_server_error" }, 500);
  }
});
