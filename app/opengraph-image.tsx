import { ImageResponse } from "next/og";
export const alt = "Tudor Iacob — AI Engineer & Python Developer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        background: "#1c1c1c",
        color: "#e8e6da",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: 80,
        justifyContent: "center",
      }}
    >
      <div style={{ fontSize: 26, color: "#c3ce7c", marginBottom: 30 }}>
        TUDOR IACOB / AI ENGINEER
      </div>
      <div style={{ fontSize: 76, letterSpacing: -4 }}>
        Intelligent systems.
      </div>
      <div style={{ fontSize: 76, color: "#c3ce7c", letterSpacing: -4 }}>
        Real-world solutions.
      </div>
      <div style={{ fontSize: 24, marginTop: 40, color: "#bdbfaf" }}>
        Python · LLMs · AI Agents · Automation
      </div>
    </div>,
    size,
  );
}
