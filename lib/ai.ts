import { promises as fs } from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// ⚠️ API 키 보호
// - 버셀에서는 환경 변수 ANTHROPIC_API_KEY 를 쓴다 (코드·깃허브에 키를 넣지 않음).
// - 내 컴퓨터에서는 설정 화면에서 넣은 키를 data/ai-key.json 에 저장한다.
//   data/*.json 은 .gitignore 에 있어서 깃허브에 올라가지 않는다.
// - 키 원문은 절대 화면(브라우저)으로 보내지 않는다. 끝 4자리만 보여 준다.

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

async function getApiKey(): Promise<string> {
  return envApiKey() || (await readSavedKey());
}

export async function getAiKeyStatus(): Promise<AiKeyStatus> {
  const envKey = envApiKey();
  if (envKey) return { source: "env", last4: envKey.slice(-4) };
  const saved = await readSavedKey();
  return saved ? { source: "saved", last4: saved.slice(-4) } : { source: "none" };
}

export async function saveApiKey(apiKey: string) {
  await fs.mkdir(path.dirname(KEY_FILE), { recursive: true });
  await fs.writeFile(KEY_FILE, JSON.stringify({ apiKey }, null, 2) + "\n", "utf8");
}

export async function deleteApiKey() {
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

export async function writeDraft(input: { topic: string; purpose: string; method: string }) {
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
연구 방법: ${input.method || "(적지 않음 — 주제에 맞게 제안)"}`,
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
