type OpsLogLevel = "debug" | "info" | "warn" | "error";

type OpsLogEvent = {
  component: string;
  event_name: string;
  level?: OpsLogLevel;
  mode_used?: string | null;
  restore_source?: string | null;
  outcome?: string | null;
  metadata?: Record<string, unknown>;
};

type SupabaseLikeClient = {
  from: (table: string) => {
    insert: (values: unknown) => Promise<{ error?: { message?: string } | null }>;
  };
};

export async function logOpsEvent(supabase: SupabaseLikeClient, event: OpsLogEvent): Promise<void> {
  try {
    const payload = {
      component: event.component,
      event_name: event.event_name,
      level: event.level || "info",
      mode_used: event.mode_used || null,
      restore_source: event.restore_source || null,
      outcome: event.outcome || null,
      metadata: event.metadata || {},
    };

    const { error } = await supabase.from("ops_event_logs").insert(payload);
    if (error) {
      console.warn("[ops-log] insert_failed", error.message || error);
    }
  } catch (error) {
    console.warn("[ops-log] unexpected_error", error);
  }
}
