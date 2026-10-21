# acezilla web app

## AI drafting of SEO fixes (LLM provider)

The audit itself is rule-based. A language model only drafts wording for fix cards. Page text is untrusted: it is passed as delimited data, the model has no tools, the answer must match a declared JSON schema, and every card is validated before it is shown. Text on a page that tries to instruct the AI is **reported as a finding and ignored**.

### Choosing the backend

`LLM_PROVIDER` selects it. Default is `vertex`.

| Value | Backend | Credentials |
|---|---|---|
| `vertex` | Vertex AI (`aiplatform.googleapis.com`), service-account auth | `GOOGLE_PROJECT_ID`, `GOOGLE_VERTEX_LOCATION`, `GOOGLE_SERVICE_ACCOUNT_KEY` (+ optional `GOOGLE_SERVICE_ACCOUNT_EMAIL`) |
| `aistudio` | Google AI Studio Gemini API (`generativelanguage.googleapis.com`) | `GEMINI_API_KEY` |

To fall back, set `LLM_PROVIDER=aistudio` and redeploy. No code change is needed.

### Environment variables

| Variable | Needed for | Notes |
|---|---|---|
| `LLM_PROVIDER` | both | `vertex` (default) or `aistudio` |
| `GOOGLE_PROJECT_ID` | vertex | e.g. `acezilla` |
| `GOOGLE_VERTEX_LOCATION` | vertex | **Required, no default.** `global`, `us`, `eu`, or a region such as `europe-west4`. A wrong region returns HTTP 404 |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | vertex | base64 of the service account JSON. **Secret.** Server only |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | vertex, optional | If set, must match the key's own `client_email` (catches a wrong key) |
| `GEMINI_MODEL` | both, optional | Default `gemini-3.1-flash-lite` (vertex) / `gemini-flash-latest` (aistudio) |
| `GEMINI_API_KEY` | aistudio | **Secret** |

In Vercel set them for **Production** (audits run there, including the weekly job). Add **Preview** only if you run audits on preview deployments. Mark the two secrets Sensitive. Locally put them in `apps/web/.env.local`.

### Setting the service account key without ever printing it

```sh
# Vercel (Production). The key is piped, never shown:
base64 -i /path/to/key.json | tr -d '\n' | npx vercel env add GOOGLE_SERVICE_ACCOUNT_KEY production --scope <your-scope>
# Local:
echo "GOOGLE_SERVICE_ACCOUNT_KEY=$(base64 -i /path/to/key.json | tr -d '\n')" >> apps/web/.env.local
```

Then delete the downloaded JSON file when you no longer need it.

### Errors you may see (logged by kind, never with credentials)

| Kind | HTTP | Meaning |
|---|---|---|
| `billing` | 402 | No credit or billing problem on the project |
| `quota` | 429 | Rate or quota limit |
| `iam` | 403 | Service account lacks `roles/aiplatform.user`, or the Vertex AI API is not enabled |
| `not_found` | 404 | Wrong region (`GOOGLE_VERTEX_LOCATION`) or model ID (`GEMINI_MODEL`) |
| `auth` | 401 | Credential rejected or expired |
| `config` | none | A setting is missing or malformed (no network call was made) |
| `invalid_output` / `blocked` | 200 | The answer did not match the schema, was cut off, or the model declined: nothing is shown |

### Testing locally

```sh
# unit tests (no network, no credentials)
npx turbo run test
# live check against the configured provider: a normal page and a page with injected instructions
npx tsx --conditions=react-server --env-file=.env.local scripts/llm-injection-test.mts
```

The live check fails (exit code 1) if a card contains injected wording or markup, and passes only when the injected instructions are reported in `flagged` and not obeyed.

### Security notes

- `lib/llm/vertex.ts` is `server-only` and also throws if loaded in a browser. The key is decoded in memory and never written to disk or logged.
- The model is given no tools. Its output is data: it is schema-checked, validated per card, and rendered as text (no `dangerouslySetInnerHTML`).
