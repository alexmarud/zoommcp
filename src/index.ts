import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";
import { getAccessToken, zoomApi } from "./zoom-api.js";

const server = new McpServer({
  name: "zoom-mcp-server",
  version: "2.0.0",
});

// =====================
//  MEETINGS
// =====================

server.tool(
  "create_meeting",
  "Create a new Zoom meeting",
  {
    topic: z.string().describe("Meeting topic / title"),
    start_time: z.string().describe("Start time in ISO 8601, e.g. 2026-03-15T10:00:00Z"),
    duration: z.number().describe("Duration in minutes"),
    agenda: z.string().optional().describe("Meeting agenda / description"),
    password: z.string().optional().describe("Meeting password"),
    waiting_room: z.boolean().optional().describe("Enable waiting room (default false)"),
  },
  async ({ topic, start_time, duration, agenda, password, waiting_room }) => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).post("/users/me/meetings", {
      topic,
      type: 2,
      start_time,
      duration,
      agenda,
      password,
      settings: {
        join_before_host: true,
        waiting_room: waiting_room ?? false,
        auto_recording: "cloud",
      },
    });
    return text({
      id: data.id,
      topic: data.topic,
      start_time: data.start_time,
      duration: data.duration,
      join_url: data.join_url,
      password: data.password,
    });
  }
);

server.tool(
  "get_meeting",
  "Get detailed information about a specific meeting",
  {
    meeting_id: z.string().describe("Meeting ID"),
  },
  async ({ meeting_id }) => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).get(`/meetings/${meeting_id}`);
    return text(data);
  }
);

server.tool(
  "update_meeting",
  "Update an existing meeting (topic, time, duration, agenda, settings)",
  {
    meeting_id: z.string().describe("Meeting ID to update"),
    topic: z.string().optional().describe("New topic"),
    start_time: z.string().optional().describe("New start time (ISO 8601)"),
    duration: z.number().optional().describe("New duration in minutes"),
    agenda: z.string().optional().describe("New agenda"),
    password: z.string().optional().describe("New password"),
  },
  async ({ meeting_id, ...updates }) => {
    const token = await getAccessToken();
    const body = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    await zoomApi(token).patch(`/meetings/${meeting_id}`, body);
    return text({ status: "updated", meeting_id });
  }
);

server.tool(
  "delete_meeting",
  "Delete / cancel a scheduled meeting",
  {
    meeting_id: z.string().describe("Meeting ID to delete"),
  },
  async ({ meeting_id }) => {
    const token = await getAccessToken();
    await zoomApi(token).delete(`/meetings/${meeting_id}`);
    return text({ status: "deleted", meeting_id });
  }
);

server.tool(
  "list_meetings",
  "List upcoming scheduled meetings",
  {
    user_id: z.string().optional().describe("User ID or email (default: 'me')"),
    type: z.enum(["scheduled", "live", "upcoming", "upcoming_meetings", "previous_meetings"]).optional().describe("Meeting type filter (default: upcoming)"),
    page_size: z.number().optional().describe("Number of results (max 300, default 30)"),
  },
  async ({ user_id, type, page_size }) => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).get(`/users/${user_id || "me"}/meetings`, {
      params: { type: type || "upcoming", page_size: page_size || 30 },
    });
    const meetings = data.meetings.map((m: any) => ({
      id: m.id,
      topic: m.topic,
      start_time: m.start_time,
      duration: m.duration,
      join_url: m.join_url,
      type: m.type,
    }));
    return text(meetings);
  }
);

server.tool(
  "add_meeting_registrant",
  "Register a participant for a meeting that requires registration",
  {
    meeting_id: z.string().describe("Meeting ID"),
    email: z.string().describe("Registrant email"),
    first_name: z.string().describe("First name"),
    last_name: z.string().optional().describe("Last name"),
  },
  async ({ meeting_id, email, first_name, last_name }) => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).post(`/meetings/${meeting_id}/registrants`, {
      email,
      first_name,
      last_name,
    });
    return text(data);
  }
);

// =====================
//  PARTICIPANTS
// =====================

server.tool(
  "list_meeting_participants",
  "List participants of a past meeting",
  {
    meeting_id: z.string().describe("Meeting UUID or ID (use double-encoded UUID if it starts with / or contains //)"),
  },
  async ({ meeting_id }) => {
    const token = await getAccessToken();
    const encoded = encodeMeetingId(meeting_id);
    const { data } = await zoomApi(token).get(`/past_meetings/${encoded}/participants`, {
      params: { page_size: 300 },
    });
    return text(data.participants);
  }
);

// =====================
//  RECORDINGS
// =====================

server.tool(
  "list_all_recordings",
  "List all recent cloud recordings (configurable date range)",
  {
    user_id: z.string().optional().describe("User ID or email (default: 'me')"),
    from: z.string().optional().describe("Start date YYYY-MM-DD (default: 30 days ago)"),
    to: z.string().optional().describe("End date YYYY-MM-DD (default: today)"),
  },
  async ({ user_id, from, to }) => {
    const token = await getAccessToken();
    const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const defaultTo = new Date().toISOString().split("T")[0];

    const { data } = await zoomApi(token).get(`/users/${user_id || "me"}/recordings`, {
      params: { from: from || defaultFrom, to: to || defaultTo, page_size: 300 },
    });
    const meetings = (data.meetings || []).map((m: any) => ({
      meeting_id: m.id,
      uuid: m.uuid,
      topic: m.topic,
      start_time: m.start_time,
      duration: m.duration,
      recording_count: m.recording_files?.length || 0,
      total_size: m.total_size,
      recording_files: (m.recording_files || []).map((r: any) => ({
        id: r.id,
        file_type: r.file_type,
        download_url: r.download_url,
        file_size: r.file_size,
        status: r.status,
      })),
    }));
    return text(meetings);
  }
);

server.tool(
  "get_recordings",
  "Get download links for recordings of a specific meeting",
  {
    meeting_id: z.string().describe("Meeting ID or UUID"),
  },
  async ({ meeting_id }) => {
    const token = await getAccessToken();
    const encoded = encodeMeetingId(meeting_id);
    const { data } = await zoomApi(token).get(`/meetings/${encoded}/recordings`);
    const recordings = (data.recording_files || []).map((r: any) => ({
      id: r.id,
      file_type: r.file_type,
      file_size: r.file_size,
      recording_start: r.recording_start,
      recording_end: r.recording_end,
      download_url: r.download_url,
      play_url: r.play_url,
      status: r.status,
    }));
    return text({ meeting_id: data.id, uuid: data.uuid, topic: data.topic, recordings });
  }
);

server.tool(
  "get_recording_transcript",
  "Download the transcript (VTT) of a recorded meeting",
  {
    meeting_id: z.string().describe("Meeting ID or UUID"),
  },
  async ({ meeting_id }) => {
    const token = await getAccessToken();
    const encoded = encodeMeetingId(meeting_id);
    const { data } = await zoomApi(token).get(`/meetings/${encoded}/recordings`);

    const transcriptFile = (data.recording_files || []).find(
      (r: any) => r.file_type === "TRANSCRIPT"
    );

    if (!transcriptFile) {
      // Try audio_transcript as fallback
      const audioTranscript = (data.recording_files || []).find(
        (r: any) => r.recording_type === "audio_transcript"
      );
      if (!audioTranscript) {
        return text({ error: "No transcript found for this meeting. Make sure audio transcript is enabled in Zoom settings." });
      }
      const vtt = await downloadFile(audioTranscript.download_url, token);
      return text({ meeting_id, topic: data.topic, format: "vtt", transcript: vtt });
    }

    const vtt = await downloadFile(transcriptFile.download_url, token);
    return text({ meeting_id, topic: data.topic, format: "vtt", transcript: vtt });
  }
);

server.tool(
  "delete_recording",
  "Delete a meeting's cloud recording",
  {
    meeting_id: z.string().describe("Meeting ID or UUID"),
    action: z.enum(["trash", "delete"]).optional().describe("'trash' (recoverable, default) or 'delete' (permanent)"),
  },
  async ({ meeting_id, action }) => {
    const token = await getAccessToken();
    const encoded = encodeMeetingId(meeting_id);
    await zoomApi(token).delete(`/meetings/${encoded}/recordings`, {
      params: { action: action || "trash" },
    });
    return text({ status: "deleted", meeting_id, action: action || "trash" });
  }
);

server.tool(
  "recover_recording",
  "Recover a recording from trash",
  {
    meeting_id: z.string().describe("Meeting UUID"),
  },
  async ({ meeting_id }) => {
    const token = await getAccessToken();
    const encoded = encodeMeetingId(meeting_id);
    await zoomApi(token).put(`/meetings/${encoded}/recordings/status`, {
      action: "recover",
    });
    return text({ status: "recovered", meeting_id });
  }
);

// =====================
//  USERS
// =====================

server.tool(
  "list_users",
  "List all users in the Zoom account",
  {
    status: z.enum(["active", "inactive", "pending"]).optional().describe("Filter by status (default: active)"),
    page_size: z.number().optional().describe("Results per page (max 300, default 30)"),
  },
  async ({ status, page_size }) => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).get("/users", {
      params: { status: status || "active", page_size: page_size || 30 },
    });
    return text(data.users);
  }
);

server.tool(
  "get_user",
  "Get detailed info about a specific user",
  {
    user_id: z.string().describe("User ID or email address"),
  },
  async ({ user_id }) => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).get(`/users/${user_id}`);
    return text(data);
  }
);

// =====================
//  WEBINARS
// =====================

server.tool(
  "create_webinar",
  "Create a new webinar",
  {
    topic: z.string().describe("Webinar topic"),
    start_time: z.string().describe("Start time (ISO 8601)"),
    duration: z.number().describe("Duration in minutes"),
    agenda: z.string().optional().describe("Webinar agenda"),
  },
  async ({ topic, start_time, duration, agenda }) => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).post("/users/me/webinars", {
      topic,
      type: 5, // scheduled webinar
      start_time,
      duration,
      agenda,
    });
    return text({
      id: data.id,
      topic: data.topic,
      start_time: data.start_time,
      join_url: data.join_url,
      registration_url: data.registration_url,
    });
  }
);

server.tool(
  "list_webinars",
  "List all scheduled webinars",
  {
    user_id: z.string().optional().describe("User ID or email (default: 'me')"),
  },
  async ({ user_id }) => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).get(`/users/${user_id || "me"}/webinars`, {
      params: { page_size: 300 },
    });
    return text(data.webinars);
  }
);

server.tool(
  "get_webinar",
  "Get detailed info about a webinar",
  {
    webinar_id: z.string().describe("Webinar ID"),
  },
  async ({ webinar_id }) => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).get(`/webinars/${webinar_id}`);
    return text(data);
  }
);

server.tool(
  "delete_webinar",
  "Delete a scheduled webinar",
  {
    webinar_id: z.string().describe("Webinar ID"),
  },
  async ({ webinar_id }) => {
    const token = await getAccessToken();
    await zoomApi(token).delete(`/webinars/${webinar_id}`);
    return text({ status: "deleted", webinar_id });
  }
);

server.tool(
  "list_webinar_participants",
  "List participants of a past webinar",
  {
    webinar_id: z.string().describe("Webinar ID or UUID"),
  },
  async ({ webinar_id }) => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).get(`/past_webinars/${webinar_id}/participants`, {
      params: { page_size: 300 },
    });
    return text(data.participants);
  }
);

// =====================
//  CONTACTS / CHAT
// =====================

server.tool(
  "list_channels",
  "List Zoom chat channels the user belongs to",
  {},
  async () => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).get("/chat/users/me/channels", {
      params: { page_size: 50 },
    });
    return text(data.channels);
  }
);

server.tool(
  "send_chat_message",
  "Send a direct chat message to a user or channel",
  {
    to_contact: z.string().optional().describe("Recipient email (for direct message)"),
    to_channel: z.string().optional().describe("Channel ID (for channel message)"),
    message: z.string().describe("Message text"),
  },
  async ({ to_contact, to_channel, message }) => {
    const token = await getAccessToken();
    const body: any = { message };
    if (to_channel) {
      body.to_channel = to_channel;
    } else if (to_contact) {
      body.to_contact = to_contact;
    } else {
      return text({ error: "Provide either to_contact or to_channel" });
    }
    const { data } = await zoomApi(token).post("/chat/users/me/messages", body);
    return text(data);
  }
);

// =====================
//  REPORTS
// =====================

server.tool(
  "get_meeting_report",
  "Get a detailed report for a past meeting (duration, participants count, etc.)",
  {
    meeting_id: z.string().describe("Meeting ID or UUID"),
  },
  async ({ meeting_id }) => {
    const token = await getAccessToken();
    const encoded = encodeMeetingId(meeting_id);
    const { data } = await zoomApi(token).get(`/report/meetings/${encoded}`);
    return text(data);
  }
);

server.tool(
  "get_daily_usage_report",
  "Get daily usage report (meetings count, participants, minutes)",
  {
    year: z.number().describe("Year (e.g. 2026)"),
    month: z.number().describe("Month (1-12)"),
  },
  async ({ year, month }) => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).get("/report/daily", {
      params: { year, month },
    });
    return text(data);
  }
);

server.tool(
  "get_meeting_participant_report",
  "Get detailed participant report for a past meeting",
  {
    meeting_id: z.string().describe("Meeting ID or UUID"),
  },
  async ({ meeting_id }) => {
    const token = await getAccessToken();
    const encoded = encodeMeetingId(meeting_id);
    const { data } = await zoomApi(token).get(`/report/meetings/${encoded}/participants`, {
      params: { page_size: 300 },
    });
    return text(data);
  }
);

// =====================
//  PHONE (Zoom Phone)
// =====================

server.tool(
  "list_phone_call_logs",
  "List call logs from Zoom Phone",
  {
    from: z.string().optional().describe("Start date YYYY-MM-DD"),
    to: z.string().optional().describe("End date YYYY-MM-DD"),
  },
  async ({ from, to }) => {
    const token = await getAccessToken();
    const defaultFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const defaultTo = new Date().toISOString().split("T")[0];
    const { data } = await zoomApi(token).get("/phone/call_history", {
      params: { from: from || defaultFrom, to: to || defaultTo, page_size: 100 },
    });
    return text(data);
  }
);

// =====================
//  SETTINGS
// =====================

server.tool(
  "get_meeting_settings",
  "Get account-level meeting settings",
  {},
  async () => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).get("/users/me/settings");
    return text(data);
  }
);

// =====================
//  HELPERS
// =====================

function text(data: any) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function encodeMeetingId(id: string): string {
  // Zoom UUIDs starting with / or containing // need double encoding
  if (id.startsWith("/") || id.includes("//")) {
    return encodeURIComponent(encodeURIComponent(id));
  }
  return encodeURIComponent(id);
}

async function downloadFile(url: string, token: string): Promise<string> {
  const { default: axios } = await import("axios");
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: "text",
    params: { access_token: token },
  });
  return response.data;
}

// =====================
//  HTTP + SSE TRANSPORT
// =====================

const app = express();

const transports: Record<string, SSEServerTransport> = {};

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  res.on("close", () => {
    delete transports[transport.sessionId];
  });
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  if (!transport) {
    res.status(400).json({ error: "Unknown session" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Zoom MCP server v2.0 listening on port ${PORT}`);
});
