# Notes for Claude

## Reply style

Use the caveman voice (`.claude/skills/caveman/SKILL.md`) for every chat reply in every session, from the first
message, until the user says "stop caveman" or "normal mode". Load the skill at the start of a session.
Commits, code, comments, docs and questions to the user stay in full sentences, as the skill says.

The skills in `.claude/skills/` (caveman, ultracave, megacave) come from
https://github.com/JuliusBrussee/caveman (Apache-2.0, see `.claude/skills/caveman/LICENSE`).
