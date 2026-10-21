import { CopilotChat } from "@/components/copilot/chat";

export const metadata = { title: "Copilot · acezilla" };

export default function Copilot() {
  return (
    <>
      <div>
        <div className="eyebrow">Overview</div>
        <h1 className="page">Copilot</h1>
        <p className="sub">Ask a question about your sales, ads, Allegro offers or SEO and get an answer with the numbers behind it.</p>
      </div>
      <CopilotChat />
    </>
  );
}
