# Cursor Configuration Overview

This project uses Cursor's persistent context system to keep the AI aligned with the AI Caller ID vision.

## Artifacts

| Location | Purpose |
| --- | --- |
| `.cursor/rules/*.mdc` | System-level guidance for how the AI should work across the codebase. |
| `.cursor/features/*.mdc` | Feature briefs that capture intent, user stories, and acceptance criteria. |
| `.cursor/scopes/*.mdc` | Named focus areas that map to directory globs for targeted work sessions. |

## Authoring Guidance

- **Rules** follow the MDC format described in the [Cursor Rules documentation](https://cursor.com/docs/context/rules). Key fields: `description`, `globs`, `alwaysApply`. Keep individual files focused and under ~500 lines.
- **Features** capture outcomes, user stories, acceptance criteria, and technical notes for a specific slice of work. They reference related scopes so the agent understands which parts of the repo matter.
- **Scopes** declare clusters of files to include when focusing the agent. They explain objectives and guardrails for that area.

## Workflow Tips

1. Reference feature files in chat with `@feature-mvp-phone-lookup` (etc.) to prime the agent before coding.
2. When editing a specific part of the system, switch to the matching scope (e.g., `@scope frontend`) so Cursor prioritizes relevant files.
3. Update rules when you make architectural decisions or change compliance copy to keep the AI aligned.
4. Add new features/scopes as the roadmap grows; keep them small and actionable.

These conventions mirror the best practices outlined in Cursor's docs and community examples, ensuring repeatable, high-quality AI assistance.
