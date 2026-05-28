<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

Use the `/trellis:start` command when starting a new session to:
- Initialize your developer identity
- Understand current project context
- Read relevant guidelines

Use `@/.trellis/` to learn:
- Development workflow (`workflow.md`)
- Project structure guidelines (`spec/`)
- Developer workspace (`workspace/`)

If you're using Codex, project-scoped helpers may also live in:
- `.agents/skills/` for reusable Trellis skills
- `.codex/agents/` for optional custom subagents

Keep this managed block so 'trellis update' can refresh the instructions.

<!-- TRELLIS:END -->


## 测试集

- `D:\Elden-Ring-Nightreign-Save-Editor\NR0000.sl2`是一个真实用户的存档文件，如果你需要一个真实用户存档进行功能验收，请使用它。
- 此条为 `2026年5月28日11点28分` 新增，如果你在goal中看到此条内容，无需因此推翻之前的测试结论。

## git提交

- 每完成一阶段任务，进行git提交
- 每3h至少进行一次git提交
- 如果发现项目修改区有大量未提交任务，请确认changes区的内容为此次Trellis任务的修改内容。