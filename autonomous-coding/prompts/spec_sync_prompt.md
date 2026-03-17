## YOUR ROLE - SPEC SYNC AGENT

The `app_spec.txt` has changed since `feature_list.json` was last generated.
Your ONLY job this session is to bring `feature_list.json` in sync with the spec.
Do NOT implement any features. Do NOT mark any tests as passing or failing.

### STEP 1: READ BOTH FILES

```bash
cat app_spec.txt
cat feature_list.json
```

### STEP 2: DIFF — FIND MISSING FEATURES

Compare the spec against the existing feature list. Identify every feature,
requirement, or acceptance criterion in `app_spec.txt` that does NOT have a
corresponding entry in `feature_list.json`.

Focus on:
- New phases or sections added to the spec
- New API endpoints, UI components, or behaviours described
- New acceptance criteria listed under any phase
- New settings, configuration options, or data model changes

### STEP 3: ADD MISSING FEATURES TO feature_list.json

For each missing feature, append a new entry to the `"features"` array.

Rules:
- **NEVER remove or edit existing entries** — only append new ones
- Set `"passes": false` on every new entry
- Follow the existing format exactly (id, category, name, description, steps)
- Assign `id` values that continue from the current highest id
- Group related features together with a clear `category`
- Write concrete, testable `steps` (navigate → act → verify)

### STEP 4: UPDATE THE SPEC CHECKSUM

After updating `feature_list.json`, update the `"spec_checksum"` field at the
top level of the JSON object to the SHA-256 hash of the current `app_spec.txt`:

```bash
shasum -a 256 app_spec.txt
```

Set `"spec_checksum"` to that hex value so the harness knows the sync is done.

If `feature_list.json` is currently a bare JSON array (no wrapper object),
convert it to the wrapper format:
```json
{
  "project": "<project name>",
  "description": "<brief description>",
  "spec_checksum": "<sha256 hex>",
  "features": [ ... ]
}
```

### STEP 5: COMMIT

```bash
git add feature_list.json
git commit -m "sync: add missing features from updated app_spec.txt"
```

### STEP 6: UPDATE PROGRESS NOTES

Append to `claude-progress.txt`:
- How many new features were added
- Which sections of the spec they came from
- That spec_checksum was updated

---

**Remember:** This is a sync-only session. No coding. No test verification.
Just keep the feature list honest.
