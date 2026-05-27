import { startMcpServer } from './server';

import { engine } from './engine';
import path from 'path';

// Set default port for standalone if not specified
process.env.MCP_PORT = process.env.MCP_PORT || '8000';

console.log('[camunda-mcp-standalone] Starting standalone MCP Server...');

const filePath = process.argv[2];
if (filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  console.log(`[camunda-mcp-standalone] Loading model from ${resolvedPath}`);
  engine.loadModel(resolvedPath).catch(err => {
    console.error(`[camunda-mcp-standalone] Failed to load model ${resolvedPath}:`, err);
  });
} else {
  console.log('[camunda-mcp-standalone] No .bpmn file provided. A new diagram will be created automatically on first tool call.');
}

startMcpServer().catch(err => {
  console.error('[camunda-mcp-standalone] Failed to start server:', err);
  process.exit(1);
});
