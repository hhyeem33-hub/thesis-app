// 화면(입력 중 바로 안내)과 서버(저장 직전 재확인) 양쪽에서 같이 쓰는 이름 검사

// 윈도우 폴더 이름에 못 쓰는 문자 + 옵시디언 링크를 깨뜨리는 문자(# ^ [ ])
const INVALID_CHARS = /[<>:"/\\|?*#^[\]\u0000-\u001f]/g;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export const MAX_NAME_LENGTH = 60;

export function validateProjectName(
  raw: string,
  existingNames: string[]
): string | null {
  const name = raw.trim();
  if (!name) return "프로젝트 이름을 입력해 주세요.";
  if (name.length > MAX_NAME_LENGTH)
    return `이름은 ${MAX_NAME_LENGTH}자 이내로 입력해 주세요.`;

  const bad = name.match(INVALID_CHARS);
  if (bad) {
    const shown = [...new Set(bad)]
      .map((c) => (c.charCodeAt(0) < 32 ? "(제어 문자)" : c))
      .join(" ");
    return `폴더 이름에 쓸 수 없는 문자가 있어요: ${shown}`;
  }
  if (/[. ]$/.test(name))
    return "이름은 마침표(.)나 공백으로 끝날 수 없어요.";
  if (RESERVED_NAMES.test(name))
    return "윈도우에서 예약된 이름이라 폴더로 만들 수 없어요.";
  if (existingNames.some((n) => n.toLowerCase() === name.toLowerCase()))
    return "같은 이름의 프로젝트가 이미 있어요.";
  return null;
}
