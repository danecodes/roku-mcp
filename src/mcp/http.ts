#!/usr/bin/env node

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { EcpClient } from '../core/ecp-client.js';
import { registerTools } from './register-tools.js';
import { SERVER_INSTRUCTIONS } from '../instructions.js';

const deviceIp = process.env.ROKU_DEVICE_IP ?? '192.168.0.30';
const devPassword = process.env.ROKU_DEV_PASSWORD ?? 'rokudev';
const client = new EcpClient(deviceIp, 8060, { devPassword });

const PORT = parseInt(process.env.ROKU_MCP_PORT ?? '3141', 10);

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const rawBody = await readBody(req);
  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : undefined;
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid JSON');
    return;
  }

  const server = new McpServer(
    { name: 'roku-mcp', version: '0.1.4' },
    { instructions: SERVER_INSTRUCTIONS },
  );
  registerTools(server, client);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, body);
});

httpServer.listen(PORT, () => {
  console.error(`roku-mcp HTTP server running at http://localhost:${PORT}/mcp`);
  console.error(`Roku device: ${deviceIp}`);
});
