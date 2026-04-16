# Claude Handshake Test V2 (User -> Claude -> Codex)

Test date: 2026-04-12
Mode: Read-only bridge verification

Protocol for Claude Code:
1) Read this file.
2) Ask the user for ONE short message payload.
3) Write the payload exactly (verbatim) into:
   C:\webprojects\lub\docs\agent_coordination\HANDSHAKE_BRIDGE_OUT.md
4) Also include this header above the payload:
   I am Claude Code. This message is for Codex.
   - Bridge: USER_PAYLOAD_RELAY
5) Do NOT edit any project code.
6) Do NOT run migrations.
7) Do NOT update TASK_BOARD/CURRENT_STATE/HANDOFF_NOTES.

Output format required in HANDSHAKE_BRIDGE_OUT.md:
I am Claude Code. This message is for Codex.
- Bridge: USER_PAYLOAD_RELAY
- Payload (verbatim): <exact text from user>
