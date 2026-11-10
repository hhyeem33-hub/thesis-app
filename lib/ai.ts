import { promises as fs } from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { currentUser } from "./auth";
import { dbGetUserAiKey, dbSaveUserAiKey } from "./db";
import { ONLINE } from "./online";

// ⚠️ API 키 보호
// - 버셀에서는 환경 변수 ANTHROPIC_API_KEY 를 쓴다 (코드·깃허브에 키를 넣지 않음).
// - 내 컴퓨터에서는 설정 화면에서 넣은 키를 data/ai-key.json 에 저장한다.
//   data/*.json 은 .gitignore 에 있어서 깃허브에 올라가지 않는다.
// - 키 원문은 절대 화면(브라우저)으로 보내지 않는다. 끝 4자리만 보여 준다.
// - 온라인(여러 사람이 씀): 버셀의 키는 주인 계정(OWNER_EMAIL)만 쓴다. 다른 사람은 설정에서 자기 키를 넣고
//   (슈파베이스 user_settings, 본인만), 키가 없으면 AI 대신 규칙 기반 분류로 동작한다.

/** 비용이 가장 적은 모델 */
export const AI_MODEL = "claude-haiku-5-5";

const KEY_FILE = path.join(process.cwd(), "data", "ai-key.json");

export type AiKeyStatus = {
  /** env: 환경 변수(버셀), saved: 설정 화면에서 저장, none: 없음 */
  source: "env" | "saved" | "none";
  /** 키 끝 4자리 (확인용) */
  last4?: string;
};

async function readSavedKey(): Promise<string> {
  try {
    const data = JSON.parse(await fs.readFile(KEY_FILE, "utf8")) as { apiKey?: string };
    return data.apiKey?.trim() ?? "";
  } catch {
    return "";
  }
}

/** 환경 변수의 키 (vercel env pull 이 남기는 "[SENSITIVE]" 같은 자리 표시는 무시) */
function envApiKey() {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key?.startsWith("sk-ant-") ? key : "";
}

/** 온라인에서 지금 로그인한 사람이 쓸 수 있는 키: 주인 → 버셀 키, 그 밖의 사람 → 자기가 저장한 키 */
async function onlineKey(): Promise<{ key: string; source: AiKeyStatus["source"] }> {
  const user = await currentUser();
  if (!user) return { key: "", source: "none" };
  if (user.isOwner && envApiKey()) return { key: envApiKey(), source: "env" };
  const own = await dbGetUserAiKey().catch(() => "");
  return own ? { key: own, source: "saved" } : { key: "", source: "none" };
}

async function getApiKey(): Promise<string> {
  if (ONLINE) return (await onlineKey()).key;
  return envApiKey() || (await readSavedKey());
}

export async function getAiKeyStatus(): Promise<AiKeyStatus> {
  if (ONLINE) {
    const { key, source } = await onlineKey();
    return key ? { source, last4: key.slice(-4) } : { source: "none" };
  }
  const envKey = envApiKey();
  if (envKey) return { source: "env", last4: envKey.slice(-4) };
  const saved = await readSavedKey();
  return saved ? { source: "saved", last4: saved.slice(-4) } : { source: "none" };
}

export async function saveApiKey(apiKey: string) {
  if (ONLINE) return dbSaveUserAiKey(apiKey);
  await fs.mkdir(path.dirname(KEY_FILE), { recursive: true });
  await fs.writeFile(KEY_FILE, JSON.stringify({ apiKey }, null, 2) + "\n", "utf8");
}

export async function deleteApiKey() {
  if (ONLINE) return dbSaveUserAiKey(null);
  await fs.rm(KEY_FILE, { force: true });
}

async function getClient(apiKey?: string) {
  const key = apiKey || (await getApiKey());
  if (!key) throw new Error("API 키가 없어요. 설정 화면의 ‘AI 연결’에서 키를 넣어 주세요.");
  return new Anthropic({ apiKey: key });
}

/** 사람이 읽을 수 있는 오류 문장으로 바꾼다 */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError)
    return "API 키가 올바르지 않아요. 키를 다시 확인해 주세요.";
  if (e instanceof Anthropic.PermissionDeniedError)
    return "이 키로는 사용할 수 없어요. Claude 콘솔에서 키 권한을 확인해 주세요.";
  if (e instanceof Anthropic.RateLimitError)
    return "요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.";
  if (e instanceof Anthropic.BadRequestError)
    return `요청을 처리하지 못했어요. (크레딧 잔액이 부족하면 이 오류가 날 수 있어요) ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError)
    return "Claude 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.";
  if (e instanceof Anthropic.APIError) return `Claude API 오류 (${e.status}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

/** 연결 테스트: 토큰을 쓰지 않는 모델 정보 조회로 키가 맞는지만 확인한다 */
export async function testConnection(apiKey?: string) {
  const client = await getClient(apiKey);
  const model = await client.models.retrieve(AI_MODEL);
  return model.display_name;
}

// hufs-thesis-hwpx 스킬의 원고 JSON 형식 (예문·표는 빼고 문단만)
const Section = z.object({
  title: z.string().describe("절 제목 (번호 없이)"),
  blocks: z.array(z.string()).describe("문단들"),
});
const Manuscript = z.object({
  title: z.string().describe("논문 제목"),
  chapters: z
    .array(
      z.object({
        title: z.string().describe("장 제목 (번호 없이, 예: 서론)"),
        blocks: z.array(z.string()).describe("장 첫머리 문단들"),
        sections: z.array(Section),
      })
    )
    .describe("서론부터 결론까지 4~5개 장"),
  references: z.array(z.string()).describe("참고문헌 항목"),
});
export type Manuscript = z.infer<typeof Manuscript> & { author: string; author_note: string };

const SYSTEM = `너는 한국외국어대학교 대학원생의 학위논문 초안 작성을 돕는 연구 보조자다.
주어진 주제·연구 목적·연구 방법으로 학위논문 초안을 쓴다.

[문체]
- 학위논문 문어체("~이다", "~하였다")로 쓴다. 존댓말·구어체·"저는"은 쓰지 않는다. 1인칭은 "본 연구", "연구자".
- 장·절 제목에는 번호를 붙이지 않는다 (양식이 자동으로 1. / 1.1. 번호를 붙인다).

[구성]
- 장 4~5개: 서론(연구 배경, 연구 목적, 연구 문제) → 이론적 배경·선행연구 → 연구 방법 → 예상 결과 및 논의 → 결론.
- 각 절은 2~3문단, 각 문단은 3~5문장의 초안 분량.
- 각주가 필요하면 문장 끝에 [^각주 내용] 형식으로 넣는다.

[정직성 — 가장 중요]
- 실제로 존재하는지 확신할 수 없는 문헌, 저자, 연도, 통계 수치, 연구 결과는 절대 지어내지 않는다.
- 그런 자리에는 "[보완 필요]"를 쓰고 무엇을 채워야 하는지 적는다. 예: "국내 수면 건강식품 시장 규모는 [보완 필요: 최근 시장 규모 통계와 출처]에 이른다."
- 참고문헌은 형식 예시만 쓰고 각 항목 앞에 "[보완 필요]"를 붙인다. 예: "[보완 필요] 저자명(연도), 「논문 제목」, 『학술지명』 권(호)".
- 아직 연구를 하지 않았으므로 결과는 "~할 것으로 예상된다"처럼 예상으로만 쓴다.`;

export async function writeDraft(input: { topic: string; purpose: string; method: string; research?: ResearchBasis }) {
  const client = await getClient();
  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `다음 내용으로 학위논문 초안을 써 줘.

주제: ${input.topic}
연구 목적: ${input.purpose || "(적지 않음 — 주제에 맞게 제안)"}
연구 방법: ${input.method || "(적지 않음 — 주제에 맞게 제안)"}${
          input.research ? `

[프로젝트 연구 설정 — 이 기준에 맞춰 쓴다. 목차가 있으면 그 순서를 따른다]
${basisText(input.research)}` : ""
        }`,
      },
    ],
    output_config: { format: zodOutputFormat(Manuscript) },
  });

  if (response.stop_reason === "refusal")
    throw new Error("AI가 이 주제로는 글을 쓰지 않겠다고 했어요. 주제를 바꿔 다시 시도해 주세요.");
  if (response.stop_reason === "max_tokens")
    throw new Error("글이 너무 길어져 중간에 끊겼어요. 다시 시도해 주세요.");
  if (!response.parsed_output) throw new Error("AI 답변을 원고 형식으로 읽지 못했어요. 다시 시도해 주세요.");

  const manuscript: Manuscript = {
    ...response.parsed_output,
    author: "○○○",
    author_note: "한국외국어대학교 대학원 ○○학과 석사과정",
  };
  return manuscript;
}

// ── AI 판단 (관련도 · 제안 토픽 · 키워드 · 근거 · 신뢰도 · PARA · 요약) ──────────

/** AI 판단·초안의 기준이 되는 연구 설정 */
export type ResearchBasis = {
  purpose: string;
  keywords: string[];
  perspective: string;
  questions: string[];
  outline: string[];
};

export function basisText(r: ResearchBasis) {
  return [
    `연구 목적: ${r.purpose || "(아직 정하지 않음)"}`,
    `핵심 키워드: ${r.keywords.join(", ") || "(없음)"}`,
    r.perspective && `나의 관점: ${r.perspective}`,
    r.questions.length && `연구 질문:\n${r.questions.map((q, i) => `  ${i + 1}. ${q}`).join("\n")}`,
    r.outline.length && `목차: ${r.outline.join(" / ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 목차가 있으면 제안 토픽을 목차 항목(또는 '해당 없음') 중에서만 고르게 한다 */
export const NO_TOPIC = "해당 없음";
const outlineItems = (outline: string[]) => [...new Set(outline.map((o) => o.trim()).filter(Boolean))];

// 목록(enum)으로 강제하면 AI가 띄어쓰기·번호를 조금만 달리 써도 답 전체가 실패한다.
// 그래서 글자로 받고, 아래 matchTopic 으로 가장 가까운 목차 항목에 맞춘다.
function classifySchema(outline: string[]) {
  const items = outlineItems(outline);
  const topic = items.length
    ? z.string().describe(`제안 토픽: 다음 중 하나를 그대로 적는다 — ${[...items, NO_TOPIC].map((t) => `"${t}"`).join(", ")}`)
    : z.string().describe("제안 토픽: 짧은 주제명 (15자 이내)");
  return ClassifyBase.extend({ topic });
}

/** AI가 적은 토픽을 목차 항목에 맞춘다 (번호·띄어쓰기·따옴표 무시, 포함 관계 허용). 못 맞추면 '해당 없음' */
export function matchTopic(raw: string, outline: string[]) {
  const items = outlineItems(outline);
  const topic = raw.trim();
  if (!items.length) return topic.slice(0, 40);
  const key = (s: string) => s.replace(/^[\d.\s장절]+/, "").replace(/["'‘’“”\s·.,]/g, "").toLowerCase();
  const k = key(topic);
  if (!k || k === key(NO_TOPIC)) return NO_TOPIC;
  return (
    items.find((i) => key(i) === k) ??
    items.find((i) => key(i).includes(k) || k.includes(key(i))) ??
    NO_TOPIC
  );
}

const ClassifyBase = z.object({
  relevance: z.enum(["1", "2", "3", "4", "5"]).describe("연구와의 관련도 (5가 가장 높음)"),
  keywords: z.array(z.string()).describe("관련 키워드 3~6개 (핵심 키워드와 겹치는 것 우선)"),
  reason: z.string().describe("분류 근거 1~2문장: 왜 이 등급·토픽인지"),
  confidence: z.enum(["높음", "중간", "낮음"]).describe("판단 신뢰도 (내용이 짧거나 애매하면 낮음)"),
  para: z.enum(["projects", "areas", "resources", "archives"]).describe("PARA 분류"),
  summary: z.string().describe("자료 내용 요약 2~3문장"),
});

const CLASSIFY_SYSTEM = `너는 대학원생의 논문 자료를 정리하는 연구 보조자다.
연구자의 연구 설정을 기준으로 자료 하나를 판단한다. 최종 결정은 연구자가 하므로, 판단 근거를 분명히 적는다.

[관련도]
5 = 연구 질문에 바로 답하는 핵심 근거, 4 = 직접 관련, 3 = 부분적으로 관련, 2 = 배경 정도, 1 = 거의 무관

[제안 토픽]
- 연구 설정에 목차가 있으면, 목차 항목 중 이 자료가 들어갈 곳 하나를 글자 그대로 적는다. 맞는 곳이 없으면 "해당 없음".
- 목차가 없으면 짧은 주제명을 붙인다.

[신뢰도]
- 높음: 제목과 내용이 분명해 판단이 확실함 / 중간: 대체로 맞지만 일부 추측 / 낮음: 내용이 짧거나 애매함

[PARA]
projects 지금 논문에 바로 쓸 자료 · areas 연구 분야 배경 지식·이론 · resources 나중에 참고할 일반 자료·방법론 · archives 관계 적어 보관만 할 자료

[원칙]
- 자료에 없는 내용·수치·저자는 지어내지 않는다. 학술적 문어체("~이다")로 쓴다.
- 앞부분만 받았을 수 있으므로, 확실하지 않으면 신뢰도를 낮춘다.`;

/** 비용을 아끼려고 제목 + 앞부분만 보낸다 */
const CLASSIFY_CHARS = 2000;

export async function classifySource(input: {
  title: string;
  type: string;
  origin: string;
  content: string;
  research: ResearchBasis;
}) {
  const client = await getClient();
  const content =
    input.content.length > CLASSIFY_CHARS ? `${input.content.slice(0, CLASSIFY_CHARS)}
…(앞부분만)` : input.content;
  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(classifySchema(input.research.outline)) },
    system: CLASSIFY_SYSTEM,
    messages: [
      {
        role: "user",
        content: `[연구 설정]
${basisText(input.research)}

[자료]
제목: ${input.title}
유형: ${input.type}
출처: ${input.origin || "(미확인)"}
내용:
${content || "(내용 없음)"}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("AI가 이 자료는 분류하지 않겠다고 했어요.");
  if (!response.parsed_output) throw new Error("AI 답변을 읽지 못했어요. 다시 시도해 주세요.");
  const o = response.parsed_output;
  return {
    relevance: Number(o.relevance),
    topic: matchTopic(o.topic, input.research.outline),
    keywords: o.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 8),
    reason: o.reason.trim(),
    confidence: o.confidence,
    para: o.para,
    summary: o.summary.trim(),
  };
}
