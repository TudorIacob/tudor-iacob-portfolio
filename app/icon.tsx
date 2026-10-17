import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 128, height: 128 };
export const contentType = "image/png";

export default async function Icon() {
  const artwork = await readFile(
    join(process.cwd(), "public/brand/ti-monogram.png"),
  );
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: 128,
        height: 128,
        overflow: "hidden",
        position: "relative",
        background: "#1c1c1c",
      }}
    >
      {/* ImageResponse renders embedded artwork directly, outside the page image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        src={`data:image/png;base64,${artwork.toString("base64")}`}
        width={376.2}
        height={376.2}
        style={{ position: "absolute", left: -119, top: -124 }}
      />
    </div>,
    size,
  );
}
