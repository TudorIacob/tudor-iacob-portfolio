"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import {
  contactSchema,
  contactErrors,
  type ContactErrors,
} from "@/lib/contact-schema";

export function ContactForm() {
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [busy, setBusy] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  const pending = useRef(false);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => {
    if (succeeded) confirmationRef.current?.focus({ preventScroll: true });
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      const field = formRef.current?.elements.namedItem("name");
      if (field instanceof HTMLElement) field.focus({ preventScroll: true });
    }
  }, [succeeded]);
  const errorProps = (field: keyof ContactErrors) => ({
    "aria-invalid": !!errors[field],
    "aria-describedby": errors[field] ? `contact-${field}-error` : undefined,
  });
  const fieldError = (field: keyof ContactErrors) =>
    errors[field] && (
      <span className="contact-field-error" id={`contact-${field}-error`}>
        {errors[field]}
      </span>
    );
  return (
    <div className="contact-form-stage" data-success={succeeded}>
      <form
        ref={formRef}
        className="contact-form"
        inert={succeeded}
        aria-hidden={succeeded}
        noValidate
        aria-busy={busy}
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending.current || succeeded) return;
          const form = event.currentTarget;
          const result = contactSchema.safeParse(
            Object.fromEntries(new FormData(form)),
          );
          setStatus("");
          setFailed(false);
          setErrors({});
          if (!result.success) {
            const nextErrors = contactErrors(result.error);
            setErrors(nextErrors);
            setFailed(true);
            setStatus("Please check the highlighted fields.");
            const first = Object.keys(nextErrors)[0];
            const field = form.elements.namedItem(first);
            if (field instanceof HTMLElement) field.focus();
            return;
          }
          pending.current = true;
          setBusy(true);
          const body = JSON.stringify(result.data);
          try {
            if (attempt.current?.body !== body)
              attempt.current = { body, key: crypto.randomUUID() };
            const response = await fetch("/api/contact", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": attempt.current.key,
              },
              body,
              signal: AbortSignal.timeout(25000),
            });
            if (response.status === 429) {
              const seconds = Number(response.headers.get("Retry-After"));
              const minutes = Math.ceil(
                Number.isFinite(seconds) && seconds > 0
                  ? Math.min(seconds, 3600) / 60
                  : 10,
              );
              setFailed(true);
              setStatus(
                `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
              );
              return;
            }
            const payload: unknown = await response.json();
            if (
              !response.ok ||
              !payload ||
              typeof payload !== "object" ||
              !("ok" in payload) ||
              payload.ok !== true
            )
              throw new Error("Delivery failed");
            form.reset();
            attempt.current = null;
            setSucceeded(true);
          } catch {
            setFailed(true);
            setStatus("Something went wrong. Please try again.");
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="contact-fields">
          <legend className="sr-only">Send Tudor a message</legend>
          <div className="form-row">
            <label>
              Name
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={100}
                placeholder="Your name"
                {...errorProps("name")}
              />
              {fieldError("name")}
            </label>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="you@company.com"
                {...errorProps("email")}
              />
              {fieldError("email")}
            </label>
          </div>
          <label>
            Company <span>(optional)</span>
            <input
              name="company"
              autoComplete="organization"
              maxLength={150}
              placeholder="Where you work"
              {...errorProps("company")}
            />
            {fieldError("company")}
          </label>
          <label>
            Message
            <textarea
              name="message"
              rows={4}
              required
              minLength={10}
              maxLength={5000}
              placeholder="Tell me about the problem you’re looking to solve…"
              {...errorProps("message")}
            />
            {fieldError("message")}
          </label>
          <div className="honeypot" aria-hidden="true">
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Sending..." : "Send message"}
            <ArrowUpRight size={17} aria-hidden="true" />
          </button>
        </fieldset>
        <p className="form-note">
          Your details are used only to respond to your enquiry.
        </p>
        <p role="alert" aria-atomic="true">
          {failed ? status : ""}
        </p>
      </form>
      <div
        className="contact-success"
        inert={!succeeded}
        aria-hidden={!succeeded}
      >
        <span className="contact-success-icon" aria-hidden="true">
          <Check size={28} strokeWidth={1.8} />
        </span>
        <h3
          ref={confirmationRef}
          tabIndex={-1}
          aria-describedby="contact-success-description"
        >
          Message received.
        </h3>
        <p id="contact-success-description">
          Thanks for getting in touch. Your message has been sent successfully,
          and I&apos;ll get back to you as soon as possible.
        </p>
        <button
          type="button"
          className="contact-success-reset"
          onClick={() => {
            setStatus("");
            setFailed(false);
            setErrors({});
            restoreFocus.current = true;
            setSucceeded(false);
          }}
        >
          Send another message <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
