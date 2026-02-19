/**
 * POST /api/marketing-pipeline/translate
 * Translates English ad copy to Norwegian, Swedish, and Danish using Gemini.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

const SECTION_LABELS: Record<string, string> = {
  hook: 'Hook (short, punchy headline)',
  primaryText: 'Ad Description / Primary Text (longer persuasive body copy)',
  cta: 'Call to Action (CTA — short, action-oriented)',
};

function buildPrompt(text: string, section: string): string {
  const label = SECTION_LABELS[section] || section;

  return `You are an expert multilingual marketing copywriter specializing in Scandinavian markets.

Transcreate the following English ${label} into Norwegian (Bokmål), Swedish, and Danish.

CRUCIAL GUIDELINES:
- Transcreation over Translation: Do NOT translate word-for-word. Focus on translating the meaning, emotion, and sales psychology behind the English copy.
- Sound 100% Native: Each translation must sound like it was originally written by a native copywriter for that specific market. Use modern, natural-sounding phrasing, idioms, and marketing conventions.
- Norwegian: Keep it conversational and persuasive. Avoid overly formal or academic Bokmål.
- Swedish: Use natural Swedish marketing language. Avoid Norwegianisms or Danishisms.
- Danish: Use natural Danish marketing language. Keep the casual, direct tone Danes expect.
- Punchy: Hooks must remain short, snappy, and scroll-stopping. Adapt phrasing if an English idiom doesn't work in the target language.
- CTAs: Use strong, action-oriented verbs that drive immediate action.
- Maintain the tone, length, and formatting of the original. Do NOT add quotes around the text.

English text:
"""
${text}
"""

Respond with ONLY a JSON object in this exact format (no markdown, no code blocks, no explanation):
{"no": "Norwegian translation", "se": "Swedish translation", "dk": "Danish translation"}`;
}

export const POST = withPermission(
  'tools.marketing_pipeline',
  'can_edit',
  async (request: NextRequest, _user: AppUser): Promise<NextResponse> => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { success: false, error: 'GEMINI_API_KEY not configured' },
          { status: 500 },
        );
      }

      const body = await request.json();
      const { text, section } = body as { text?: string; section?: string };

      if (!text?.trim()) {
        return NextResponse.json(
          { success: false, error: 'English text is required' },
          { status: 400 },
        );
      }

      if (!section || !SECTION_LABELS[section]) {
        return NextResponse.json(
          { success: false, error: 'Valid section (hook, primaryText, cta) is required' },
          { status: 400 },
        );
      }

      const prompt = buildPrompt(text.trim(), section);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.7,
            },
          }),
        },
      );

      if (!response.ok) {
        return NextResponse.json(
          { success: false, error: `Gemini API returned ${response.status}` },
          { status: 502 },
        );
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        return NextResponse.json(
          { success: false, error: 'Empty response from Gemini' },
          { status: 502 },
        );
      }

      const translations = JSON.parse(content) as { no: string; se: string; dk: string };

      return NextResponse.json({ success: true, data: translations });
    } catch (error) {
      unstable_rethrow(error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Translation failed' },
        { status: 500 },
      );
    }
  },
);
