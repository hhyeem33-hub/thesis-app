import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "서비스 약관 — 논문작업실" };

export default function TermsPage() {
  return (
    <LegalPage title="서비스 약관" updated="2026년 11월 18일">
      <section>
        <h2>1. 서비스</h2>
        <p>
          논문작업실은 학위논문 작업(자료 수집, AI 판단, 원고 작성, 한국외대 학위논문 양식 출력)을 돕는 무료 웹 서비스로,
          한국외국어대학교 대학원 한중문화학과 석사과정 박예은이 대학 과제로 운영합니다.
        </p>
      </section>
      <section>
        <h2>2. 계정</h2>
        <ul>
          <li>구글 계정 또는 이메일로 로그인해 쓸 수 있으며, 이용자마다 따로 된 빈 작업 공간이 주어집니다.</li>
          <li>계정과 비밀번호 관리는 이용자 본인의 책임입니다.</li>
        </ul>
      </section>
      <section>
        <h2>3. AI 기능과 비용</h2>
        <ul>
          <li>AI 기능(자료 판단·초안)은 이용자가 설정에 넣은 자기 Claude API 키로 동작하며, 그 비용은 키 주인이 부담합니다.</li>
          <li>키가 없으면 AI 대신 연구 설정 키워드를 바탕으로 한 규칙 기반 판단만 제공합니다.</li>
          <li>AI가 만든 판단·초안은 참고용이며, 사실 확인과 최종 결정은 이용자(연구자)가 해야 합니다.</li>
        </ul>
      </section>
      <section>
        <h2>4. 이용자의 자료</h2>
        <ul>
          <li>이용자가 넣은 자료와 원고의 권리는 이용자에게 있습니다.</li>
          <li>저작권이 있는 자료는 연구 목적의 정당한 범위에서 이용해 주세요. 공유 링크로 다른 사람에게 보여 줄 때도 같습니다.</li>
        </ul>
      </section>
      <section>
        <h2>5. 금지 행위</h2>
        <p>다른 사람의 계정 사용, 서비스에 대한 공격·과도한 자동 요청, 불법 자료의 저장·공유를 금지합니다.</p>
      </section>
      <section>
        <h2>6. 책임의 한계</h2>
        <p>
          서비스는 과제용으로 제공되며 중단되거나 바뀔 수 있습니다. 중요한 원고는 HWPX·워드 등으로 내려받아 따로 보관해 주세요.
        </p>
      </section>
      <section>
        <h2>7. 개인정보</h2>
        <p>개인정보 처리는 개인정보처리방침을 따릅니다.</p>
      </section>
    </LegalPage>
  );
}
