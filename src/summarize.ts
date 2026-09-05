import type { ChangeRecord } from "./types.js";

/**
 * Optional LLM summarization when OPENAI_API_KEY is set.
 * Falls back to a deterministic local rollup otherwise.
 */
export async function summarizeChanges(
  changes: ChangeRecord[],
  contextLabel: string
): Promise<string> {
  if (changes.length === 0) {
    return `No meaningful changes detected for ${contextLabel}.`;
  }

  const local = localRollup(changes, contextLabel);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return local;

  try {
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const payload = {
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a competitive-intelligence analyst. Summarize competitor changes in 3–6 crisp bullet points for a product/strategy reader. Be factual; do not invent.",
        },
        {
          role: "user",
          content: `Context: ${contextLabel}\n\nChanges JSON:\n${JSON.stringify(
            changes.map((c) => ({
              competitor: c.competitorName,
              category: c.category,
              source: c.sourceKind,
              url: c.url,
              summary: c.summary,
              excerpt: c.diffExcerpt.slice(0, 500),
            })),
            null,
            2
          )}`,
        },
      ],
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return `${local}\n\n_LLM summarize skipped (HTTP ${res.status}): ${errText.slice(0, 200)}_`;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return local;
    return content;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `${local}\n\n_LLM summarize failed: ${msg}_`;
  }
}

function localRollup(changes: ChangeRecord[], contextLabel: string): string {
  const byCat = new Map<string, number>();
  for (const c of changes) {
    byCat.set(c.category, (byCat.get(c.category) ?? 0) + 1);
  }
  const catLine = [...byCat.entries()]
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");
  const bullets = changes.slice(0, 8).map((c) => {
    return `- **${c.competitorName}** [${c.category}/${c.sourceKind}]: ${c.summary}`;
  });
  return [
    `Detected **${changes.length}** meaningful change(s) for ${contextLabel} (${catLine}).`,
    "",
    ...bullets,
    changes.length > 8 ? `\n_…and ${changes.length - 8} more._` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
