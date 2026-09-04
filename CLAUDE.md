# AgentRail — Instructions for Claude

## Workflow

- After presenting and getting approval on a brainstorming design, proceed straight through the rest of the process (writing the spec, writing the plan, implementing) without stopping to ask "should I continue?" between stages. Only stop for genuine blockers (ambiguous requirements, a decision only the user can make, a failing test you can't diagnose).
- Always use `superpowers:subagent-driven-development` to execute implementation plans in this repo — dispatch each plan task to a subagent rather than implementing inline.
