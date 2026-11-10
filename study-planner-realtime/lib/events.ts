import { getSupabaseAdmin } from "./supabase";
import { mapNotionPage, queryAll, saveNotionEvent } from "./notion";
import { rescheduleConflicts } from "./scheduler";
import type { EventInput, EventSource, PlannerEvent } from "./types";

export function toRow(e: any) {
  return {
    page_id: e.id,
    source: e.source,
    title: e.title,
    start_at: e.start,
    end_at: e.end,
    all_day: e.allDay,
    notes: e.notes,
    tags: e.tags,
    category: e.category,
    course: e.course,
    weighting: e.weighting,
    is_completed: e.completed,
    is_fixed: e.isFixed,
    reminder_minutes: e.reminderMinutes,
    url: e.url,
    last_edited_time: e.lastEditedTime,
    is_deleted: false,
    updated_at: new Date().toISOString(),
  };
}

export function fromRow(r: any): PlannerEvent {
  return {
    id: r.page_id,
    source: r.source,
    title: r.title,
    start: r.start_at,
    end: r.end_at,
    allDay: r.all_day,
    notes: r.notes || "",
    tags: r.tags || [],
    category: r.category || "",
    course: r.course || "",
    weighting: r.weighting || "",
    completed: r.is_completed,
    isFixed: r.is_fixed,
    reminderMinutes: r.reminder_minutes,
    url: r.url || "",
    lastEditedTime: r.last_edited_time,
  };
}

export async function upsertEvent(event: PlannerEvent) {
  const db = getSupabaseAdmin();
  const { error } = await db.from("planner_events").upsert(toRow(event), { onConflict: "page_id" });
  if (error) throw new Error(`Gagal menyimpan cache agenda: ${error.message}`);
}

function stamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Reconcile conflicting flexible events around one event that changed in Notion.
 * Fixed and completed events are never moved. Updates are written back to Notion
 * before being published to the live Supabase cache.
 */
async function rescheduleIncomingEvent(incoming: PlannerEvent) {
  if (!incoming.start || !incoming.end) return { movedIds: [] as string[], blocked: [] as string[] };

  const db = getSupabaseAdmin();
  const { data: rows, error } = await db.from("planner_events").select("*").eq("is_deleted", false);
  if (error) throw error;

  const existing = (rows || []).map(fromRow);
  const plan = rescheduleConflicts(existing, incoming);
  const movedIds: string[] = [];
  const failed: string[] = [];

  for (const moved of plan.moved) {
    try {
      const updated = await saveNotionEvent(moved as unknown as EventInput);
      await upsertEvent({ ...moved, lastEditedTime: updated.last_edited_time });
      movedIds.push(moved.id);
    } catch {
      failed.push(moved.title);
    }
  }

  return { movedIds, blocked: [...plan.blocked, ...failed] };
}

export async function syncAllFromNotion() {
  const db = getSupabaseAdmin();
  const [calendar, tasks] = await Promise.all([queryAll("calendar"), queryAll("tasks")]);
  const prior = await db
    .from("planner_events")
    .select("page_id,is_fixed,reminder_minutes,start_at,end_at")
    .eq("is_deleted", false);
  if (prior.error) throw new Error(prior.error.message);

  const meta = new Map((prior.data || []).map((row: any) => [row.page_id, row]));
  const mapped = [
    ...calendar.map((page) => mapNotionPage(page, "calendar", meta.get(page.id))),
    ...tasks.map((page) => mapNotionPage(page, "tasks", meta.get(page.id))),
  ];

  // On the very first import, keep the user's existing Notion schedule intact.
  // After initialization, date/time changes and newly created pages can trigger
  // auto-rescheduling. Title/note/status edits do not move other events.
  const initialized = (prior.data || []).length > 0;
  const changed = mapped
    .filter((event) => {
      const previous: any = meta.get(event.id);
      if (!previous) return initialized && Boolean(event.start && event.end);
      return stamp(previous.start_at) !== stamp(event.start) || stamp(previous.end_at) !== stamp(event.end);
    })
    .sort((a, b) => Number(b.isFixed) - Number(a.isFixed) || (a.start || "").localeCompare(b.start || ""));

  const rowsToSave = mapped.map(toRow);
  for (let i = 0; i < rowsToSave.length; i += 100) {
    const { error } = await db.from("planner_events").upsert(rowsToSave.slice(i, i + 100), { onConflict: "page_id" });
    if (error) throw new Error(error.message);
  }

  const liveIds = mapped.map((event) => event.id);
  const stale = (prior.data || []).map((row: any) => row.page_id).filter((id: string) => !liveIds.includes(id));
  if (stale.length) {
    const { error } = await db.from("planner_events").update({ is_deleted: true, updated_at: new Date().toISOString() }).in("page_id", stale);
    if (error) throw new Error(error.message);
  }

  const alreadyMoved = new Set<string>();
  const blocked: string[] = [];
  let movedCount = 0;
  for (const candidate of changed) {
    if (alreadyMoved.has(candidate.id)) continue;
    // Refresh after each pass in case an earlier incoming event moved this one.
    const { data: current, error } = await db.from("planner_events").select("*").eq("page_id", candidate.id).maybeSingle();
    if (error) throw error;
    if (!current || current.is_deleted) continue;
    const currentEvent = fromRow(current);
    if (stamp(currentEvent.start) !== stamp(candidate.start) || stamp(currentEvent.end) !== stamp(candidate.end)) {
      // It was already rescheduled by an earlier changed event.
      alreadyMoved.add(candidate.id);
      continue;
    }
    const result = await rescheduleIncomingEvent(currentEvent);
    result.movedIds.forEach((id) => alreadyMoved.add(id));
    blocked.push(...result.blocked);
    movedCount += result.movedIds.length;
  }

  return { count: mapped.length, calendar: calendar.length, tasks: tasks.length, moved: movedCount, blocked };
}

export async function syncOnePage(page: any) {
  const parent = page.parent || {};
  const dataSource = parent.data_source_id || parent.database_id;
  const db = getSupabaseAdmin();
  const prior = await db
    .from("planner_events")
    .select("source,is_fixed,reminder_minutes,start_at,end_at")
    .eq("page_id", page.id)
    .maybeSingle();

  const source: EventSource =
    dataSource === process.env.NOTION_CALENDAR_DATA_SOURCE_ID
      ? "calendar"
      : dataSource === process.env.NOTION_TASKS_DATA_SOURCE_ID
        ? "tasks"
        : prior.data?.source || "tasks";

  const incoming = mapNotionPage(page, source, prior.data);
  const scheduleChanged = !prior.data
    ? Boolean(incoming.start && incoming.end)
    : stamp(prior.data.start_at) !== stamp(incoming.start) || stamp(prior.data.end_at) !== stamp(incoming.end);

  await upsertEvent(incoming);
  if (scheduleChanged) return rescheduleIncomingEvent(incoming);
  return { movedIds: [] as string[], blocked: [] as string[] };
}
