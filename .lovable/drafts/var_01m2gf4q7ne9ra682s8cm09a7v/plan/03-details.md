# Implementation details

- Add a local focused-number state to the existing Unit Numbers panel.
- Pool clicks both focus and copy the number; lookup results focus after the debounced holder check completes.
- Reuse the existing pool entry and holder data—no database or business-rule changes.
- Replace the fixed large “Next available” strip with a contextual focus strip.
- When another number is focused, show “Next available: 272” as a subdued secondary line.
- Give the matching pool badge the same gold selected treatment for visual continuity.
- Keep held/free messages clear and preserve the existing holder wording.

## Verification

- Test default focus on next available.
- Test focus changes after a pool click.
- Test focus changes after both held and free lookups.
- Test that next available remains visible while another number is focused.
- Test close/reopen reset behavior and existing copy behavior.
- Check the panel on desktop and its mobile bottom sheet.
