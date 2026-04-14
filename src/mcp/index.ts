#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { EcpClient } from '@danecodes/roku-ecp';
import { registerTools } from './register-tools.js';
import { SERVER_INSTRUCTIONS } from '../instructions.js';

const deviceIp = process.env.ROKU_DEVICE_IP ?? '192.168.0.30';
const devPassword = process.env.ROKU_DEV_PASSWORD ?? 'rokudev';
const client = new EcpClient(deviceIp, { devPassword });

const server = new McpServer(
  { name: 'roku-mcp', version: '0.3.0' },
  { instructions: SERVER_INSTRUCTIONS },
);
registerTools(server, client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(`MCP server error: ${err.message}`);
  process.exit(1);
});
