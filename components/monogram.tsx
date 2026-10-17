import Image from "next/image";

/** The supplied artwork is framed in CSS without changing its pixels. */
export function Monogram() {
  return (
    <span className="monogram" aria-hidden="true">
      <Image
        src="/brand/ti-monogram.png"
        alt=""
        width={1254}
        height={1254}
        sizes="160px"
      />
    </span>
  );
}
