import { inflateRawSync } from "zlib";
import CFB from "cfb";
import JSZip from "jszip";

// 한글 파일(.hwpx · .hwp)에서 글자만 꺼낸다. 서식·그림은 버린다.

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** .hwpx = 압축 파일 안의 Contents/section0.xml, section1.xml … 의 <hp:t> 글자 */
export async function hwpxText(bytes: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const sections = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (!sections.length) throw new Error("한글(hwpx) 파일의 본문을 찾지 못했어요.");
  const paras: string[] = [];
  for (const name of sections) {
    const xml = await zip.files[name].async("string");
    for (const p of xml.split(/<\/hp:p>/)) {
      const text = [...p.matchAll(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g)]
        .map((m) => decodeXml(m[1].replace(/<[^>]+>/g, "")))
        .join("");
      if (text.trim()) paras.push(text.trim());
    }
  }
  return paras.join("\n\n");
}

// .hwp (한글 2002 이후, HWP 5.0 형식): 복합 문서 안의 BodyText/Section0… 를 풀어 PARA_TEXT 기록만 읽는다
const PARA_TEXT = 67; // HWPTAG_BEGIN(16) + 51
/** 1글자짜리 제어 문자 (나머지 제어 문자는 8글자 분량을 차지한다) */
const CHAR_CONTROLS = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);

function paraText(buf: Buffer, start: number, size: number) {
  let out = "";
  for (let i = start; i + 1 < start + size; i += 2) {
    const c = buf.readUInt16LE(i);
    if (c >= 32) out += String.fromCharCode(c);
    else if (CHAR_CONTROLS.has(c)) {
      if (c === 10 || c === 13) out += "\n";
    } else {
      if (c === 9) out += "\t";
      i += 14; // 나머지 7글자(14바이트) 건너뛰기
    }
  }
  return out;
}

function sectionText(raw: Buffer, compressed: boolean) {
  const buf = compressed ? inflateRawSync(raw) : raw;
  const paras: string[] = [];
  let pos = 0;
  while (pos + 4 <= buf.length) {
    const head = buf.readUInt32LE(pos);
    pos += 4;
    const tag = head & 0x3ff;
    let size = (head >>> 20) & 0xfff;
    if (size === 0xfff) {
      size = buf.readUInt32LE(pos);
      pos += 4;
    }
    if (tag === PARA_TEXT) {
      const t = paraText(buf, pos, size).trim();
      if (t) paras.push(t);
    }
    pos += size;
  }
  return paras.join("\n\n");
}

export function hwpText(bytes: Buffer): string {
  let cfb: CFB.CFB$Container;
  try {
    // type "buffer" 는 일부 파일에서 cfb 내부 오류가 나서 Uint8Array 로 읽는다
    cfb = CFB.read(new Uint8Array(bytes), { type: "array" });
  } catch {
    throw new Error("한글(hwp) 파일이 아니거나 너무 오래된 형식이에요. 한글에서 .hwpx 로 저장해 올려 주세요.");
  }
  // CFB.find 는 일부 파일에서 오류가 나서 경로로 직접 찾는다
  const stream = (name: string) => {
    const i = cfb.FullPaths.findIndex((p) => p.replace(/^Root Entry/, "").toLowerCase() === `/${name}`.toLowerCase());
    const content = i >= 0 ? cfb.FileIndex[i]?.content : undefined;
    return content && content.length ? Buffer.from(content as Uint8Array) : null;
  };
  const header = stream("FileHeader");
  if (!header) throw new Error("한글(hwp) 파일이 아니거나 너무 오래된 형식이에요. 한글에서 .hwpx 로 저장해 올려 주세요.");
  const props = header.readUInt32LE(36);
  const compressed = (props & 1) === 1;
  if (props & 2) throw new Error("암호가 걸린 한글 파일은 읽을 수 없어요.");

  const sections = cfb.FullPaths.map((p, i) => ({ p, e: cfb.FileIndex[i] }))
    .filter(({ p, e }) => /\/BodyText\/Section\d+$/i.test(p) && e?.content?.length)
    .sort((a, b) => Number(a.p.match(/\d+$/)![0]) - Number(b.p.match(/\d+$/)![0]));
  let text = "";
  try {
    text = sections.map(({ e }) => sectionText(Buffer.from(e.content as Uint8Array), compressed)).join("\n\n").trim();
  } catch {
    // 본문이 깨졌으면 아래 미리보기 글자로
  }
  if (text) return text;

  // 배포용 문서처럼 본문을 못 읽으면 "미리보기 글자"(앞부분)라도
  const prv = stream("PrvText");
  const preview = prv ? prv.toString("utf16le").replace(/\0/g, "").trim() : "";
  if (preview) return `${preview}\n\n[보완 필요: 배포용 문서라 앞부분만 읽었어요]`;
  throw new Error("한글(hwp) 파일에서 글자를 찾지 못했어요. 한글에서 .hwpx 로 저장해 올려 주세요.");
}
