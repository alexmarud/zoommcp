import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";
import { getAccessToken, zoomApi } from "./zoom-api.js";

const server = new McpServer({
  name: "zoom-mcp-server",
  version: "1.0.0",
});

// --- Tool: create_meeting ---
server.tool(
  "create_meeting",
  "Create a new Zoom meeting",
  {
    topic: z.string().describe("Meeting topic / title"),
    start_time: z
      .string()
      .describe("Start time in ISO 8601 format, e.g. 2026-03-15T10:00:00Z"),
    duration: z.number().describe("Duration in minutes"),
  },
  async ({ topic, start_time, duration }) => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).post("/users/me/meetings", {
      topic,
      type: 2, // scheduled meeting
      start_time,
      duration,
      settings: {
        join_before_host: true,
        waiting_room: false,
      },
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              id: data.id,
              topic: data.topic,
              start_time: data.start_time,
              duration: data.duration,
              join_url: data.join_url,
              password: data.password,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- Tool: list_meetings ---
server.tool(
  "list_meetings",
  "List upcoming scheduled meetings",
  {},
  async () => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).get("/users/me/meetings", {
      params: { type: "upcoming", page_size: 30 },
    });

    const meetings = data.meetings.map((m: any) => ({
      id: m.id,
      topic: m.topic,
      start_time: m.start_time,
      duration: m.duration,
      join_url: m.join_url,
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(meetings, null, 2),
        },
      ],
    };
  }
);

// --- Tool: get_recordings ---
server.tool(
  "get_recordings",
  "Get download links for recordings of a specific meeting",
  {
    meeting_id: z.string().describe("The meeting ID to fetch recordings for"),
  },
  async ({ meeting_id }) => {
    const token = await getAccessToken();
    const { data } = await zoomApi(token).get(
      `/meetings/${meeting_id}/recordings`
    );

    const recordings = (data.recording_files || []).map((r: any) => ({
      id: r.id,
      file_type: r.file_type,
      file_size: r.file_size,
      recording_start: r.recording_start,
      recording_end: r.recording_end,
      download_url: r.download_url,
      status: r.status,
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              meeting_id: data.id,
              topic: data.topic,
              recordings,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- Tool: list_all_recordings ---
server.tool(
  "list_all_recordings",
  "List all recent cloud recordings for the account (last 30 days)",
  {},
  async () => {
    const token = await getAccessToken();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const to = new Date().toISOString().split("T")[0];

    const { data } = await zoomApi(token).get("/users/me/recordings", {
      params: { from, to, page_size: 30 },
    });

    const meetings = (data.meetings || []).map((m: any) => ({
      meeting_id: m.id,
      topic: m.topic,
      start_time: m.start_time,
      duration: m.duration,
      recording_count: m.recording_files?.length || 0,
      total_size: m.total_size,
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(meetings, null, 2),
        },
      ],
    };
  }
);

// --- HTTP + SSE transport ---
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
  console.log(`Zoom MCP server listening on port ${PORT}`);
});
