// 화면을 옮길 때마다 새로 그려지는 틀: 내용이 부드럽게 떠오르며 나타난다 (globals.css 의 .animate-page)
export default function MainTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page flex flex-1 flex-col">{children}</div>;
}
